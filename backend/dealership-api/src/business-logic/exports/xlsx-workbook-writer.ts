import {once} from 'node:events';
import {PassThrough, type Readable} from 'node:stream';
import yazl from 'yazl';

// A forward-only xlsx writer, the Node counterpart of OpenXmlWriter (SAX). Rows go straight into the zip as
// XML text; nothing about earlier rows is kept, so memory stays flat whatever the row count.

/** Excel's limit is 1,048,576 rows a sheet; one is the header. */
export const MAX_DATA_ROWS_PER_SHEET = 1_048_575;

export type XlsxCellKind = 'text' | 'integer' | 'money' | 'date';

/** `width` is in Excel's units (characters of the default font). */
export type XlsxColumn = {header: string; kind: XlsxCellKind; width: number};

/** A cell as text: dates as 'YYYY-MM-DD', numbers as their decimal text. */
export type XlsxRow = readonly (string | number | null)[];

const XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
/** Rows are joined into chunks of about this many characters before they are written. */
const CHUNK_CHARS = 256_000;
const DAY_MS = 86_400_000;
/** Excel's day 0 is 1899-12-30; 1970-01-01 is day 25569. */
const UNIX_EPOCH_SERIAL = 25_569;

// cellXfs indexes in STYLES: 0 normal, 1 date, 2 money, 3 bold (headers).
const STYLE_BY_KIND: Record<XlsxCellKind, string> = {text: '', integer: '', money: ' s="2"', date: ' s="1"'};
const STYLES =
  `${XML_DECLARATION}<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
  '<numFmts count="1"><numFmt numFmtId="164" formatCode="dd mmm yyyy"/></numFmts>' +
  '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
  '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
  '<borders count="1"><border/></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="4">' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
  '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
  '<xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
  '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
  '</cellXfs>' +
  '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
  '</styleSheet>';

function escapeXml(text: string): string {
  return text.replace(/[&<>"]/g, (ch) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'})[ch] ?? ch);
}

function textCell(text: string, style = ''): string {
  return `<c t="inlineStr"${style}><is><t>${escapeXml(text)}</t></is></c>`;
}

function dateSerial(isoDate: string): number {
  return Date.parse(isoDate) / DAY_MS + UNIX_EPOCH_SERIAL;
}

/** Writes rows into sheets of at most MAX_DATA_ROWS_PER_SHEET, each with a bold header row. */
export class XlsxWorkbookWriter {
  /** The .xlsx bytes, as they are produced. */
  public readonly output: Readable;
  private readonly _zip = new yazl.ZipFile();
  private readonly _columns: readonly XlsxColumn[];
  private readonly _sheetName: string;
  private readonly _sheetStartXml: string;
  private _sheet: PassThrough | null = null;
  private _sheetCount = 0;
  private _rowsInSheet = 0;
  private _chunk = '';

  public constructor(sheetName: string, columns: readonly XlsxColumn[]) {
    this._sheetName = sheetName;
    this._columns = columns;
    // Every sheet: the header row stays in view while scrolling (a frozen pane), columns get their widths, and the
    // header is bold.
    const widths = columns
      .map((column, index) => `<col min="${index + 1}" max="${index + 1}" width="${column.width}" customWidth="1"/>`)
      .join('');
    const header = `<row>${columns.map((column) => textCell(column.header, ' s="3"')).join('')}</row>`;
    this._sheetStartXml =
      `${XML_DECLARATION}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
      '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
      `<cols>${widths}</cols><sheetData>${header}`;
    // yazl types it as NodeJS.ReadableStream; at runtime it is a stream.PassThrough.
    this.output = this._zip.outputStream as Readable;
  }

  /** Waits while the reader is behind (backpressure), so a slow download never piles rows up in memory. */
  public async writeRowAsync(row: XlsxRow): Promise<void> {
    if (this._sheet === null || this._rowsInSheet === MAX_DATA_ROWS_PER_SHEET) {
      await this.closeSheetAsync();
      this.openSheet();
    }
    this._chunk += this.rowXml(row);
    this._rowsInSheet++;
    if (this._chunk.length > CHUNK_CHARS) {
      const sheet = this._sheet!;
      const chunk = this._chunk;
      this._chunk = '';
      if (!sheet.write(chunk)) {
        await once(sheet, 'drain');
      }
    }
  }

  public async finishAsync(): Promise<void> {
    if (this._sheet === null) {
      this.openSheet();
    }
    await this.closeSheetAsync();
    const sheets = Array.from({length: this._sheetCount}, (_, index) => index + 1);
    this.addPart(
      '[Content_Types].xml',
      `${XML_DECLARATION}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        sheets
          .map(
            (n) =>
              `<Override PartName="/xl/worksheets/sheet${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
          )
          .join('') +
        '</Types>',
    );
    this.addPart(
      '_rels/.rels',
      `${XML_DECLARATION}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        '</Relationships>',
    );
    this.addPart(
      'xl/workbook.xml',
      `${XML_DECLARATION}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>` +
        sheets.map((n) => `<sheet name="${escapeXml(this.sheetTitle(n))}" sheetId="${n}" r:id="rId${n}"/>`).join('') +
        '</sheets></workbook>',
    );
    this.addPart(
      'xl/_rels/workbook.xml.rels',
      `${XML_DECLARATION}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        sheets
          .map(
            (n) =>
              `<Relationship Id="rId${n}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${n}.xml"/>`,
          )
          .join('') +
        `<Relationship Id="rId${this._sheetCount + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
        '</Relationships>',
    );
    this.addPart('xl/styles.xml', STYLES);
    this._zip.end();
  }

  /**
   * Stops early (the client went away, or the query failed). The streams are destroyed without an error on purpose:
   * nothing listens for 'error' on them, and an unheard 'error' event ends the whole process, not just this download.
   */
  public abort(): void {
    this._sheet?.destroy();
    this.output.destroy();
  }

  private openSheet(): void {
    this._sheetCount++;
    this._rowsInSheet = 0;
    this._sheet = new PassThrough();
    this._zip.addReadStream(this._sheet, `xl/worksheets/sheet${this._sheetCount}.xml`);
    this._sheet.write(this._sheetStartXml);
  }

  private async closeSheetAsync(): Promise<void> {
    if (this._sheet === null) {
      return;
    }
    const sheet = this._sheet;
    this._sheet = null;
    sheet.end(`${this._chunk}</sheetData></worksheet>`);
    this._chunk = '';
    await once(sheet, 'end');
  }

  private sheetTitle(n: number): string {
    return this._sheetCount === 1 ? this._sheetName : `${this._sheetName} ${n}`;
  }

  private rowXml(row: XlsxRow): string {
    let cells = '';
    for (let index = 0; index < this._columns.length; index++) {
      const value = row[index] ?? null;
      const kind = this._columns[index]!.kind;
      if (value === null) {
        cells += '<c/>';
      } else if (kind === 'text') {
        cells += textCell(String(value));
      } else if (kind === 'date') {
        cells += `<c${STYLE_BY_KIND.date}><v>${dateSerial(String(value))}</v></c>`;
      } else {
        cells += `<c${STYLE_BY_KIND[kind]}><v>${value}</v></c>`;
      }
    }
    return `<row>${cells}</row>`;
  }

  private addPart(name: string, xml: string): void {
    this._zip.addBuffer(Buffer.from(xml), name);
  }
}
