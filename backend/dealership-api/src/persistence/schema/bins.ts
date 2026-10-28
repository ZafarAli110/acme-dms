import {sql} from 'drizzle-orm';
import {index, pgTable, uniqueIndex, uuid, varchar} from 'drizzle-orm/pg-core';
import {auditColumns, softDeleteCheck} from './columns/audit-columns';

/** A shelf or bin at one rooftop, where that rooftop keeps parts. */
export const bins = pgTable(
  'bins',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuidv7()`),
    locationId: uuid('location_id').notNull(),
    code: varchar('code', {length: 20}).notNull(),
    description: varchar('description', {length: 100}).notNull(),
    ...auditColumns(),
  },
  (table) => [
    index('ix_bins_location').on(table.locationId),
    uniqueIndex('uq_bins_location_code')
      .on(table.locationId, table.code)
      .where(sql`NOT ${table.isDeleted}`),
    softDeleteCheck('bins', table),
  ],
);

export type Bin = typeof bins.$inferSelect;
export type NewBin = typeof bins.$inferInsert;
