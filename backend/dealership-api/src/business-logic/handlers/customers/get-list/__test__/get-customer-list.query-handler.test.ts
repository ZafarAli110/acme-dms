import { readSettings } from "#settings/settings";
import { BadRequestException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { AT_NORTHSIDE, userAt } from "#test-setup/users/test-users";
import { NORTHSIDE, RIVERSIDE } from "#test-setup/postgres/seed-kit";
import { useTestDatabase } from "#test-setup/postgres/use-test-database";
import { GetCustomerListQueryHandler } from "../get-customer-list.query-handler";

describe("GetCustomerListQueryHandler", () => {
  const database = useTestDatabase();

  it("lists only the selected location's customers, searching name, company and email", async () => {
    await database.seed.addCustomerAsync({ locationId: NORTHSIDE, surname: "Hopper", companyName: "Hopper Logistics" });
    await database.seed.addCustomerAsync({ locationId: NORTHSIDE, surname: "Lovelace" });
    await database.seed.addCustomerAsync({ locationId: RIVERSIDE, surname: "Hopper" });
    await database.seed.addCustomerAsync({ locationId: NORTHSIDE, surname: "Hopperton", deleted: true });
    const handler = database.asRequest(new GetCustomerListQueryHandler(database.unitOfWorkFactory, readSettings({})));

    const all = await handler.executeAsync(AT_NORTHSIDE, { page: 1, pageSize: 25, search: undefined });
    const found = await handler.executeAsync(AT_NORTHSIDE, { page: 1, pageSize: 25, search: "hopper" });

    expect(all.items.map((customer) => customer.surname)).toEqual(["Hopper", "Lovelace"]);
    expect(all.hasMore).toBe(false);
    expect(found.items.map((customer) => customer.companyName)).toEqual(["Hopper Logistics"]);
    expect(found.hasMore).toBe(false);
  });

  it("pages the list", async () => {
    for (const surname of ["Adams", "Brown", "Clark"]) {
      await database.seed.addCustomerAsync({ locationId: RIVERSIDE, surname });
    }
    const handler = database.asRequest(new GetCustomerListQueryHandler(database.unitOfWorkFactory, readSettings({})));
    const riverside = { ...AT_NORTHSIDE, locationId: RIVERSIDE };

    const first = await handler.executeAsync(riverside, { page: 1, pageSize: 2, search: undefined });
    const second = await handler.executeAsync(riverside, { page: 2, pageSize: 2, search: undefined });

    // A page says whether another follows; the total is the count's (ACME-117).
    expect(first).toMatchObject({ hasMore: true, page: 1, pageSize: 2 });
    expect(second.items.map((customer) => customer.surname)).toEqual(["Clark", "Hopper"]);
    expect(second).toMatchObject({ hasMore: false, page: 2, pageSize: 2 });
  });

  it("finds a phone by the start or the end of its digits, never by its middle (ACME-129)", async () => {
    const westgate = "20000000-0000-0000-0000-000000000003";
    const at = userAt(westgate);
    await database.seed.addCustomerAsync({ locationId: westgate, surname: "Dial", phone: "0113 496-4417" });
    await database.seed.addCustomerAsync({ locationId: westgate, surname: "Abroad", phone: "+44 7700 900123" });
    await database.seed.addCustomerAsync({ locationId: westgate, surname: "Mailer", email: "j.4417@example.test" });
    await database.seed.addCustomerAsync({ locationId: westgate, surname: "Firm", companyName: "Dialtone Ltd" });
    await database.seed.addCustomerAsync({ locationId: NORTHSIDE, surname: "Elsewhere", phone: "0113 496 4417" });
    const handler = database.asRequest(new GetCustomerListQueryHandler(database.unitOfWorkFactory, readSettings({})));
    const search = async (text: string) =>
      (await handler.executeAsync(at, { page: 1, pageSize: 25, search: text })).items.map((item) => item.surname);

    expect(await search("4417")).toEqual(["Dial"]);
    expect(await search("0113 496")).toEqual(["Dial"]);
    expect(await search("(0113) 496-")).toEqual(["Dial"]);
    expect(await search("+44 7700")).toEqual(["Abroad"]);
    expect(await search("496")).toEqual([]);
    expect(await search("dialtone")).toEqual(["Firm"]);
    expect(await search("j.4417@")).toEqual(["Mailer"]);
  });

  it("filters the phone column by the start, the end or all of its digits, and refuses contains (ACME-129)", async () => {
    const central = "20000000-0000-0000-0000-000000000004";
    const at = userAt(central);
    await database.seed.addCustomerAsync({ locationId: central, surname: "Ring", phone: "07700 900456" });
    await database.seed.addCustomerAsync({ locationId: central, surname: "Silent", phone: null });
    const handler = database.asRequest(new GetCustomerListQueryHandler(database.unitOfWorkFactory, readSettings({})));
    const filter = async (filterOperator: "startsWith" | "endsWith" | "equals" | "isEmpty", filterValue?: string) =>
      (
        await handler.executeAsync(at, { page: 1, pageSize: 25, filterField: "phone", filterOperator, filterValue })
      ).items.map((item) => item.surname);

    expect(await filter("startsWith", "07700 9")).toEqual(["Ring"]);
    expect(await filter("endsWith", "456")).toEqual(["Ring"]);
    expect(await filter("equals", "07700-900-456")).toEqual(["Ring"]);
    expect(await filter("equals", "0770")).toEqual([]);
    expect(await filter("isEmpty")).toEqual(["Silent"]);
    await expect(
      handler.executeAsync(at, {
        page: 1,
        pageSize: 25,
        filterField: "phone",
        filterOperator: "contains",
        filterValue: "900",
      }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      handler.executeAsync(at, {
        page: 1,
        pageSize: 25,
        filterField: "phone",
        filterOperator: "startsWith",
        filterValue: "abc",
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it("refuses a page deeper than a list can reach, before it reads anything", async () => {
    const handler = database.asRequest(new GetCustomerListQueryHandler(database.unitOfWorkFactory, readSettings({})));

    await expect(
      handler.executeAsync(AT_NORTHSIDE, { page: 250_000, pageSize: 25, search: undefined }),
    ).rejects.toThrow(BadRequestException);
  });
});
