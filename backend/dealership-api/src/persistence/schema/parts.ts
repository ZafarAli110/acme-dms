import { sql } from "drizzle-orm";
import { integer, snakeCase, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { auditColumns, softDeleteCheck } from "./columns/audit-columns";
import { money } from "./columns/money-column";

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
    ...auditColumns(),
  },
  (table) => [
    uniqueIndex("uq_parts_dealer_part_number")
      .on(table.dealerId, table.partNumber)
      .where(sql`NOT ${table.isDeleted}`),
    softDeleteCheck("parts", table),
  ],
);

export type Part = typeof parts.$inferSelect;
export type NewPart = typeof parts.$inferInsert;
