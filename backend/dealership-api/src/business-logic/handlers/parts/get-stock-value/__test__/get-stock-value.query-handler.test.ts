import { readSettings } from "#settings/settings";
import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { AT_CENTRAL, AT_NORTHSIDE, userAt } from "#test-setup/users/test-users";
import { NORTHSIDE, RIVERSIDE } from "#test-setup/postgres/seed-kit";
import { useTestDatabase } from "#test-setup/postgres/use-test-database";
import { GetPartListQueryHandler } from "../../get-list/get-part-list.query-handler";
import type { IUnitOfWorkFactory } from "#persistence/unit-of-work/unit-of-work.factory.interface";
import { fixedClock, TEST_NOW } from "#test-setup/time/fixed-clock";
import { currentRequest, runWithDataScope, setDataScope } from "#request-scope/data-scope";
import { GetStockValueQueryHandler, STOCK_VALUE_TTL_MS } from "../get-stock-value.query-handler";

describe("GetStockValueQueryHandler", () => {
  const database = useTestDatabase();

  it("sums on hand × price at the selected location only, to the cent, and matches the list's stock values", async () => {
    // Never counted: a deleted part, deleted stock, stock in a deleted bin (ACME-124), another location's.
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
      locationId: NORTHSIDE,
      partNumber: "GONE-01",
      quantityOnHand: 9,
      stockDeleted: true,
    });
    await database.seed.addStockedPartAsync({
      locationId: NORTHSIDE,
      partNumber: "BIN-GONE",
      quantityOnHand: 9,
      binDeleted: true,
    });
    await database.seed.addStockedPartAsync({
      locationId: RIVERSIDE,
      partNumber: "RIV-001",
      unitPriceCents: 9999,
      quantityOnHand: 4,
    });

    const value = await database
      .asRequest(new GetStockValueQueryHandler(database.unitOfWorkFactory, fixedClock()))
      .executeAsync(AT_NORTHSIDE);
    const list = await database
      .asRequest(new GetPartListQueryHandler(database.unitOfWorkFactory, readSettings({})))
      .executeAsync(AT_NORTHSIDE, { page: 1, pageSize: 2 });
    const allParts = await database
      .asRequest(new GetPartListQueryHandler(database.unitOfWorkFactory, readSettings({})))
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
      .asRequest(new GetStockValueQueryHandler(database.unitOfWorkFactory, fixedClock()))
      .executeAsync(AT_CENTRAL);

    expect(value).toEqual({ stockValueCents: 0 });
  });

  // ACME-129: at most 10 seconds old, one sum per dealer and location at a time.
  it("keeps a location's value for 10 seconds, sums it once for callers at the same moment, and per location", async () => {
    const westgate = "20000000-0000-0000-0000-000000000003";
    const { part } = await database.seed.addStockedPartAsync({
      locationId: westgate,
      partNumber: "TTL-001",
      unitPriceCents: 500,
      quantityOnHand: 2,
    });
    let now = TEST_NOW;
    let sums = 0;
    const factory: IUnitOfWorkFactory = {
      ...database.unitOfWorkFactory,
      beginAsync: (options) => {
        sums += 1;
        return database.unitOfWorkFactory.beginAsync(options);
      },
      beginHealthCheckAsync: () => database.unitOfWorkFactory.beginHealthCheckAsync(),
    };
    const handler = database.asRequest(new GetStockValueQueryHandler(factory, { now: () => now }));
    const atWestgate = userAt(westgate);

    const together = await Promise.all([handler.executeAsync(atWestgate), handler.executeAsync(atWestgate)]);
    await database.db.execute(sql`update part_inventories set quantity_on_hand = 3 where part_id = ${part.id}`);
    const soon = await handler.executeAsync(atWestgate);
    now = now.add({ milliseconds: STOCK_VALUE_TTL_MS + 1 });
    const later = await handler.executeAsync(atWestgate);
    const elsewhere = await handler.executeAsync(AT_CENTRAL);

    expect(together).toEqual([{ stockValueCents: 1000 }, { stockValueCents: 1000 }]);
    expect(soon).toEqual({ stockValueCents: 1000 });
    expect(later).toEqual({ stockValueCents: 1500 });
    expect(elsewhere).toEqual({ stockValueCents: 0 });
    expect(sums).toBe(3);
  });

  // The state sweep's finding (ACME-129): the shared sum ran in the first caller's request, so that caller leaving
  // cancelled it, and every caller waiting on it was answered 503.
  it("runs the shared sum apart from the caller that started it: that caller leaving cancels nothing", async () => {
    const signals: (AbortSignal | null)[] = [];
    const factory: IUnitOfWorkFactory = {
      ...database.unitOfWorkFactory,
      beginAsync: (options) => {
        signals.push(currentRequest()?.signal ?? null);
        return database.unitOfWorkFactory.beginAsync(options);
      },
      beginHealthCheckAsync: () => database.unitOfWorkFactory.beginHealthCheckAsync(),
    };
    const handler = new GetStockValueQueryHandler(factory, fixedClock());
    const asCaller = (signal: AbortSignal) =>
      runWithDataScope(
        () => {
          setDataScope({ dealerId: AT_CENTRAL.dealerId, locationId: AT_CENTRAL.locationId, userId: AT_CENTRAL.userId });
          return handler.executeAsync(AT_CENTRAL);
        },
        { saves: false, signal, connectBy: null, committed: false },
      );
    const leaving = new AbortController();

    const first = asCaller(leaving.signal);
    const second = asCaller(new AbortController().signal);
    leaving.abort();

    await expect(second).resolves.toEqual({ stockValueCents: 0 });
    await expect(first).resolves.toEqual({ stockValueCents: 0 });
    expect(signals).toHaveLength(1);
    expect(signals[0]).not.toBe(leaving.signal);
    expect(signals[0]?.aborted).toBe(false);
  });

  it("keeps no failed sum: the next caller sums again", async () => {
    let fail = true;
    const factory: IUnitOfWorkFactory = {
      ...database.unitOfWorkFactory,
      beginAsync: (options) =>
        fail ? Promise.reject(new Error("down")) : database.unitOfWorkFactory.beginAsync(options),
      beginHealthCheckAsync: () => database.unitOfWorkFactory.beginHealthCheckAsync(),
    };
    const handler = database.asRequest(new GetStockValueQueryHandler(factory, fixedClock()));

    await expect(handler.executeAsync(AT_CENTRAL)).rejects.toThrow("down");
    fail = false;

    await expect(handler.executeAsync(AT_CENTRAL)).resolves.toEqual({ stockValueCents: 0 });
  });
});
