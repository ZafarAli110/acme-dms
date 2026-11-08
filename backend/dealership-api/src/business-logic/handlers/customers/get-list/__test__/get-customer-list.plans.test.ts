import { sql } from "drizzle-orm";
import type { PoolClient, QueryConfig } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ListQueryDto } from "#dto/paging/list-query.dto";
import { createDatabasePool } from "#persistence/unit-of-work/database-pool";
import { REQUEST_ROLE, UnitOfWorkFactory } from "#persistence/unit-of-work/unit-of-work.factory";
import { asRequest } from "#test-setup/postgres/as-request";
import { NORTHSIDE, NORTHWIND, RIVERSIDE, TEST_USER_ID } from "#test-setup/postgres/seed-kit";
import { createTestDatabaseAsync, type TestDatabase } from "#test-setup/postgres/test-database";
import { AT_NORTHSIDE } from "#test-setup/users/test-users";
import { GetCustomerListQueryHandler } from "../get-customer-list.query-handler";

/**
 * ACME-110: how Postgres runs the customer list's queries at a big location, as a request runs them (row-level security
 * on). Each test records the SQL the handler really sends, then asks for its plan: the indexes must serve it, and the
 * customers table is never read whole. Timing is the running system's job (`bun run sql:explain --as sam`); the plan is
 * what holds at any size, and what broke before (a sort by name sorted every row; a later page read every row before it).
 */
const AT_LOCATION = 120_000;

interface Recorded {
  text: string;
  values: unknown[];
  /** Run in a request's transaction (row-level security on), or as the table's owner (a search's ids and count). */
  asRequest: boolean;
}

interface Plan {
  /** The page's ids (it has a limit) or its rows: never a read of the whole table. The count is the planner's call. */
  isPage: boolean;
  nodes: PlanNode[];
}

interface PlanNode {
  "Node Type": string;
  "Relation Name"?: string;
  "Index Name"?: string;
  Plans?: PlanNode[];
}

function nodesOf(node: PlanNode): PlanNode[] {
  return [node, ...(node.Plans ?? []).flatMap(nodesOf)];
}

/**
 * A page never reads the table whole, and neither does the count (ACME-119): it stops at one row past the list's
 * depth, so whatever Postgres reads it from, a limit ends the read. Counting Northside exactly read all 1.6 million
 * rows on every page, and on a busy morning that took the whole database.
 */
function expectNoFullRead(plans: Plan[]): void {
  for (const { nodes } of plans.filter((plan) => plan.isPage)) {
    expect(nodes.filter((node) => node["Node Type"] === "Seq Scan" && node["Relation Name"] === "customers")).toEqual(
      [],
    );
  }
  for (const { nodes } of plans.filter((plan) => !plan.isPage)) {
    expect(nodes.some((node) => node["Node Type"] === "Limit")).toBe(true);
  }
}

function indexesUsed(plans: Plan[]): string[] {
  return [...new Set(plans.flatMap((plan) => plan.nodes.flatMap((node) => node["Index Name"] ?? [])))];
}

describe("the customer list's plans at a big location (ACME-110)", () => {
  let database: TestDatabase;
  let factory: UnitOfWorkFactory;
  let pool: ReturnType<typeof createDatabasePool>;
  const recorded: Recorded[] = [];

  beforeAll(async () => {
    database = await createTestDatabaseAsync();
    // 120,000 customers at Northside, 30,000 at Riverside, 2,000 deleted: names, statuses, cities and contact dates
    // spread as a real book's are, a few without a last contact.
    await database.db.execute(sql`
      insert into customers (dealer_id, location_id, first_name, surname, company_name, email, phone, city, status,
                             last_contact_date, created_at, created_by, updated_at, updated_by, is_deleted, deleted_at,
                             deleted_by)
      select ${NORTHWIND}::uuid,
             case when g <= ${AT_LOCATION} then ${NORTHSIDE}::uuid else ${RIVERSIDE}::uuid end,
             'First' || (g % 997), 'Surname' || lpad((g % 50000)::text, 5, '0'), null,
             'customer' || g || '@example.test', '+44 7700 ' || lpad(g::text, 6, '0'),
             (array['Leeds', 'York', 'Bradford', 'Harrogate', 'Wakefield'])[1 + g % 5],
             (array['active', 'active', 'active', 'prospect', 'inactive'])[1 + g % 5],
             case when g % 50 = 0 then null else date '2026-11-01' - (g % 1500) end,
             now(), ${TEST_USER_ID}::uuid, now(), ${TEST_USER_ID}::uuid, g % 75 = 0,
             case when g % 75 = 0 then now() end, case when g % 75 = 0 then ${TEST_USER_ID}::uuid end
      from generate_series(1, ${AT_LOCATION + 30_000}) as g`);
    // As autovacuum would on a real table: statistics for the planner, and the visibility map index-only scans need.
    await database.db.execute(sql`vacuum analyze customers`);

    pool = createDatabasePool(database.connectionString);
    // Each connection notes how its transaction began (with the request's role, or as the owner) and records every
    // query of customers it sends, with that.
    pool.on("connect", (client: PoolClient) => {
      const send = client.query.bind(client) as (...args: unknown[]) => unknown;
      let inRequestTransaction = false;
      (client as unknown as { query: (...args: unknown[]) => unknown }).query = (...args: unknown[]) => {
        const [config, values] = args;
        const text = typeof config === "string" ? config : (config as QueryConfig).text;
        // Drizzle sends `{ text }` with the values beside it; plain calls send them in the config.
        const params = Array.isArray(values)
          ? values
          : typeof config === "string"
            ? []
            : (config as QueryConfig).values;
        if (/^\s*begin\b/i.test(text)) {
          inRequestTransaction = text.includes("set_config('role'");
        } else if (/^\s*select\b/i.test(text) && /"customers"/.test(text)) {
          recorded.push({ text, values: (params as unknown[] | undefined) ?? [], asRequest: inRequestTransaction });
        }
        return send(...args);
      };
    });
    factory = new UnitOfWorkFactory(pool);
  }, 120_000);

  afterAll(async () => {
    await pool?.end();
    await database?.[Symbol.asyncDispose]();
  });

  /** The plans of every query the list ran for `query`, each as it ran: as the request, or as the owner. */
  async function plansAsync(query: ListQueryDto): Promise<Plan[]> {
    recorded.length = 0;
    await asRequest(new GetCustomerListQueryHandler(factory)).executeAsync(AT_NORTHSIDE, query);
    const queries = [...recorded];
    const plans: Plan[] = [];
    const client = await pool.connect();
    try {
      for (const { text, values, asRequest: inRequest } of queries) {
        await client.query("begin read only");
        if (inRequest) {
          // As the request's unit of work opens its transaction: the request role and Northside's scope.
          await client.query(
            "select set_config('role', $1, true), set_config('app.dealer_id', $2, true), " +
              "set_config('app.location_id', $3, true), set_config('app.user_id', $4, true)",
            [REQUEST_ROLE, NORTHWIND, NORTHSIDE, TEST_USER_ID],
          );
        }
        const result = await client.query<{ "QUERY PLAN": { Plan: PlanNode }[] }>(
          `explain (format json) ${text}`,
          values,
        );
        await client.query("rollback");
        plans.push({ isPage: !/count\(\*\)/i.test(text), nodes: nodesOf(result.rows[0]!["QUERY PLAN"][0]!.Plan) });
      }
      return plans;
    } finally {
      client.release();
    }
  }

  it("serves page 1 in the list's own order from the name index", async () => {
    const plans = await plansAsync({ page: 1, pageSize: 25 });

    expectNoFullRead(plans);
    expect(indexesUsed(plans)).toContain("ix_customers_list_by_name");
  });

  // A list goes 10,000 rows deep (pageOffset): its deepest page skips 9,975 customers, in the index.
  it("reaches the deepest page through the index alone, not by reading every customer before it", async () => {
    const plans = await plansAsync({ page: 400, pageSize: 25 });

    expectNoFullRead(plans);
    const skipping = plans
      .flatMap((plan) => plan.nodes)
      .filter((node) => node["Index Name"] === "ix_customers_list_by_name");
    expect(skipping.some((node) => node["Node Type"] === "Index Only Scan")).toBe(true);
  });

  it("sorts by name, either way, from the index: never by sorting the whole location", async () => {
    for (const direction of ["asc", "desc"] as const) {
      const plans = await plansAsync({ page: 2, pageSize: 25, sort: "name", direction });

      expectNoFullRead(plans);
      // One sort at most: of the page's 25 rows, after they are fetched, never of the location.
      const page = plans.find((plan) => plan.isPage)!;
      expect(page.nodes.filter((node) => node["Node Type"] === "Sort").length).toBeLessThanOrEqual(1);
      expect(indexesUsed(plans)).toContain("ix_customers_list_by_name");
    }
  });

  it("sorts by last contact, newest first, from its index", async () => {
    const plans = await plansAsync({ page: 1, pageSize: 25, sort: "lastContactDate", direction: "desc" });

    expectNoFullRead(plans);
    expect(indexesUsed(plans)).toContain("ix_customers_list_by_last_contact");
  });

  it("filters a page by status or city without reading the table whole", async () => {
    for (const filter of [
      { filterField: "status", filterOperator: "is", filterValue: "prospect" },
      { filterField: "city", filterOperator: "equals", filterValue: "York" },
    ] as const) {
      const plans = await plansAsync({ page: 1, pageSize: 25, ...filter });

      expectNoFullRead(plans);
    }
  });

  it("counts Northside up to 10,001, not its 118,400 live customers", async () => {
    recorded.length = 0;
    const page = await asRequest(new GetCustomerListQueryHandler(factory)).executeAsync(AT_NORTHSIDE, {
      page: 1,
      pageSize: 25,
    });

    expect(page.total).toBe(10_001);
  });

  // ILIKE is not leakproof: under the policy no index can serve it, so a text filter is found as the owner with the
  // scope written out (as a search is). `=` is, so a status filter stays under the policy.
  it("finds a text filter's ids and count as the owner, and keeps a status filter under the policy", async () => {
    await plansAsync({ page: 1, pageSize: 25, filterField: "city", filterOperator: "equals", filterValue: "York" });
    const city = recorded.filter((query) => !/"id" in|"id" = any/i.test(query.text));
    await plansAsync({ page: 1, pageSize: 25, filterField: "status", filterOperator: "is", filterValue: "prospect" });
    const status = [...recorded];

    expect(city.length).toBeGreaterThan(0);
    expect(city.every((query) => !query.asRequest)).toBe(true);
    expect(status.every((query) => query.asRequest)).toBe(true);
  });

  it("finds a surname, and counts the matches, through the trigram index", async () => {
    const plans = await plansAsync({ page: 1, pageSize: 25, search: "Surname04217" });

    expectNoFullRead(plans);
    const count = plans.find((plan) => !plan.isPage)!;
    expect(count.nodes.some((node) => node["Index Name"] === "ix_customers_search")).toBe(true);
  });
});
