import {sql} from 'drizzle-orm';
import {pgTable, uniqueIndex, uuid, varchar} from 'drizzle-orm/pg-core';
import {auditColumns, softDeleteCheck} from './columns/audit-columns';
import {money} from './columns/money-column';

/** The client's part catalogue. The master record is shared by every rooftop; each stocks it in `part_inventories`. */
export const parts = pgTable(
  'parts',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuidv7()`),
    partNumber: varchar('part_number', {length: 50}).notNull(),
    description: varchar('description', {length: 500}).notNull(),
    unitPrice: money('unit_price').notNull(),
    ...auditColumns(),
  },
  (table) => [
    uniqueIndex('uq_parts_part_number')
      .on(table.partNumber)
      .where(sql`NOT ${table.isDeleted}`),
    softDeleteCheck('parts', table),
  ],
);

export type Part = typeof parts.$inferSelect;
export type NewPart = typeof parts.$inferInsert;
