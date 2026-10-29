import type {Database} from '#persistence/unit-of-work/unit-of-work';
import type {XlsxColumn} from './xlsx-workbook-writer';

/**
 * What one list's export reads, given to the runner by that list's start handler. The count and the rows run in the
 * same snapshot, so the total the user sees is the number of rows in the file.
 */
export interface ExportSource {
  /** Offered to the browser when it saves the file. */
  fileName: string;
  sheetName: string;
  columns: XlsxColumn[];
  countAsync(db: Database): Promise<number>;
  /** The rows in the file's order, each an array in the columns' order: built with Drizzle, run as a stream. */
  rowsQuery(db: Database): {sql: string; params: unknown[]};
  /** The same request always has the same fingerprint: how an idempotency key spots a different request. */
  fingerprint: string;
}
