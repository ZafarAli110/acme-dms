import { sql } from "drizzle-orm";
import { boolean, index, pgTable, uuid, varchar } from "drizzle-orm/pg-core";
import { auditColumns, softDeleteCheck } from "./columns/audit-columns";
import { parts } from "./parts";

export type PartPhotoStatus = "pending" | "ready" | "failed";

/** A photo of a part. The file is a document in document-api; `status` follows its processing. */
export const partPhotos = pgTable(
  "part_photos",
  {
    id: uuid()
      .primaryKey()
      .default(sql`uuidv7()`),
    dealerId: uuid().notNull(),
    partId: uuid()
      .notNull()
      .references(() => parts.id),
    documentId: uuid().notNull().unique("part_photos_document_id_unique"),
    originalFileName: varchar({ length: 255 }).notNull(),
    status: varchar({ length: 20 }).$type<PartPhotoStatus>().notNull(),
    failureReason: varchar({ length: 1000 }),
    isDefault: boolean().notNull(),
    ...auditColumns(),
  },
  (table) => [index("ix_part_photos_part").on(table.partId), softDeleteCheck("part_photos", table)],
);

export type PartPhoto = typeof partPhotos.$inferSelect;
export type NewPartPhoto = typeof partPhotos.$inferInsert;
