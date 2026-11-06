import type { Database } from "#persistence/unit-of-work/unit-of-work";
import type { XlsxColumn } from "./xlsx/xlsx-workbook-writer";

/** Whose rows an export reads: the dealer and the location it was asked for at. */
export interface ExportScope {
  dealerId: string;
  locationId: string;
}

/**
 * What one list's export reads, built from its request by that list's function in sources/ (export-sources.ts finds
 * it by kind). The count and the rows run in the same snapshot, so the total the user sees is the number of rows in
 * the file.
 * It lives here, not in business-logic-abstractions, because it holds database queries, and the abstractions may
 * depend on DTOs only: it is a contract inside this layer, between a list's export and the queue and the worker.
 */
export interface ExportSource {
  /** Offered to the browser when it saves the file. */
  fileName: string;
  sheetName: string;
  columns: XlsxColumn[];
  countAsync(db: Database): Promise<number>;
  /** The rows in the file's order, each an array in the columns' order: built with Drizzle, run as a stream. */
  rowsQuery(db: Database): { sql: string; params: unknown[] };
  /** The same request always has the same fingerprint: how an idempotency key spots a different request. */
  fingerprint: string;
}
