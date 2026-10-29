import {readFile} from 'node:fs/promises';
import {inflateRawSync} from 'node:zlib';

/** One sheet as the tests read it: every row's cell values as text, and which cells are dates (by their style). */
export interface XlsxSheet {
  name: string;
  rows: string[][];
  dateCells: boolean[][];
}

function parts(zip: Buffer): Map<string, string> {
  const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = zip.readUInt16LE(end + 10);
  let offset = zip.readUInt32LE(end + 16);
  const files = new Map<string, string>();
  for (let index = 0; index < count; index++) {
    const nameLength = zip.readUInt16LE(offset + 28);
    const name = zip.toString('utf8', offset + 46, offset + 46 + nameLength);
    const size = zip.readUInt32LE(offset + 20);
    const local = zip.readUInt32LE(offset + 42);
    const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    const data = zip.subarray(start, start + size);
    files.set(name, (zip.readUInt16LE(offset + 10) === 8 ? inflateRawSync(data) : data).toString('utf8'));
    offset += 46 + nameLength + zip.readUInt16LE(offset + 30) + zip.readUInt16LE(offset + 32);
  }
  return files;
}

function unescape(text: string): string {
  return text.replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&quot;', '"').replaceAll('&amp;', '&');
}

/** Reads a small .xlsx written by XlsxWorkbookWriter: for tests only, the whole file in memory. */
export async function readXlsxAsync(path: string): Promise<XlsxSheet[]> {
  const files = parts(await readFile(path));
  const dateStyle = '1'; // XlsxWorkbookWriter's date style
  const names = [...(files.get('xl/workbook.xml') ?? '').matchAll(/<sheet name="([^"]*)"/g)].map((m) =>
    unescape(m[1]!),
  );
  return names.map((name, index) => {
    const xml = files.get(`xl/worksheets/sheet${index + 1}.xml`) ?? '';
    const rows = [...xml.matchAll(/<row>([\s\S]*?)<\/row>/g)].map((row) =>
      [...row[1]!.matchAll(/<c([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)].map((cell) => ({
        value: unescape(/<(?:t|v)>([\s\S]*?)<\/(?:t|v)>/.exec(cell[2] ?? '')?.[1] ?? ''),
        isDate: new RegExp(`s="${dateStyle}"`).test(cell[1] ?? ''),
      })),
    );
    return {
      name,
      rows: rows.map((row) => row.map((cell) => cell.value)),
      dateCells: rows.map((row) => row.map((cell) => cell.isDate)),
    };
  });
}
