import { sql } from "drizzle-orm";
import { bigint, check, index, integer, jsonb, snakeCase, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import type { ExportJobStatus, ExportKind } from "#dto/exports/export-job-response.dto";
import type { ExportRequestDto } from "#dto/exports/export-request.dto";
import { instant } from "./columns/temporal-columns";

/**
 * The export queue: one row per export a user asked for, from waiting in line to its file expiring. The API inserts
 * and reads rows; the export worker claims them, writes the file and records how far it has got.
 * An operational table like processed_messages, not a business record: no audit columns and no soft delete. A row is
 * deleted outright once its file has long expired (the worker's sweeper), and `owner_id` and `created_at` already say
 * who asked and when.
 */
export const exportJobs = snakeCase.table(
  "export_jobs",
  {
    id: uuid()
      .primaryKey()
      .default(sql`uuidv7()`),
    dealerId: uuid().notNull(),
    locationId: uuid().notNull(),
    /** The user who asked for it: only they can follow, cancel or download it. */
    ownerId: uuid().notNull(),
    /** Which list it is of: the export worker builds the file's queries from it and the stored request. */
    kind: text().$type<ExportKind>().notNull(),
    /** The request as it was validated: the columns with their headings, the search, the sort and the filter. */
    request: jsonb().$type<ExportRequestDto>().notNull(),
    fileName: text().notNull(),
    /** The same request always has the same fingerprint: how an idempotency key spots a different request. */
    fingerprint: text().notNull(),
    idempotencyKey: text(),
    status: text().$type<ExportJobStatus>().notNull(),
    rows: integer().notNull().default(0),
    totalRows: integer(),
    filePath: text(),
    fileBytes: bigint({ mode: "number" }),
    error: text(),
    /** How many times a worker has claimed it: a job abandoned twice is failed, not tried a third time. */
    attempts: integer().notNull().default(0),
    /** The worker running it, while it runs: a worker only writes to the jobs it still holds. */
    workerId: text(),
    /** Set by the API when the user cancels a running export; the worker stops at its next progress check. */
    cancelRequestedAt: instant(),
    createdAt: instant().notNull(),
    startedAt: instant(),
    /** When the first row was written: throughput counts from here, not from the wait for the sort. */
    firstRowAt: instant(),
    /** Written about once a second while it runs; a job whose heartbeat stops is taken back by the sweeper. */
    heartbeatAt: instant(),
    finishedAt: instant(),
    /** When the file is deleted; null until completed. */
    expiresAt: instant(),
  },
  (table) => [
    // A retry with the same key finds the export it started; the index is also what holds when two retries race.
    uniqueIndex("uq_export_jobs_owner_idempotency_key")
      .on(table.ownerId, table.idempotencyKey)
      .where(sql`${table.idempotencyKey} IS NOT NULL`),
    // The worker claims waiting jobs in the order they were asked for; the sweeper finds running and finished ones.
    index("ix_export_jobs_status_created").on(table.status, table.createdAt),
    // How many a dealer has running, for the fair claim and the per-dealer limit.
    index("ix_export_jobs_dealer_status").on(table.dealerId, table.status),
    // The values the queue and the worker move a job between (ExportJobStatus); the moves themselves are guarded by
    // their conditional updates.
    check(
      "ck_export_jobs_status",
      sql`${table.status} in ('queued', 'counting', 'writing', 'completed', 'failed', 'cancelled', 'expired')`,
    ),
  ],
);

export type ExportJobRow = typeof exportJobs.$inferSelect;
export type NewExportJobRow = typeof exportJobs.$inferInsert;
