import {sql} from 'drizzle-orm';
import {boolean, index, pgTable, uuid, varchar} from 'drizzle-orm/pg-core';
import {auditColumns, softDeleteCheck} from './columns/audit-columns';
import {parts} from './parts';

export type PartPhotoStatus = 'pending' | 'ready' | 'failed';

/** A photo of a part. The file is a document in document-api; `status` follows its processing. */
export const partPhotos = pgTable(
  'part_photos',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuidv7()`),
    partId: uuid('part_id')
      .notNull()
      .references(() => parts.id),
    documentId: uuid('document_id').notNull().unique(),
    originalFileName: varchar('original_file_name', {length: 255}).notNull(),
    status: varchar('status', {length: 20}).$type<PartPhotoStatus>().notNull(),
    failureReason: varchar('failure_reason', {length: 1000}),
    isDefault: boolean('is_default').notNull(),
    ...auditColumns(),
  },
  (table) => [index('ix_part_photos_part').on(table.partId), softDeleteCheck('part_photos', table)],
);

export type PartPhoto = typeof partPhotos.$inferSelect;
export type NewPartPhoto = typeof partPhotos.$inferInsert;
