import { sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import type { ListQueryDto } from "#dto/paging/list-query.dto";
import type { Database } from "#persistence/unit-of-work/unit-of-work";
import { readSettings } from "#settings/settings";
import { NORTHSIDE, NORTHWIND, RIVERSIDE, TEST_USER_ID } from "#test-setup/postgres/seed-kit";
import { useTestDatabase } from "#test-setup/postgres/use-test-database";
import { AT_NORTHSIDE } from "#test-setup/users/test-users";
import { customerExportSource } from "../../../../exports/sources/customer-export-source";
import { GetCustomerListQueryHandler } from "../get-customer-list.query-handler";

interface CustomerOptions {
  company?: string;
  location?: string;
  deleted?: boolean;
}

/** One customer at Northwind (Northside unless `location` says), live unless `deleted`. */
async function addCustomerAsync(db: Database, surname: string, first: string, options: CustomerOptions): Promise<void> {
  await db.execute(sql`
    insert into customers (dealer_id, location_id, first_name, surname, company_name, status, is_deleted, deleted_at,
                           deleted_by, created_at, created_by, updated_at, updated_by)
    values (${NORTHWIND}::uuid, ${options.location ?? NORTHSIDE}::uuid, ${first}, ${surname}, ${options.company ?? null},
            'active', ${options.deleted ?? false}, ${options.deleted ? sql`now()` : null},
            ${options.deleted ? TEST_USER_ID : null}::uuid, now(), ${TEST_USER_ID}::uuid, now(), ${TEST_USER_ID}::uuid)`);
}

/** A page's customers as "Surname, First name". */
function names(items: { surname: string; firstName: string }[]): string[] {
  return items.map((item) => `${item.surname}, ${item.firstName}`);
}

/**
 * ACME-129 (Zafar Ali, 9 Nov): a search of one name word shows the customers whose surname or first name is that word
 * first, in name order, then every other match in name order; the pages, both ways and by number, and the export
 * follow that order. A column sort the user chose keeps the plain order.
 */
describe("GetCustomerListQueryHandler: exact names first", () => {
  const database = useTestDatabase();
  const settings = readSettings({});

  /** The order the list must show for "penwood": the exact names, then the other matches, each by name. */
  const EXPECTED = [
    "Abbott, Penwood",
    ...["Alice", "Bob", "Cara", "Dan", "Eve", "Fay", "Gus", "Hal", "Ida", "Jo", "Kit", "Lee"].map(
      (first) => `Penwood, ${first}`,
    ),
    "Zeta, Penwood",
    ...Array.from({ length: 10 }, (_, index) => `Aardvark${index}, Ann`),
    "Penwoodson, Amy",
    "Penwoodson, Ben",
    "Penwoodson, Cy",
    "Penwoodson, Di",
  ];

  beforeAll(async () => {
    // Seeded out of order, so the order the list shows is its own.
    for (const name of EXPECTED.toReversed()) {
      const [surname = "", first = ""] = name.split(", ");
      await addCustomerAsync(
        database.db,
        surname,
        first,
        surname.startsWith("Aardvark") ? { company: "Penwood Ltd" } : {},
      );
    }
    await addCustomerAsync(database.db, "Penwood", "Other", { location: RIVERSIDE });
    await addCustomerAsync(database.db, "Penwood", "Gone", { deleted: true });
    await addCustomerAsync(database.db, "Smith", "Unrelated", {});
  });

  function handler(): GetCustomerListQueryHandler {
    return database.asRequest(new GetCustomerListQueryHandler(database.unitOfWorkFactory, settings));
  }

  async function walkForwardAsync(query: ListQueryDto, pageSize: number): Promise<string[]> {
    let page = await handler().executeAsync(AT_NORTHSIDE, { ...query, page: 1, pageSize });
    const all = names(page.items);
    while (page.next) {
      page = await handler().executeAsync(AT_NORTHSIDE, { ...query, after: page.next, pageSize });
      all.push(...names(page.items));
    }
    return all;
  }

  async function walkBackwardAsync(query: ListQueryDto, pageSize: number): Promise<string[]> {
    let page = await handler().executeAsync(AT_NORTHSIDE, { ...query, last: true, pageSize });
    let all = names(page.items);
    while (page.previous) {
      page = await handler().executeAsync(AT_NORTHSIDE, { ...query, before: page.previous, pageSize });
      all = [...names(page.items), ...all];
    }
    return all;
  }

  it("shows the exact names first, then the other matches, each in name order, and only this location's live ones", async () => {
    const page = await handler().executeAsync(AT_NORTHSIDE, { page: 1, pageSize: 100, search: "penwood" });

    expect(names(page.items)).toEqual(EXPECTED);
    expect(page.hasMore).toBe(false);
  });

  it("pages across the boundary the same way forwards, backwards and by number", async () => {
    const query: ListQueryDto = { search: "PenWood" };
    const byNumber: string[] = [];
    for (let number = 1; number <= 8; number += 1) {
      const page = await handler().executeAsync(AT_NORTHSIDE, { ...query, page: number, pageSize: 4 });
      byNumber.push(...names(page.items));
    }

    expect(await walkForwardAsync(query, 4)).toEqual(EXPECTED);
    expect(await walkBackwardAsync(query, 4)).toEqual(EXPECTED);
    expect(byNumber).toEqual(EXPECTED);
  });

  it("keeps the plain name order when the user sorts by a column, and for a search that is not one name word", async () => {
    const sorted = await handler().executeAsync(AT_NORTHSIDE, {
      page: 1,
      pageSize: 100,
      search: "penwood",
      sort: "name",
    });
    const twoWords = await handler().executeAsync(AT_NORTHSIDE, { page: 1, pageSize: 100, search: "Penwood Ltd" });

    expect(names(sorted.items)).toEqual(EXPECTED.toSorted((a, b) => a.localeCompare(b, "en")));
    expect(names(twoWords.items)).toEqual(Array.from({ length: 10 }, (_, index) => `Aardvark${index}, Ann`));
  });

  it("exports the rows in the order the list shows them", async () => {
    const source = customerExportSource(
      { dealerId: NORTHWIND, locationId: NORTHSIDE },
      { search: "penwood", columns: [{ field: "name" }] },
      Temporal.Now.instant(),
    );
    const query = source.rowsQuery(database.db);

    // As the export worker reads it: the source's own SQL, streamed in a unit of work as the table's owner.
    await using work = await database.unitOfWorkFactory.beginAsync({ readOnly: true, asOwner: true });
    const exported: string[] = [];
    for await (const row of work.stream(query, 100) as AsyncIterable<string[]>) {
      exported.push(row[0] ?? "");
    }

    // The export's name column is "First Surname".
    const asExported = EXPECTED.map((name) => {
      const [surname, first] = name.split(", ");
      return `${first} ${surname}`;
    });
    expect(exported).toEqual(asExported);
  });
});
