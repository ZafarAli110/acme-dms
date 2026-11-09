import { sql } from "drizzle-orm";
import { index, integer, snakeCase, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { auditColumns, softDeleteCheck } from "./columns/audit-columns";
import { money } from "./columns/money-column";
import { tsvector } from "./columns/tsvector-column";

/**
 * A dealer's part catalogue. The master record is shared by the dealer's rooftops; each stocks it in
 * `part_inventories`. A part number is unique within the dealer: another dealer may use the same number.
 */
export const parts = snakeCase.table(
  "parts",
  {
    id: uuid()
      .primaryKey()
      .default(sql`uuidv7()`),
    dealerId: uuid().notNull(),
    partNumber: varchar({ length: 50 }).notNull(),
    description: varchar({ length: 500 }).notNull(),
    /** Whole cents in code; dollars, `numeric(12, 2)`, in the database (docs/standards/money.md). */
    unitPriceCents: money("unit_price").notNull(),
    /**
     * Goes up by one with every change. It is the record's ETag: a save says which version it started from
     * (If-Match), and one that started from an older version is refused (412) instead of undoing someone's change.
     */
    version: integer().notNull().default(1),
    /**
     * The description's words for the parts search (ACME-123), kept by Postgres on every write: their base forms in
     * English ("pads" → "pad"), the small words ("for", "the") left out. Searched with `@@`, ranked with `ts_rank_cd`.
     */
    searchWords: tsvector()
      .notNull()
      .generatedAlwaysAs(sql`to_tsvector('english'::regconfig, "description")`),
    ...auditColumns(),
  },
  (table) => [
    // The parts search: words in the description, and any part of a part number, case ignored (ACME-123).
    index("ix_parts_search_words").using("gin", table.searchWords),
    index("ix_parts_part_number_trigram").using("gin", sql`upper(${table.partNumber}) gin_trgm_ops`),
    // Live parts by id with the columns the parts list's count, stock value and price sort read, so they are read from
    // the index alone (ACME-124). Its migration adds `INCLUDE (dealer_id, unit_price, part_number)` by hand: Drizzle
    // has no INCLUDE.
    index("ix_parts_live_price")
      .on(table.id)
      .where(sql`NOT ${table.isDeleted}`),
    uniqueIndex("uq_parts_dealer_part_number")
      .on(table.dealerId, table.partNumber)
      .where(sql`NOT ${table.isDeleted}`),
    softDeleteCheck("parts", table),
  ],
);

export type Part = typeof parts.$inferSelect;
export type NewPart = typeof parts.$inferInsert;
