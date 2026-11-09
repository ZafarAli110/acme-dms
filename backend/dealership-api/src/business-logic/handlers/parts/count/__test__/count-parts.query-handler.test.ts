import { BadRequestException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { AT_CENTRAL, AT_NORTHSIDE, AT_RIVERSIDE } from "#test-setup/users/test-users";
import { CENTRAL, NORTHSIDE, RIVERSIDE } from "#test-setup/postgres/seed-kit";
import { useTestDatabase } from "#test-setup/postgres/use-test-database";
import { CountPartsQueryHandler } from "../count-parts.query-handler";

const page = { page: 1, pageSize: 25 };

/**
 * ACME-124: the parts list's total, exact, asked once per search and filter. The plain list and a filter are counted
 * under the policies, a search as the owner with the scope written by hand (ACME-123), so these tests put another
 * location's, another dealer's, a deleted part and a part in a deleted bin beside the ones that count.
 */
describe("CountPartsQueryHandler", () => {
  const database = useTestDatabase();

  it("counts only this location's live parts in live bins: plain, filtered, by the bin, and searched", async () => {
    const seed = database.seed;
    await seed.addStockedPartAsync({ locationId: NORTHSIDE, partNumber: "CNT-1", quantityOnHand: 3 });
    await seed.addStockedPartAsync({ locationId: NORTHSIDE, partNumber: "CNT-2", quantityOnHand: 9 });
    await seed.addStockedPartAsync({ locationId: NORTHSIDE, partNumber: "CNT-3", quantityOnHand: 9, deleted: true });
    await seed.addStockedPartAsync({ locationId: NORTHSIDE, partNumber: "CNT-4", quantityOnHand: 9, binDeleted: true });
    await seed.addStockedPartAsync({ locationId: RIVERSIDE, partNumber: "CNT-5", quantityOnHand: 9 });
    await seed.addStockedPartAsync({ locationId: CENTRAL, partNumber: "CNT-6", quantityOnHand: 9 });
    const handler = database.asRequest(new CountPartsQueryHandler(database.unitOfWorkFactory));

    const plain = await handler.executeAsync(AT_NORTHSIDE, page);
    const plenty = await handler.executeAsync(AT_NORTHSIDE, {
      ...page,
      filterField: "onHand",
      filterOperator: ">",
      filterValue: "5",
    });
    const byBin = await handler.executeAsync(AT_NORTHSIDE, {
      ...page,
      filterField: "bin",
      filterOperator: "startsWith",
      filterValue: "B-CNT",
    });
    const searched = await handler.executeAsync(AT_NORTHSIDE, { ...page, search: "cnt" });

    expect(plain.total).toBe(2);
    expect(plenty.total).toBe(1);
    expect(byBin.total).toBe(2);
    expect(searched.total).toBe(2);
    await expect(handler.executeAsync(AT_RIVERSIDE, { ...page, search: "cnt" })).resolves.toEqual({ total: 1 });
    await expect(handler.executeAsync(AT_CENTRAL, page)).resolves.toEqual({ total: 1 });
  });

  it("ignores the page, the page size and the sort", async () => {
    const handler = database.asRequest(new CountPartsQueryHandler(database.unitOfWorkFactory));

    const later = await handler.executeAsync(AT_NORTHSIDE, { page: 9, pageSize: 1, sort: "onHand", direction: "desc" });

    expect(later.total).toBe(2);
  });

  it("counts 0 for words nobody has", async () => {
    const handler = database.asRequest(new CountPartsQueryHandler(database.unitOfWorkFactory));

    await expect(handler.executeAsync(AT_NORTHSIDE, { ...page, search: "hovercraft skirt" })).resolves.toEqual({
      total: 0,
    });
  });

  it("refuses a field the list does not have, as the list does", async () => {
    const handler = database.asRequest(new CountPartsQueryHandler(database.unitOfWorkFactory));

    await expect(
      handler.executeAsync(AT_NORTHSIDE, { ...page, filterField: "costPrice", filterOperator: "=", filterValue: "1" }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      handler.executeAsync(AT_NORTHSIDE, {
        ...page,
        search: "cnt",
        filterField: "x",
        filterOperator: "=",
        filterValue: "1",
      }),
    ).rejects.toThrow(BadRequestException);
  });
});
