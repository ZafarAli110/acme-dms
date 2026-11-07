import { snakeCase, uuid, varchar } from "drizzle-orm/pg-core";
import { instant } from "./columns/temporal-columns";
import type { PartPhotoStatus } from "./part-photos";

/**
 * What document-api said about a document before its photo was saved: the upload stores the file in document-api
 * first and saves the photo after, so the document's event can win the race. The upload's transaction applies it to
 * the photo it saves and deletes it. Bookkeeping like processed_messages: no audit columns and no soft delete.
 */
export const earlyDocumentOutcomes = snakeCase.table("early_document_outcomes", {
  documentId: uuid().primaryKey(),
  dealerId: uuid().notNull(),
  status: varchar({ length: 20 }).$type<Exclude<PartPhotoStatus, "pending">>().notNull(),
  failureReason: varchar({ length: 1000 }),
  receivedAt: instant().notNull(),
});
