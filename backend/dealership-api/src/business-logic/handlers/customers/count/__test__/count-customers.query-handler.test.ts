import { BadRequestException } from "@nestjs/common";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { AT_CENTRAL, AT_NORTHSIDE } from "#test-setup/users/test-users";
import { CENTRAL, CITY_MOTORS, NORTHSIDE, RIVERSIDE, TEST_USER_ID } from "#test-setup/postgres/seed-kit";
import { useTestDatabase } from "#test-setup/postgres/use-test-database";
import { CountCustomersQueryHandler } from "../count-customers.query-handler";

const page = { page: 1, pageSize: 25 };

/**
 * ACME-117: the customer list's total, asked once per search and filter. ACME-129: "about" for the whole list and a
 * status filter, exact otherwise while every match fits on the first page, then "many". A search or a text filter is
 * counted as the owner with the scope written by hand, so these tests put another location's and deleted customers
 * beside the ones that count.
 */
describe("CountCustomersQueryHandler", () => {
  const database = useTestDatabase();

  it("counts only this location's live customers, exactly while there are few", async () => {
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

    expect(plain).toEqual({ kind: "exact", value: 2 });
    expect(searched).toEqual({ kind: "exact", value: 2 });
    expect(filtered).toEqual({ kind: "exact", value: 2 });
    expect(prospects).toEqual({ kind: "exact", value: 1 });
  });

  it("counts none of another dealer's customers", async () => {
    const handler = database.asRequest(new CountCustomersQueryHandler(database.unitOfWorkFactory));

    // Central belongs to City Motors; Northside's Ripleys above are Northwind's.
    await expect(handler.executeAsync(AT_CENTRAL, { ...page, search: "ripley" })).resolves.toEqual({
      kind: "exact",
      value: 0,
    });
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

  // Last: it fills Central with 30,000 customers. Central has no other test's customers.
  it("estimates a big list close to its size; counts exactly while every match fits on the first page, then says many", async () => {
    const addAtCentralAsync = (from: number, to: number) =>
      database.db.execute(sql`
        insert into customers (dealer_id, location_id, first_name, surname, status, created_at, created_by, updated_at,
                               updated_by)
        select ${CITY_MOTORS}::uuid, ${CENTRAL}::uuid, 'First', 'Surname' || g, 'active', now(), ${TEST_USER_ID}::uuid,
               now(), ${TEST_USER_ID}::uuid
        from generate_series(${from}::int, ${to}::int) as g`);
    const handler = database.asRequest(new CountCustomersQueryHandler(database.unitOfWorkFactory));

    await addAtCentralAsync(1, 30_000);
    // As autovacuum would: the statistics the estimate reads.
    await database.db.execute(sql`analyze customers`);
    const about = await handler.executeAsync(AT_CENTRAL, page);
    const few = await handler.executeAsync(AT_CENTRAL, { ...page, search: "Surname2999" }); // 2999, 29990…29999
    const one = await handler.executeAsync(AT_CENTRAL, { ...page, search: "Surname9999" });
    // The ticket's rule: 11 matches are exact on a page of 11, "many" on a page of 10 (ACME-129).
    const fitsTheFirstPage = await handler.executeAsync(AT_CENTRAL, { ...page, pageSize: 11, search: "Surname2999" });
    const pastTheFirstPage = await handler.executeAsync(AT_CENTRAL, { ...page, pageSize: 10, search: "Surname2999" });
    const many = await handler.executeAsync(AT_CENTRAL, { ...page, search: "Surname1" });
    const none = await handler.executeAsync(AT_CENTRAL, {
      ...page,
      filterField: "city",
      filterOperator: "equals",
      filterValue: "Nowhere",
    });

    expect(about.kind).toBe("about");
    expect(Math.abs((about.value ?? 0) - 30_000) / 30_000).toBeLessThan(0.05);
    expect(few).toEqual({ kind: "exact", value: 11 });
    expect(one).toEqual({ kind: "exact", value: 1 });
    expect(fitsTheFirstPage).toEqual({ kind: "exact", value: 11 });
    expect(pastTheFirstPage).toEqual({ kind: "many", value: null });
    expect(many).toEqual({ kind: "many", value: null });
    expect(none).toEqual({ kind: "exact", value: 0 });
  });
});
