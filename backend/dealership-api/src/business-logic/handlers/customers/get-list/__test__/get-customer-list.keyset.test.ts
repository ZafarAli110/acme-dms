import { BadRequestException } from "@nestjs/common";
import { sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import type { ListQueryDto } from "#dto/paging/list-query.dto";
import { readSettings } from "#settings/settings";
import { NORTHSIDE, NORTHWIND, RIVERSIDE, TEST_USER_ID } from "#test-setup/postgres/seed-kit";
import { useTestDatabase } from "#test-setup/postgres/use-test-database";
import { AT_NORTHSIDE, AT_RIVERSIDE } from "#test-setup/users/test-users";
import { GetCustomerListQueryHandler } from "../get-customer-list.query-handler";

/**
 * ACME-129: keyset paging gives the same rows, in the same order, as paging by number, for every sort the grid offers,
 * both ways, walking forwards from page 1 and backwards from the last page: ties, empty values and all.
 */
describe("GetCustomerListQueryHandler: keyset paging", () => {
  const database = useTestDatabase();
  const PAGE_SIZE = 7;
  // One key for the whole test, as every API instance shares EXPORT_LINK_KEY; in development each read makes its own.
  const settings = readSettings({});

  /** 61 customers at Northside with ties and empty values in every nullable column, and 5 at Riverside. */
  async function seedAsync(): Promise<void> {
    await database.db.execute(sql`
      insert into customers (dealer_id, location_id, first_name, surname, company_name, email, phone, city, status,
                             last_contact_date, created_at, created_by, updated_at, updated_by)
      select ${NORTHWIND}::uuid, case when g <= 61 then ${NORTHSIDE}::uuid else ${RIVERSIDE}::uuid end,
             'First' || (g % 4), (array['Smith', 'Jones', 'Patel', 'Smith', 'Brown'])[1 + g % 5],
             case when g % 3 = 0 then null else 'Company ' || (g % 6) end,
             case when g % 4 = 0 then null else 'c' || (g % 9) || '@example.test' end,
             case when g % 5 = 0 then null else '0113 496 ' || lpad((g % 8)::text, 4, '0') end,
             case when g % 6 = 0 then null else (array['Leeds', 'York', 'Bath'])[1 + g % 3] end,
             (array['active', 'prospect', 'inactive'])[1 + g % 3],
             case when g % 7 = 0 then null else date '2026-10-01' + (g % 5) end,
             now(), ${TEST_USER_ID}::uuid, now(), ${TEST_USER_ID}::uuid
      from generate_series(1, 66) as g`);
  }

  // The file's tests share one database: seeded once.
  beforeAll(seedAsync);

  function handler(): GetCustomerListQueryHandler {
    return database.asRequest(new GetCustomerListQueryHandler(database.unitOfWorkFactory, settings));
  }

  async function walkForwardAsync(query: ListQueryDto): Promise<string[]> {
    const ids: string[] = [];
    let page = await handler().executeAsync(AT_NORTHSIDE, { ...query, page: 1, pageSize: PAGE_SIZE });
    ids.push(...page.items.map((item) => item.id));
    while (page.next) {
      page = await handler().executeAsync(AT_NORTHSIDE, { ...query, after: page.next, pageSize: PAGE_SIZE });
      ids.push(...page.items.map((item) => item.id));
    }
    return ids;
  }

  async function walkBackwardAsync(query: ListQueryDto): Promise<string[]> {
    let page = await handler().executeAsync(AT_NORTHSIDE, { ...query, last: true, pageSize: PAGE_SIZE });
    let ids = page.items.map((item) => item.id);
    while (page.previous) {
      page = await handler().executeAsync(AT_NORTHSIDE, { ...query, before: page.previous, pageSize: PAGE_SIZE });
      ids = [...page.items.map((item) => item.id), ...ids];
    }
    return ids;
  }

  it("walks every sort, both ways, forwards and backwards, through the same rows as paging by number", async () => {
    const sorts = [undefined, "name", "companyName", "email", "phone", "city", "status", "lastContactDate"];
    for (const sort of sorts) {
      for (const direction of ["asc", "desc"] as const) {
        const query: ListQueryDto = sort ? { sort, direction } : {};
        const all = await handler().executeAsync(AT_NORTHSIDE, { ...query, page: 1, pageSize: 100 });
        const expected = all.items.map((item) => item.id);

        expect(expected).toHaveLength(61);
        expect(await walkForwardAsync(query), `${sort} ${direction} forwards`).toEqual(expected);
        expect(await walkBackwardAsync(query), `${sort} ${direction} backwards`).toEqual(expected);
      }
    }
  });

  it("goes on from a page found by its number, and says when there is no page before or after", async () => {
    const first = await handler().executeAsync(AT_NORTHSIDE, { page: 1, pageSize: PAGE_SIZE });
    const third = await handler().executeAsync(AT_NORTHSIDE, { page: 3, pageSize: PAGE_SIZE });
    const fourth = await handler().executeAsync(AT_NORTHSIDE, { after: third.next ?? "", pageSize: PAGE_SIZE });
    const byNumber = await handler().executeAsync(AT_NORTHSIDE, { page: 4, pageSize: PAGE_SIZE });
    const last = await handler().executeAsync(AT_NORTHSIDE, { last: true, pageSize: PAGE_SIZE });
    const all = await handler().executeAsync(AT_NORTHSIDE, { page: 1, pageSize: 100 });

    expect(first.previous).toBeNull();
    expect(fourth.items.map((item) => item.id)).toEqual(byNumber.items.map((item) => item.id));
    expect(fourth.page).toBeNull();
    expect(last.next).toBeNull();
    expect(last.hasMore).toBe(false);
    // The last page is the list's last rows, a full page ("Last 25"), not what is left over after the numbered pages.
    expect(last.items.map((item) => item.id)).toEqual(all.items.slice(-PAGE_SIZE).map((item) => item.id));
  });

  it("pages a search by keyset as the table's owner, still only at the user's location", async () => {
    const query: ListQueryDto = { search: "smith" };

    const all = await handler().executeAsync(AT_NORTHSIDE, { ...query, page: 1, pageSize: 100 });

    expect(await walkForwardAsync(query)).toEqual(all.items.map((item) => item.id));
    expect(all.items.every((item) => item.surname === "Smith")).toBe(true);
  });

  it("refuses a cursor changed by hand, from another sort, or from another location", async () => {
    const page = await handler().executeAsync(AT_NORTHSIDE, { page: 1, pageSize: PAGE_SIZE });
    const cursor = page.next ?? "";
    const [payload, signature] = cursor.split(".");
    const changed = `${Buffer.from(JSON.stringify({ k: ["Aaron", "First0"], i: "00000000-0000-0000-0000-000000000000" })).toString("base64url")}.${signature}`;

    await expect(handler().executeAsync(AT_NORTHSIDE, { after: changed })).rejects.toThrow(BadRequestException);
    await expect(handler().executeAsync(AT_NORTHSIDE, { after: `${payload}.x` })).rejects.toThrow(BadRequestException);
    await expect(handler().executeAsync(AT_NORTHSIDE, { after: cursor, sort: "city" })).rejects.toThrow(
      BadRequestException,
    );
    await expect(handler().executeAsync(AT_RIVERSIDE, { after: cursor })).rejects.toThrow(BadRequestException);
  });
});
