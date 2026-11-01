import { sql } from "drizzle-orm";
import { pgTable, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { auditColumns, softDeleteCheck } from "./columns/audit-columns";
import { money } from "./columns/money-column";

/**
 * A dealer's part catalogue. The master record is shared by the dealer's rooftops; each stocks it in
 * `part_inventories`. A part number is unique within the dealer: another dealer may use the same number.
 */
export const parts = pgTable(
  "parts",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    dealerId: uuid("dealer_id").notNull(),
    partNumber: varchar("part_number", { length: 50 }).notNull(),
    description: varchar("description", { length: 500 }).notNull(),
    unitPrice: money("unit_price").notNull(),
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
