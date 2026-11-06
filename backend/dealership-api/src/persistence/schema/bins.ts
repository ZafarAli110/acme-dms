import { sql } from "drizzle-orm";
import { index, snakeCase, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { auditColumns, softDeleteCheck } from "./columns/audit-columns";

/** A shelf or bin at one rooftop of a dealer, where that rooftop keeps parts. */
export const bins = snakeCase.table(
  "bins",
  {
    id: uuid()
      .primaryKey()
      .default(sql`uuidv7()`),
    dealerId: uuid().notNull(),
    locationId: uuid().notNull(),
    code: varchar({ length: 20 }).notNull(),
    description: varchar({ length: 100 }).notNull(),
    ...auditColumns(),
  },
  (table) => [
    index("ix_bins_location").on(table.locationId),
    uniqueIndex("uq_bins_location_code")
      .on(table.locationId, table.code)
      .where(sql`NOT ${table.isDeleted}`),
    softDeleteCheck("bins", table),
  ],
);

export type Bin = typeof bins.$inferSelect;
export type NewBin = typeof bins.$inferInsert;
