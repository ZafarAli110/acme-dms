import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDatabaseAsync, type TestDatabase } from "#test-setup/postgres/test-database";
import { NORTHSIDE, NORTHWIND, RIVERSIDE, TEST_USER_ID } from "#test-setup/postgres/seed-kit";
import { type CustomerNameKind, customerNames } from "#persistence/schema/customer-names";
import { customers } from "#persistence/schema/customers";

const AUDIT = { createdBy: TEST_USER_ID, updatedBy: TEST_USER_ID };

/**
 * ACME-120: each location's names (first names, surnames, company words), with how many live customers have each, for
 * "Did you mean". Triggers on `customers` keep it in step in the same transaction, whatever changes a customer.
 */
describe("customer_names", () => {
  let database: TestDatabase;

  beforeAll(async () => {
    database = await createTestDatabaseAsync();
  });

  afterAll(async () => {
    await database[Symbol.asyncDispose]();
  });

  async function countAsync(locationId: string, kind: CustomerNameKind, name: string): Promise<number> {
    const [row] = await database.db
      .select({ customers: customerNames.customers })
      .from(customerNames)
      .where(
        and(
          eq(customerNames.locationId, locationId),
          eq(customerNames.kind, kind),
          sql`lower(${customerNames.name}) = lower(${name})`,
        ),
      );
    return row?.customers ?? 0;
  }

  async function addAsync(locationId: string, firstName: string, surname: string, companyName: string | null) {
    const [customer] = await database.db
      .insert(customers)
      .values({
        dealerId: NORTHWIND,
        locationId,
        firstName,
        surname,
        companyName,
        status: "active",
        createdAt: Temporal.Now.instant(),
        updatedAt: Temporal.Now.instant(),
        ...AUDIT,
      })
      .returning();
    return customer!;
  }

  it("counts each location's first names, surnames and company words as customers are added", async () => {
    await addAsync(NORTHSIDE, "Yusuf", "Penwood", "Penwood Haulage Co");
    await addAsync(NORTHSIDE, "Amy", "Penwood", null);
    await addAsync(RIVERSIDE, "Amy", "Penwood", null);

    expect(await countAsync(NORTHSIDE, "surname", "Penwood")).toBe(2);
    expect(await countAsync(NORTHSIDE, "first", "amy")).toBe(1);
    expect(await countAsync(NORTHSIDE, "company_word", "Haulage")).toBe(1);
    // Words of fewer than three letters are not names to suggest.
    expect(await countAsync(NORTHSIDE, "company_word", "Co")).toBe(0);
    expect(await countAsync(RIVERSIDE, "surname", "Penwood")).toBe(1);
  });

  it("follows a rename, a soft delete and a delete, and forgets a name nobody has any more", async () => {
    const renamed = await addAsync(NORTHSIDE, "Bilal", "Whitwood", null);
    const deleted = await addAsync(NORTHSIDE, "Cara", "Thornby", null);

    await database.db.update(customers).set({ surname: "Whitworth" }).where(eq(customers.id, renamed.id));
    await database.db
      .update(customers)
      .set({ isDeleted: true, deletedAt: Temporal.Now.instant(), deletedBy: TEST_USER_ID })
      .where(eq(customers.id, deleted.id));

    expect(await countAsync(NORTHSIDE, "surname", "Whitwood")).toBe(0);
    expect(await countAsync(NORTHSIDE, "surname", "Whitworth")).toBe(1);
    expect(await countAsync(NORTHSIDE, "surname", "Thornby")).toBe(0);

    await database.db.delete(customers).where(eq(customers.id, renamed.id));

    expect(await countAsync(NORTHSIDE, "surname", "Whitworth")).toBe(0);
    const left = await database.db
      .select()
      .from(customerNames)
      .where(sql`${customerNames.customers} <= 0`);
    expect(left).toEqual([]);
  });

  it("counts a bulk insert of many customers in one statement, as seed:bulk sends them", async () => {
    await database.db.execute(sql`
      insert into customers (dealer_id, location_id, first_name, surname, status, created_at, created_by, updated_at,
                             updated_by)
      select ${NORTHWIND}::uuid, ${NORTHSIDE}::uuid, 'Bulk', 'Ackroyd', 'active', now(), ${TEST_USER_ID}::uuid, now(),
             ${TEST_USER_ID}::uuid
      from generate_series(1, 5000)`);

    expect(await countAsync(NORTHSIDE, "surname", "Ackroyd")).toBe(5000);
    expect(await countAsync(NORTHSIDE, "first", "Bulk")).toBe(5000);
  });
});
