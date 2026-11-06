import { type SQL, sql } from "drizzle-orm";
import type { AnyPgColumn, PgTable } from "drizzle-orm/pg-core";
import type { Database } from "#persistence/unit-of-work/unit-of-work";
import { updatedAudit } from "./audit-fields";

/**
 * Marks the rows matching `where` deleted, by `userId` at `at`; they stay in the table and leave every read of a request.
 * Reads leave deleted rows out by themselves (a restrictive row-level security policy per table, the `soft_delete_policies` migration), and
 * marking a row deleted would be refused for the same reason (the changed row is no longer visible), so this is the one
 * place that lifts the filter, for this one statement. A handler never sets `isDeleted` itself.
 */
export async function softDeleteAsync<TTable extends PgTable & { isDeleted: AnyPgColumn }>(
  db: Database,
  table: TTable,
  where: SQL,
  userId: string,
  at: Temporal.Instant,
): Promise<void> {
  await db.execute(sql`select set_config('app.soft_deleting', 'on', true)`);
  try {
    await db
      .update(table)
      // The audit columns are the same on every business table (persistence/schema/columns/audit-columns.ts).
      .set({ isDeleted: true, deletedAt: at, deletedBy: userId, ...updatedAudit(userId, at) } as never)
      .where(where);
  } finally {
    await db.execute(sql`select set_config('app.soft_deleting', '', true)`);
  }
}
