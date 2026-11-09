import { sql } from "drizzle-orm";
import { check, index, jsonb, primaryKey, snakeCase, text, uuid } from "drizzle-orm/pg-core";
import { instant } from "./columns/temporal-columns";

/** Where a save with a key has got to (ACME-125). */
export type IdempotencyState = "running" | "committed" | "done";

/**
 * One save sent with an `Idempotency-Key` (ACME-125): the key a user's form keeps until its save is answered, so the
 * same save sent again is done once. A save claims its key before it runs (`running`, with a lease and a holder); its
 * own transaction marks it `committed`; its answer is stored after (`done`), and sent again to a save with the same key
 * and the same request. A technical table like processed_messages: no audit columns and no soft delete; a row is
 * deleted outright 24 hours after it was claimed (`IdempotencySweeper`).
 */
export const idempotencyRecords = snakeCase.table(
  "idempotency_records",
  {
    dealerId: uuid().notNull(),
    /** The user who sent it: a key is theirs, so another user's save with the same key is their own save. */
    userId: uuid().notNull(),
    key: text().notNull(),
    /** The request the key was first sent with (method, path, If-Match, body, files): another request is not replayed. */
    fingerprint: text().notNull(),
    state: text().$type<IdempotencyState>().notNull(),
    /** The save that holds the key: new on every claim and takeover; only its holder may mark it committed or done. */
    holder: uuid().notNull(),
    /** While `running`: past this, the save that held it is taken to have stopped, and a new one may take it over. */
    leaseUntil: instant().notNull(),
    /** The body the first save answered with, once `done`: sent again to the same request. */
    answer: jsonb(),
    /** Where the saved record is read (`/v1/customers/{id}`), when known: what "your first save went through" opens. */
    resource: text(),
    createdAt: instant().notNull(),
    /** After this the key is free: a save with it is a new save. */
    expiresAt: instant().notNull(),
  },
  (table) => [
    primaryKey({ name: "pk_idempotency_records", columns: [table.dealerId, table.userId, table.key] }),
    // The sweeper deletes the expired ones.
    index("ix_idempotency_records_expires_at").on(table.expiresAt),
    check("ck_idempotency_records_state", sql`${table.state} in ('running', 'committed', 'done')`),
  ],
);

export type IdempotencyRecordRow = typeof idempotencyRecords.$inferSelect;
