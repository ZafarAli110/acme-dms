// What is in an .xlsx file, without Excel: every sheet's row count, its header, its first and last rows, and each
// cell's type (text, number, date, boolean). For checking an export: `bun run xlsx:inspect <file> [--json]`.
// Sheets are streamed, so a million-row sheet is never held in memory.
import {openSync, readSync, fstatSync, closeSync, createReadStream} from 'node:fs';
import {inflateRawSync, createInflateRaw} from 'node:zlib';

interface Entry {
  name: string;
  method: number;
  compressedSize: number;
  dataOffset: number;
}

type CellType = 'text' | 'number' | 'date' | 'boolean' | 'empty';
interface Cell {
  value: string;
  type: CellType;
}
interface SheetReport {
  name: string;
  rows: number;
  header: Cell[];
  first: Cell[][];
  last: Cell[];
}

const [file, ...flags] = process.argv.slice(2);
if (!file) {
  console.error('Usage: bun run xlsx:inspect <file.xlsx> [--json]');
  process.exit(2);
}

// --- the zip: its central directory says where each part is ---

function readAt(fd: number, position: number, length: number): Buffer {
  const buffer = Buffer.alloc(length);
  readSync(fd, buffer, 0, length, position);
  return buffer;
}

function readEntries(path: string): Map<string, Entry> {
  const fd = openSync(path, 'r');
  try {
    const size = fstatSync(fd).size;
    const tail = readAt(fd, Math.max(0, size - 65_557), Math.min(size, 65_557));
    const end = tail.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    if (end < 0) {
      throw new Error('Not a zip file: an .xlsx is a zip, and this has no zip directory.');
    }
    const count = tail.readUInt16LE(end + 10);
    let offset = tail.readUInt32LE(end + 16);
    const entries = new Map<string, Entry>();
    for (let index = 0; index < count; index++) {
      const header = readAt(fd, offset, 46);
      const nameLength = header.readUInt16LE(28);
      const name = readAt(fd, offset + 46, nameLength).toString('utf8');
      const localOffset = header.readUInt32LE(42);
      const local = readAt(fd, localOffset, 30);
      entries.set(name, {
        name,
        method: header.readUInt16LE(10),
        compressedSize: header.readUInt32LE(20),
        dataOffset: localOffset + 30 + local.readUInt16LE(26) + local.readUInt16LE(28),
      });
      offset += 46 + nameLength + header.readUInt16LE(30) + header.readUInt16LE(32);
    }
    return entries;
  } finally {
    closeSync(fd);
  }
}

function readPart(path: string, entry: Entry): string {
  const fd = openSync(path, 'r');
  try {
    const data = readAt(fd, entry.dataOffset, entry.compressedSize);
    return (entry.method === 8 ? inflateRawSync(data) : data).toString('utf8');
  } finally {
    closeSync(fd);
  }
}

// --- the workbook: sheet names, shared strings, which styles are dates ---

const DATE_FORMAT_IDS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);

function decodeXml(text: string): string {
  return text
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&amp;', '&');
}

function dateStyles(stylesXml: string): Set<number> {
  const customDates = new Set<number>();
  for (const match of stylesXml.matchAll(/<numFmt [^>]*numFmtId="(\d+)"[^>]*formatCode="([^"]*)"/g)) {
    const code = (match[2] ?? '').replace(/"[^"]*"|\[[^\]]*\]/g, '');
    if (/[dmyh]/i.test(code)) {
      customDates.add(Number(match[1]));
    }
  }
  const cellXfs = /<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/.exec(stylesXml)?.[1] ?? '';
  const styles = new Set<number>();
  [...cellXfs.matchAll(/<xf [^>]*?numFmtId="(\d+)"/g)].forEach((match, index) => {
    const id = Number(match[1]);
    if (DATE_FORMAT_IDS.has(id) || customDates.has(id)) {
      styles.add(index);
    }
  });
  return styles;
}

function excelDate(serial: number): string {
  return new Date(Math.round((serial - 25_569) * 86_400_000)).toISOString().slice(0, 10);
}

function parseRow(rowXml: string, sharedStrings: string[], dates: Set<number>): Cell[] {
  const cells: Cell[] = [];
  for (const match of rowXml.matchAll(/<c((?:\s[^>]*?)?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const attributes = match[1] ?? '';
    const body = match[2] ?? '';
    const type = /\st="([^"]+)"/.exec(attributes)?.[1] ?? 'n';
    const style = Number(/\ss="(\d+)"/.exec(attributes)?.[1] ?? 0);
    const value = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
    if (type === 'inlineStr') {
      cells.push({
        value: decodeXml([...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join('')),
        type: 'text',
      });
    } else if (type === 's') {
      cells.push({value: sharedStrings[Number(value)] ?? '', type: 'text'});
    } else if (type === 'str') {
      cells.push({value: decodeXml(value ?? ''), type: 'text'});
    } else if (type === 'b') {
      cells.push({value: value === '1' ? 'TRUE' : 'FALSE', type: 'boolean'});
    } else if (value === undefined) {
      cells.push({value: '', type: 'empty'});
    } else if (dates.has(style)) {
      cells.push({value: excelDate(Number(value)), type: 'date'});
    } else {
      cells.push({value, type: 'number'});
    }
  }
  return cells;
}

/** Streams one sheet: counts its rows and keeps the first few and the last. */
async function inspectSheetAsync(
  path: string,
  name: string,
  entry: Entry,
  sharedStrings: string[],
  dates: Set<number>,
): Promise<SheetReport> {
  const stream = createReadStream(path, {start: entry.dataOffset, end: entry.dataOffset + entry.compressedSize - 1});
  const source = entry.method === 8 ? stream.pipe(createInflateRaw()) : stream;
  const report: SheetReport = {name, rows: 0, header: [], first: [], last: []};
  let carry = '';
  let lastRow = '';
  for await (const chunk of source as AsyncIterable<Buffer>) {
    carry += chunk.toString('utf8');
    let start = carry.indexOf('<row');
    while (start >= 0) {
      const end = carry.indexOf('</row>', start);
      const selfClosing = carry.indexOf('/>', start);
      const close = carry.indexOf('>', start);
      if (close >= 0 && selfClosing === close - 1 && (end < 0 || selfClosing < end)) {
        report.rows++;
        start = carry.indexOf('<row', close);
        continue;
      }
      if (end < 0) {
        break;
      }
      const rowXml = carry.slice(start, end);
      report.rows++;
      if (report.rows === 1) {
        report.header = parseRow(rowXml, sharedStrings, dates);
      } else if (report.first.length < 3) {
        report.first.push(parseRow(rowXml, sharedStrings, dates));
      }
      lastRow = rowXml;
      start = carry.indexOf('<row', end);
    }
    carry = start >= 0 ? carry.slice(start) : carry.slice(-16);
  }
  report.last = report.rows > 1 ? parseRow(lastRow, sharedStrings, dates) : [];
  return report;
}

const entries = readEntries(file);
const part = (name: string): string => {
  const entry = entries.get(name);
  return entry ? readPart(file, entry) : '';
};
const workbook = part('xl/workbook.xml');
const relations = part('xl/_rels/workbook.xml.rels');
const sharedStrings = [...part('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((match) =>
  decodeXml([...(match[1] ?? '').matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join('')),
);
const dates = dateStyles(part('xl/styles.xml'));

const sheets: SheetReport[] = [];
for (const match of workbook.matchAll(/<sheet [^>]*?name="([^"]*)"[^>]*?r:id="([^"]*)"/g)) {
  const target = new RegExp(`Id="${match[2]}"[^>]*Target="([^"]*)"`).exec(relations)?.[1] ?? '';
  const entry = entries.get(`xl/${target.replace(/^\/?xl\//, '')}`);
  if (entry) {
    sheets.push(await inspectSheetAsync(file, decodeXml(match[1] ?? ''), entry, sharedStrings, dates));
  }
}

const dataRows = sheets.reduce((sum, sheet) => sum + Math.max(0, sheet.rows - 1), 0);
if (flags.includes('--json')) {
  console.log(JSON.stringify({file, sheets, dataRows}, null, 2));
} else {
  const show = (cells: Cell[]): string => cells.map((cell) => `${cell.value} (${cell.type})`).join(' | ');
  console.log(`${file}: ${sheets.length} sheet(s), ${dataRows.toLocaleString('en-GB')} data rows`);
  for (const sheet of sheets) {
    console.log(`\nsheet "${sheet.name}": ${sheet.rows.toLocaleString('en-GB')} rows (header + data)`);
    console.log(`  header: ${sheet.header.map((cell) => cell.value).join(' | ')}`);
    sheet.first.forEach((row, index) => console.log(`  row ${index + 2}: ${show(row)}`));
    console.log(`  last:  ${show(sheet.last)}`);
  }
}
