import { eq, sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { bins } from "#persistence/schema/bins";
import { customers } from "#persistence/schema/customers";
import { exportJobs } from "#persistence/schema/export-jobs";
import { parts } from "#persistence/schema/parts";
import { type DataScope, runWithDataScope, setDataScope } from "#request-scope/data-scope";
import {
  CENTRAL,
  CITY_MOTORS,
  NORTHSIDE,
  NORTHWIND,
  RIVERSIDE,
  SEEDED_AT,
  TEST_USER_ID,
} from "#test-setup/postgres/seed-kit";
import { useTestDatabase } from "#test-setup/postgres/use-test-database";

const OTHER_USER = "30000000-0000-0000-0000-0000000000bb";
const AT_NORTHSIDE: DataScope = { dealerId: NORTHWIND, locationId: NORTHSIDE, userId: TEST_USER_ID };

/**
 * Postgres row-level security (the `row_level_security` migration), seen as a request sees it: every query below has no dealer, location
 * or user filter of its own, so only the database's policies keep other dealers' rows out.
 */
describe("row-level security", () => {
  const database = useTestDatabase();

  /** Runs `query` in a unit of work opened the way a request opens one: inside its data scope. */
  async function asRequestAsync<T>(
    scope: DataScope | null,
    query: (db: Awaited<ReturnType<typeof database.unitOfWorkFactory.beginAsync>>["db"]) => Promise<T>,
  ): Promise<T> {
    const run = async (): Promise<T> => {
      await using work = await database.unitOfWorkFactory.beginAsync();
      const result = await query(work.db);
      await work.commitAsync();
      return result;
    };
    if (scope === null) {
      return run();
    }
    return runWithDataScope(() => {
      setDataScope(scope);
      return run();
    });
  }

  beforeAll(async () => {
    const seed = database.seed;
    await seed.addCustomerAsync({ locationId: NORTHSIDE, surname: "AtNorthside" });
    await seed.addCustomerAsync({ locationId: RIVERSIDE, surname: "AtRiverside" });
    await seed.addCustomerAsync({ locationId: CENTRAL, surname: "AtCityMotors" });
    await seed.addStockedPartAsync({ locationId: NORTHSIDE, partNumber: "NW-NORTH" });
    await seed.addStockedPartAsync({ locationId: RIVERSIDE, partNumber: "NW-RIVER" });
    await seed.addStockedPartAsync({ locationId: CENTRAL, partNumber: "CM-CENTRAL" });
    await seed.addExportJobAsync({ locationId: NORTHSIDE, fileName: "mine.xlsx" });
    await seed.addExportJobAsync({ locationId: NORTHSIDE, ownerId: OTHER_USER, fileName: "colleague.xlsx" });
    await seed.addExportJobAsync({ locationId: CENTRAL, ownerId: OTHER_USER, fileName: "other-dealer.xlsx" });
  });

  it("shows a request only its location's customers and its dealer's parts, with no filter in the query", async () => {
    const surnames = await asRequestAsync(AT_NORTHSIDE, (db) =>
      db.select({ surname: customers.surname }).from(customers),
    );
    const partNumbers = await asRequestAsync(AT_NORTHSIDE, (db) =>
      db.select({ partNumber: parts.partNumber }).from(parts).orderBy(parts.partNumber),
    );

    expect(surnames.map((row) => row.surname)).toEqual(["AtNorthside"]);
    // The catalogue is the dealer's, shared by its locations; City Motors' part is not.
    expect(partNumbers.map((row) => row.partNumber)).toEqual(["NW-NORTH", "NW-RIVER"]);
  });

  it("shows a user only their own exports", async () => {
    const files = await asRequestAsync(AT_NORTHSIDE, (db) =>
      db.select({ fileName: exportJobs.fileName }).from(exportJobs),
    );

    expect(files.map((row) => row.fileName)).toEqual(["mine.xlsx"]);
  });

  it("refuses to write a row for another location or another dealer, and cannot change one", async () => {
    const refused = await asRequestAsync(AT_NORTHSIDE, (db) =>
      db.insert(customers).values({
        dealerId: NORTHWIND,
        locationId: RIVERSIDE,
        firstName: "Wrong",
        surname: "Place",
        status: "active",
        createdAt: SEEDED_AT,
        createdBy: TEST_USER_ID,
        updatedAt: SEEDED_AT,
        updatedBy: TEST_USER_ID,
      }),
    ).catch((error: unknown) => error);
    // Drizzle wraps Postgres's error; 42501 is "new row violates row-level security policy".
    expect((refused as { cause?: { code?: string } }).cause?.code).toBe("42501");

    const changed = await asRequestAsync(AT_NORTHSIDE, (db) =>
      db.update(customers).set({ city: "Hacked" }).where(eq(customers.surname, "AtCityMotors")).returning(),
    );
    expect(changed).toEqual([]);
  });

  it("with no location selected, shows no location's rows but still the dealer's parts", async () => {
    const noLocation: DataScope = { ...AT_NORTHSIDE, locationId: null };

    expect(await asRequestAsync(noLocation, (db) => db.select().from(customers))).toEqual([]);
    expect(await asRequestAsync(noLocation, (db) => db.select().from(parts))).toHaveLength(2);
  });

  it("filters nothing outside a request: the worker, the consumer and the seed see every dealer", async () => {
    const everyone = await asRequestAsync(null, (db) => db.select({ surname: customers.surname }).from(customers));
    expect(everyone.map((row) => row.surname)).toEqual(
      expect.arrayContaining(["AtNorthside", "AtRiverside", "AtCityMotors"]),
    );
    expect(await asRequestAsync(null, (db) => db.select().from(exportJobs))).toHaveLength(3);
  });

  /** Every row of three business tables that the request's scope lets it see. */
  async function readBusinessTablesAsync() {
    await using work = await database.unitOfWorkFactory.beginAsync({ readOnly: true });
    return {
      customers: await work.db.select().from(customers),
      parts: await work.db.select().from(parts),
      exports: await work.db.select().from(exportJobs),
    };
  }

  it("shows a request whose scope was never set no business row, not every dealer's", async () => {
    const seen = await runWithDataScope(readBusinessTablesAsync);

    expect(seen).toEqual({ customers: [], parts: [], exports: [] });
  });

  it("keeps a request's scope in work it starts later, such as a timer or a callback", async () => {
    const seen = await runWithDataScope(async () => {
      setDataScope(AT_NORTHSIDE);
      await new Promise((resolve) => setTimeout(resolve, 1));
      await using work = await database.unitOfWorkFactory.beginAsync({ readOnly: true });
      return await work.db.select({ surname: customers.surname }).from(customers);
    });

    expect(seen.map((row) => row.surname)).toEqual(["AtNorthside"]);
  });

  it("has a policy for the request role on every table, except the ones listed here with their reason", async () => {
    const NO_POLICY: Record<string, string> = {
      processed_messages: "the consumer's own bookkeeping: it has no dealer",
      __drizzle_migrations: "Drizzle's own record of the migrations it ran",
    };
    const result = await database.db.execute<{ table: string; secured: boolean; policies: string }>(sql`
      SELECT c.relname AS "table", c.relrowsecurity AS secured, count(p.polname)::text AS policies
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      LEFT JOIN pg_policy p ON p.polrelid = c.oid
        AND (p.polroles = '{0}' OR 'dealership_api_user'::regrole::oid = ANY (p.polroles))
      WHERE n.nspname IN ('public', 'drizzle') AND c.relkind = 'r'
      GROUP BY c.relname, c.relrowsecurity`);

    const unprotected = result.rows
      .filter((row) => !(row.table in NO_POLICY) && !(row.secured && Number(row.policies) > 0))
      .map((row) => row.table);

    // A new business table needs `ENABLE ROW LEVEL SECURITY` and a policy in its migration (docs/standards/multi-tenancy.md).
    expect(unprotected).toEqual([]);
  });

  it("counts every dealer's queued exports for a place in line, while showing only the user's own", async () => {
    const later = SEEDED_AT.add({ seconds: 1 }).toString();
    const position = await asRequestAsync(AT_NORTHSIDE, async (db) => {
      const result = await db.execute<{ position: string }>(
        sql`SELECT export_queue_position(${later}::timestamptz, ${CITY_MOTORS}::uuid) AS position`,
      );
      return Number(result.rows[0]?.position);
    });

    expect(position).toBe(4);
  });

  it("leaves deleted rows out of a request's reads, and still shows them to code outside a request", async () => {
    await database.seed.addCustomerAsync({ locationId: NORTHSIDE, surname: "GoneCustomer", deleted: true });
    await database.seed.addBinAsync({ locationId: NORTHSIDE, code: "GONE-1", deleted: true });

    const asRequest = await asRequestAsync(AT_NORTHSIDE, async (db) => ({
      customers: (await db.select({ surname: customers.surname }).from(customers)).map((row) => row.surname),
      bins: (await db.select({ code: bins.code }).from(bins)).map((row) => row.code),
    }));
    const asOwner = await asRequestAsync(null, (db) => db.select({ surname: customers.surname }).from(customers));

    expect(asRequest.customers).toContain("AtNorthside");
    expect(asRequest.customers).not.toContain("GoneCustomer");
    expect(asRequest.bins).not.toContain("GONE-1");
    expect(asOwner.map((row) => row.surname)).toContain("GoneCustomer");
  });

  it("has the deleted-rows filter on every table that can be soft-deleted, and it is the plain one the planner can use", async () => {
    const result = await database.db.execute<{ table: string; policy: string | null }>(sql`
      SELECT c.relname AS "table", p.qual AS policy
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'is_deleted' AND NOT a.attisdropped
      LEFT JOIN pg_policies p ON p.schemaname = n.nspname AND p.tablename = c.relname
        AND p.policyname = c.relname || '_not_deleted' AND p.permissive = 'RESTRICTIVE'
      WHERE n.nspname = 'public' AND c.relkind = 'r'`);

    // A new soft-deleted table needs a restrictive `<table>_not_deleted` policy in its migration, and it says exactly this:
    // an `OR` with anything that is not known when the query is planned makes the planner unable to use a partial index
    // (`WHERE NOT is_deleted`), so every list under the request role would sort a whole location.
    expect(result.rows.filter((row) => row.policy !== "(NOT is_deleted)").map((row) => row.table)).toEqual([]);
    expect(result.rows.length).toBeGreaterThanOrEqual(5);
  });

  it("refuses a request to change or delete a row that is deleted, as it does not see it", async () => {
    const deleted = await database.seed.addCustomerAsync({
      locationId: NORTHSIDE,
      surname: "WriteDeleted",
      deleted: true,
    });

    const changed = await asRequestAsync(AT_NORTHSIDE, (db) =>
      db.update(customers).set({ city: "Revived" }).where(eq(customers.id, deleted.id)).returning(),
    );
    const removed = await asRequestAsync(AT_NORTHSIDE, (db) =>
      db.delete(customers).where(eq(customers.id, deleted.id)).returning(),
    );

    expect([changed, removed]).toEqual([[], []]);
    const [row] = await database.db.select().from(customers).where(eq(customers.id, deleted.id));
    expect(row).toMatchObject({ city: null, isDeleted: true });
  });

  it("refuses a request to move its own row to a location that is not its own: the policy checks the changed row too", async () => {
    const mine = await database.seed.addCustomerAsync({ locationId: NORTHSIDE, surname: "WriteMoved" });

    const refused = await asRequestAsync(AT_NORTHSIDE, (db) =>
      db.update(customers).set({ locationId: RIVERSIDE }).where(eq(customers.id, mine.id)),
    ).catch((error: unknown) => error);

    expect((refused as { cause?: { code?: string } }).cause?.code).toBe("42501");
  });

  it("counts every dealer's queued exports for a place in line, while showing only the user's own", async () => {
    const later = SEEDED_AT.add({ seconds: 1 }).toString();
    const position = await asRequestAsync(AT_NORTHSIDE, async (db) => {
      const result = await db.execute<{ position: string }>(
        sql`SELECT export_queue_position(${later}::timestamptz, ${CITY_MOTORS}::uuid) AS position`,
      );
      return Number(result.rows[0]?.position);
    });

    expect(position).toBe(4);
  });

  it("leaves deleted rows out of a request's reads, and still shows them to code outside a request", async () => {
    await database.seed.addCustomerAsync({ locationId: NORTHSIDE, surname: "GoneCustomer", deleted: true });
    await database.seed.addBinAsync({ locationId: NORTHSIDE, code: "GONE-1", deleted: true });

    const asRequest = await asRequestAsync(AT_NORTHSIDE, async (db) => ({
      customers: (await db.select({ surname: customers.surname }).from(customers)).map((row) => row.surname),
      bins: (await db.select({ code: bins.code }).from(bins)).map((row) => row.code),
    }));
    const asOwner = await asRequestAsync(null, (db) => db.select({ surname: customers.surname }).from(customers));

    expect(asRequest.customers).toContain("AtNorthside");
    expect(asRequest.customers).not.toContain("GoneCustomer");
    expect(asRequest.bins).not.toContain("GONE-1");
    expect(asOwner.map((row) => row.surname)).toContain("GoneCustomer");
  });

  it("has the deleted-rows filter on every table that can be soft-deleted", async () => {
    const result = await database.db.execute<{ table: string }>(sql`
      SELECT c.relname AS "table"
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'is_deleted' AND NOT a.attisdropped
      WHERE n.nspname = 'public' AND c.relkind = 'r'
        AND NOT EXISTS (
          SELECT 1 FROM pg_policy p
          WHERE p.polrelid = c.oid AND NOT p.polpermissive AND p.polname = c.relname || '_not_deleted')`);

    // A new soft-deleted table needs a restrictive `<table>_not_deleted` policy in its migration.
    expect(result.rows.map((row) => row.table)).toEqual([]);
  });
});
