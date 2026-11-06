import { and, eq, type SQL, sql } from "drizzle-orm";
import type { AnyPgColumn, PgTable, PgUpdateSetSource } from "drizzle-orm/pg-core";
import { currentDataScope } from "#request-scope/data-scope";
import type { Database } from "#persistence/unit-of-work/unit-of-work";
import { updatedAudit } from "./audit-fields";

/** A table that can be soft-deleted and belongs to a dealer (every business table does). */
type SoftDeletable = PgTable & { isDeleted: AnyPgColumn; dealerId: AnyPgColumn; locationId?: AnyPgColumn };

/**
 * Marks the rows matching `where` deleted, by `userId` at `at`; they stay in the table and leave every read of a request.
 *
 * Reads leave deleted rows out by themselves (a restrictive row-level security policy per table, `NOT is_deleted`), and
 * the same policy refuses an UPDATE whose changed row is no longer visible, which is what marking a row deleted is. So
 * this one statement runs without the request's role, and names the request's dealer (and location, for a table that has
 * one) itself, as code outside a request does: the policy that would have said it is the thing in the way. The rest of the
 * transaction keeps the role. A handler never sets `isDeleted` itself, and never needs more than the rows' own condition
 * in `where` (an id, a parent).
 *
 * The policy is a plain `NOT is_deleted` (not "or a setting says otherwise") so the planner can prove it implies a
 * partial index's `WHERE` and use that index: a policy with an `OR` made every partial index unusable for a request.
 */
export async function softDeleteAsync<TTable extends SoftDeletable>(
  db: Database,
  table: TTable,
  where: SQL | undefined,
  userId: string,
  at: Temporal.Instant,
): Promise<void> {
  const scope = currentDataScope();
  if (!scope) {
    throw new Error("A soft delete needs the request's data scope: it names the dealer and the location itself.");
  }
  const locationCondition = table.locationId
    ? scope.locationId === null
      ? sql`false`
      : eq(table.locationId, scope.locationId)
    : undefined;
  const mine = and(eq(table.dealerId, scope.dealerId), locationCondition, where);

  const [{ role }] = (await db.execute<{ role: string }>(sql`select current_setting('role') as role`)).rows as [
    { role: string },
  ];
  await db.execute(sql`reset role`);
  const values = { isDeleted: true, deletedAt: at, deletedBy: userId, ...updatedAudit(userId, at) };
  await db
    .update(table)
    .set(values as PgUpdateSetSource<TTable>)
    .where(mine);
  // Back to what the transaction was: if the statement failed the transaction is aborted and none of this matters.
  if (role !== "none") {
    await db.execute(sql`select set_config('role', ${role}, true)`);
  }
}
