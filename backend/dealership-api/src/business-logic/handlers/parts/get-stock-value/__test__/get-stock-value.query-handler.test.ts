import { describe, expect, it } from "vitest";
import { AT_CENTRAL, AT_NORTHSIDE } from "#test-setup/users/test-users";
import { NORTHSIDE, RIVERSIDE } from "#test-setup/postgres/seed-kit";
import { useTestDatabase } from "#test-setup/postgres/use-test-database";
import { GetPartListQueryHandler } from "../../get-list/get-part-list.query-handler";
import { GetStockValueQueryHandler } from "../get-stock-value.query-handler";

describe("GetStockValueQueryHandler", () => {
  const database = useTestDatabase();

  it("sums on hand × price at the selected location only, to the cent, and matches the list's stock values", async () => {
    // 0.10 × 3 and 0.20 × 1: in floats 0.30000000000000004 + 0.2; in cents 30 + 20.
    await database.seed.addStockedPartAsync({
      locationId: NORTHSIDE,
      partNumber: "WSH-010",
      unitPriceCents: 10,
      quantityOnHand: 3,
    });
    await database.seed.addStockedPartAsync({
      locationId: NORTHSIDE,
      partNumber: "WSH-020",
      unitPriceCents: 20,
      quantityOnHand: 1,
    });
    await database.seed.addStockedPartAsync({
      locationId: NORTHSIDE,
      partNumber: "BIG-001",
      unitPriceCents: 123_456_789,
      quantityOnHand: 7,
    });
    await database.seed.addStockedPartAsync({
      locationId: NORTHSIDE,
      partNumber: "NONE-01",
      unitPriceCents: 4999,
      quantityOnHand: 0,
    });
    await database.seed.addStockedPartAsync({
      locationId: NORTHSIDE,
      partNumber: "OLD-001",
      quantityOnHand: 9,
      deleted: true,
    });
    await database.seed.addStockedPartAsync({
      locationId: RIVERSIDE,
      partNumber: "RIV-001",
      unitPriceCents: 9999,
      quantityOnHand: 4,
    });

    const value = await database
      .asRequest(new GetStockValueQueryHandler(database.unitOfWorkFactory))
      .executeAsync(AT_NORTHSIDE);
    const list = await database
      .asRequest(new GetPartListQueryHandler(database.unitOfWorkFactory))
      .executeAsync(AT_NORTHSIDE, { page: 1, pageSize: 2 });
    const allParts = await database
      .asRequest(new GetPartListQueryHandler(database.unitOfWorkFactory))
      .executeAsync(AT_NORTHSIDE, { page: 1, pageSize: 100 });

    expect(value.stockValueCents).toBe(30 + 20 + 864_197_523 + 0);
    expect(list.items).toHaveLength(2);
    expect(allParts.items.map((item) => [item.partNumber, item.stockValueCents])).toEqual([
      ["BIG-001", 864_197_523],
      ["NONE-01", 0],
      ["WSH-010", 30],
      ["WSH-020", 20],
    ]);
    expect(allParts.items.reduce((sum, item) => sum + item.stockValueCents, 0)).toBe(value.stockValueCents);
  });

  it("is $0.00 at a location with no stock (Central: another dealer, nothing stocked by these tests)", async () => {
    const value = await database
      .asRequest(new GetStockValueQueryHandler(database.unitOfWorkFactory))
      .executeAsync(AT_CENTRAL);

    expect(value).toEqual({ stockValueCents: 0 });
  });
});
