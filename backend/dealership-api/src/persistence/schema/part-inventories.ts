import {sql} from 'drizzle-orm';
import {index, integer, pgTable, uniqueIndex, uuid} from 'drizzle-orm/pg-core';
import {bins} from './bins';
import {auditColumns, softDeleteCheck} from './columns/audit-columns';
import {parts} from './parts';

/** A part as one rooftop stocks it: its bin there, how many are on hand, and when to reorder. */
export const partInventories = pgTable(
  'part_inventories',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuidv7()`),
    locationId: uuid('location_id').notNull(),
    partId: uuid('part_id')
      .notNull()
      .references(() => parts.id),
    binId: uuid('bin_id')
      .notNull()
      .references(() => bins.id),
    quantityOnHand: integer('quantity_on_hand').notNull(),
    reorderLevel: integer('reorder_level').notNull(),
    ...auditColumns(),
  },
  (table) => [
    index('ix_part_inventories_location').on(table.locationId),
    uniqueIndex('uq_part_inventories_location_part')
      .on(table.locationId, table.partId)
      .where(sql`NOT ${table.isDeleted}`),
    softDeleteCheck('part_inventories', table),
  ],
);

export type PartInventory = typeof partInventories.$inferSelect;
export type NewPartInventory = typeof partInventories.$inferInsert;
