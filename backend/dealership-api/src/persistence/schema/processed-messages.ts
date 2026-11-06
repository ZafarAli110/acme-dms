import { pgTable, uuid } from "drizzle-orm/pg-core";
import { instant } from "./columns/temporal-columns";

/** The inbox: each message id a consumer has applied, so a second delivery changes nothing. */
export const processedMessages = pgTable("processed_messages", {
  messageId: uuid().primaryKey(),
  processedAt: instant().notNull(),
});
