import {pgTable, uuid} from 'drizzle-orm/pg-core';
import {instant} from './columns/temporal-columns';

/** The inbox: each message id a consumer has applied, so a second delivery changes nothing (docs/standards/messaging.md). */
export const processedMessages = pgTable('processed_messages', {
  messageId: uuid('message_id').primaryKey(),
  processedAt: instant('processed_at').notNull(),
});
