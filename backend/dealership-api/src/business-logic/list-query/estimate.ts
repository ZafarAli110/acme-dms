import { type SQL, sql } from "drizzle-orm";
import type { Database } from "#persistence/unit-of-work/unit-of-work";

interface ExplainedPlan {
  Plan: { "Plan Rows": number };
}

/**
 * How many rows Postgres expects `query` to return, from its statistics: `EXPLAIN`, which plans the query and runs
 * nothing (about a millisecond, whatever the table's size). Run in the request's transaction, so row-level security's
 * scope is in the estimate (ACME-129). Close for the whole list and a status filter (the `st_customers_scope`
 * statistics); far off for a search, so a search never shows it.
 */
export async function estimateRowsAsync(db: Database, query: SQL | { getSQL(): SQL }): Promise<number> {
  const result = await db.execute<{ "QUERY PLAN": ExplainedPlan[] }>(sql`explain (format json) ${query}`);
  const plan = result.rows[0]?.["QUERY PLAN"][0]?.Plan;
  return Math.round(plan?.["Plan Rows"] ?? 0);
}
