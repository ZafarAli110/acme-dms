import { BadRequestException } from "@nestjs/common";
import { beforeAll, describe, expect, it } from "vitest";
import type { ListQueryDto } from "#dto/paging/list-query.dto";
import { readSettings } from "#settings/settings";
import { NORTHSIDE } from "#test-setup/postgres/seed-kit";
import { useTestDatabase } from "#test-setup/postgres/use-test-database";
import { AT_NORTHSIDE } from "#test-setup/users/test-users";
import { GetPartListQueryHandler } from "../get-part-list.query-handler";

/**
 * ACME-129: the parts list pages by keyset as the customer list does, through the same rows as paging by number, for
 * every sort, both ways; a search pages by number, and refuses a cursor.
 */
describe("GetPartListQueryHandler: keyset paging", () => {
  const database = useTestDatabase();
  const PAGE_SIZE = 4;
  // One key for the whole test, as every API instance shares EXPORT_LINK_KEY.
  const settings = readSettings({});

  beforeAll(async () => {
    for (let index = 1; index <= 19; index += 1) {
      await database.seed.addStockedPartAsync({
        locationId: NORTHSIDE,
        partNumber: `KEY-${String(index).padStart(2, "0")}`,
        quantityOnHand: index % 4,
        reorderLevel: index % 3,
        unitPriceCents: 100 * (index % 5),
        description: `Keyset part ${index % 6}`,
      });
    }
  });

  function handler(): GetPartListQueryHandler {
    return database.asRequest(new GetPartListQueryHandler(database.unitOfWorkFactory, settings));
  }

  it("walks every sort, both ways, forwards and backwards, through the same rows as paging by number", async () => {
    const sorts = [undefined, "partNumber", "description", "bin", "onHand", "reorderLevel", "unitPriceCents"];
    for (const sort of sorts) {
      for (const direction of ["asc", "desc"] as const) {
        const query: ListQueryDto = sort ? { sort, direction } : {};
        const all = (await handler().executeAsync(AT_NORTHSIDE, { ...query, page: 1, pageSize: 100 })).items.map(
          (item) => item.id,
        );

        let page = await handler().executeAsync(AT_NORTHSIDE, { ...query, page: 1, pageSize: PAGE_SIZE });
        const forwards = page.items.map((item) => item.id);
        while (page.next) {
          page = await handler().executeAsync(AT_NORTHSIDE, { ...query, after: page.next, pageSize: PAGE_SIZE });
          forwards.push(...page.items.map((item) => item.id));
        }
        page = await handler().executeAsync(AT_NORTHSIDE, { ...query, last: true, pageSize: PAGE_SIZE });
        let backwards = page.items.map((item) => item.id);
        while (page.previous) {
          page = await handler().executeAsync(AT_NORTHSIDE, { ...query, before: page.previous, pageSize: PAGE_SIZE });
          backwards = [...page.items.map((item) => item.id), ...backwards];
        }

        expect(all).toHaveLength(19);
        expect(forwards, `${sort} ${direction} forwards`).toEqual(all);
        expect(backwards, `${sort} ${direction} backwards`).toEqual(all);
      }
    }
  });

  it("pages a search by number, with no cursors, and refuses one", async () => {
    const first = await handler().executeAsync(AT_NORTHSIDE, { search: "key", page: 1, pageSize: PAGE_SIZE });
    const list = await handler().executeAsync(AT_NORTHSIDE, { page: 1, pageSize: PAGE_SIZE });

    expect(first).toMatchObject({ page: 1, hasMore: true, next: null, previous: null });
    await expect(
      handler().executeAsync(AT_NORTHSIDE, { search: "key", after: list.next ?? "", pageSize: PAGE_SIZE }),
    ).rejects.toThrow(BadRequestException);
  });
});
