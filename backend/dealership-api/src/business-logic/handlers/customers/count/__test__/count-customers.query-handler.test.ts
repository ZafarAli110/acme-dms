import { BadRequestException } from "@nestjs/common";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { AT_CENTRAL, AT_NORTHSIDE } from "#test-setup/users/test-users";
import { CENTRAL, CITY_MOTORS, NORTHSIDE, RIVERSIDE, TEST_USER_ID } from "#test-setup/postgres/seed-kit";
import { useTestDatabase } from "#test-setup/postgres/use-test-database";
import { CountCustomersQueryHandler } from "../count-customers.query-handler";

const page = { page: 1, pageSize: 25 };

/**
 * ACME-117: the customer list's total, asked once per search and filter. Exact up to 10,000, 10,001 past it (ACME-119);
 * a search or a text filter is counted as the owner with the scope written by hand, so these tests put another
 * location's and deleted customers beside the ones that count.
 */
describe("CountCustomersQueryHandler", () => {
  const database = useTestDatabase();

  it("counts only this location's live customers: plain, searched, and filtered by text or status", async () => {
    const seed = database.seed;
    await seed.addCustomerAsync({ locationId: NORTHSIDE, surname: "Ripley", city: "Ripon" });
    await seed.addCustomerAsync({ locationId: NORTHSIDE, surname: "Ripley", city: "Ripon", status: "prospect" });
    await seed.addCustomerAsync({ locationId: NORTHSIDE, surname: "Ripley", city: "Ripon", deleted: true });
    await seed.addCustomerAsync({ locationId: RIVERSIDE, surname: "Ripley", city: "Ripon" });
    const handler = database.asRequest(new CountCustomersQueryHandler(database.unitOfWorkFactory));

    const plain = await handler.executeAsync(AT_NORTHSIDE, page);
    const searched = await handler.executeAsync(AT_NORTHSIDE, { ...page, search: "ripley" });
    const filtered = await handler.executeAsync(AT_NORTHSIDE, {
      ...page,
      filterField: "city",
      filterOperator: "equals",
      filterValue: "ripon",
    });
    const prospects = await handler.executeAsync(AT_NORTHSIDE, {
      ...page,
      filterField: "status",
      filterOperator: "is",
      filterValue: "prospect",
    });

    expect(plain.total).toBe(2);
    expect(searched.total).toBe(2);
    expect(filtered.total).toBe(2);
    expect(prospects.total).toBe(1);
  });

  it("counts none of another dealer's customers", async () => {
    const handler = database.asRequest(new CountCustomersQueryHandler(database.unitOfWorkFactory));

    // Central belongs to City Motors; Northside's Ripleys above are Northwind's.
    await expect(handler.executeAsync(AT_CENTRAL, { ...page, search: "ripley" })).resolves.toEqual({ total: 0 });
  });

  it("refuses a field the list does not have, as the list does", async () => {
    const handler = database.asRequest(new CountCustomersQueryHandler(database.unitOfWorkFactory));

    await expect(
      handler.executeAsync(AT_NORTHSIDE, {
        ...page,
        filterField: "password",
        filterOperator: "equals",
        filterValue: "x",
      }),
    ).rejects.toThrow(BadRequestException);
  });

  // Last: it fills Central with 10,002 customers. Central has no other test's customers.
  it("counts exactly up to 10,000 and stops at 10,001; nothing matching counts 0", async () => {
    const addAtCentralAsync = (from: number, to: number) =>
      database.db.execute(sql`
        insert into customers (dealer_id, location_id, first_name, surname, status, created_at, created_by, updated_at,
                               updated_by)
        select ${CITY_MOTORS}::uuid, ${CENTRAL}::uuid, 'First', 'Surname' || g, 'active', now(), ${TEST_USER_ID}::uuid,
               now(), ${TEST_USER_ID}::uuid
        from generate_series(${from}::int, ${to}::int) as g`);
    const handler = database.asRequest(new CountCustomersQueryHandler(database.unitOfWorkFactory));

    await addAtCentralAsync(1, 10_000);
    const exactly = await handler.executeAsync(AT_CENTRAL, page);
    await addAtCentralAsync(10_001, 10_002);
    const more = await handler.executeAsync(AT_CENTRAL, page);
    const none = await handler.executeAsync(AT_CENTRAL, {
      ...page,
      filterField: "city",
      filterOperator: "equals",
      filterValue: "Nowhere",
    });

    expect(exactly.total).toBe(10_000);
    expect(more.total).toBe(10_001);
    expect(none.total).toBe(0);
  });
});
