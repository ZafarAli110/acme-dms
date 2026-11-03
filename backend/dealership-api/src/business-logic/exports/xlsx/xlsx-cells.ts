// The small pieces of SpreadsheetML (the XML inside an .xlsx) that XlsxWorkbookWriter builds cells from.

/** One day in milliseconds, for turning a date into Excel's day count. */
const DAY_MS = 24 * 60 * 60 * 1000;
/** Excel counts days from 30 December 1899 (its day 0); 1 January 1970, where Date.parse starts, is day 25,569. */
const UNIX_EPOCH_SERIAL = 25_569;

/** Text made safe to put inside XML: the five characters XML gives a meaning to are written as entities. */
export function escapeXml(text: string): string {
  return text.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch] ?? ch);
}

/** A text cell, written inline (no shared-strings table, so nothing grows with the row count). `style` is ' s="n"'. */
export function textCell(text: string, style = ""): string {
  return `<c t="inlineStr"${style}><is><t>${escapeXml(text)}</t></is></c>`;
}

/** A 'YYYY-MM-DD' date as Excel stores it: the number of days since its day 0, which a date style then shows. */
export function dateSerial(isoDate: string): number {
  return Date.parse(isoDate) / DAY_MS + UNIX_EPOCH_SERIAL;
}
