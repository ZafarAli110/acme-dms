import { eq, sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
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
 * Postgres row-level security (migration 0004), seen as a request sees it: every query below has no dealer, location
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
    expect(await asRequestAsync(null, (db) => db.select().from(customers))).toHaveLength(3);
    expect(await asRequestAsync(null, (db) => db.select().from(exportJobs))).toHaveLength(3);
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
});
