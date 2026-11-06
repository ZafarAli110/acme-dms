import { NotFoundException } from "@nestjs/common";
import { beforeAll, describe, expect, it } from "vitest";
import { type Customer, customers } from "#persistence/schema/customers";
import { CENTRAL, NORTHSIDE, RIVERSIDE } from "#test-setup/postgres/seed-kit";
import { useTestDatabase } from "#test-setup/postgres/use-test-database";
import { fixedClock } from "#test-setup/time/fixed-clock";
import { AT_CENTRAL, AT_NORTHSIDE } from "#test-setup/users/test-users";
import { GetBinListQueryHandler } from "../bins/get-list/get-bin-list.query-handler";
import { GetCustomerQueryHandler } from "../customers/get/get-customer.query-handler";
import { UpdateCustomerCommandHandler } from "../customers/update/update-customer.command-handler";
import { GetPartListQueryHandler } from "../parts/get-list/get-part-list.query-handler";
import { GetPartQueryHandler } from "../parts/get/get-part.query-handler";
import { GetStockListQueryHandler } from "../stock/get-list/get-stock-list.query-handler";
import { SetStockLevelCommandHandler } from "../stock/set-level/set-stock-level.command-handler";

/**
 * No handler names the dealer or the location in its own `where`: Postgres row-level security keeps a request to its own rows.
 * Here City Motors' rows (another dealer), Riverside's (the same dealer, another location) and a deleted customer sit beside
 * Northside's, and each handler, working as a request, must not see, change or even confirm them. One test per handler, so one
 * failure does not hide the others. (`row-level-security.test.ts` shows the same at the tables.)
 */
describe("handlers and rows that are not the request's", () => {
  const database = useTestDatabase();
  const page = { page: 1, pageSize: 25, search: undefined };
  const update = {
    firstName: "Taken",
    surname: "Over",
    companyName: null,
    email: null,
    phone: null,
    city: null,
    status: "active" as const,
    lastContactDate: null,
  };

  let anotherDealersCustomer: Customer;
  let anotherLocationsCustomer: Customer;
  let deletedCustomer: Customer;
  let theirPart: Awaited<ReturnType<typeof database.seed.addStockedPartAsync>>;
  let otherLocationsPart: Awaited<ReturnType<typeof database.seed.addStockedPartAsync>>;
  let ours: Awaited<ReturnType<typeof database.seed.addStockedPartAsync>>;

  beforeAll(async () => {
    anotherDealersCustomer = await database.seed.addCustomerAsync({ locationId: CENTRAL, surname: "TheirCustomer" });
    anotherLocationsCustomer = await database.seed.addCustomerAsync({
      locationId: RIVERSIDE,
      surname: "OtherLocation",
    });
    deletedCustomer = await database.seed.addCustomerAsync({
      locationId: NORTHSIDE,
      surname: "Removed",
      deleted: true,
    });
    theirPart = await database.seed.addStockedPartAsync({ locationId: CENTRAL, partNumber: "CM-ISOLATED" });
    otherLocationsPart = await database.seed.addStockedPartAsync({
      locationId: RIVERSIDE,
      partNumber: "NW-RIVERSIDE-ONLY",
    });
    ours = await database.seed.addStockedPartAsync({ locationId: NORTHSIDE, partNumber: "NW-ISOLATED" });
  });

  const customerHandler = () => database.asRequest(new GetCustomerQueryHandler(database.unitOfWorkFactory));
  const updateHandler = () =>
    database.asRequest(new UpdateCustomerCommandHandler(database.unitOfWorkFactory, fixedClock()));
  const partHandler = () => database.asRequest(new GetPartQueryHandler(database.unitOfWorkFactory));
  const setLevelHandler = () =>
    database.asRequest(new SetStockLevelCommandHandler(database.unitOfWorkFactory, fixedClock()));

  it("GetCustomer: another dealer's, another location's and a deleted customer are not found", async () => {
    for (const customer of [anotherDealersCustomer, anotherLocationsCustomer, deletedCustomer]) {
      await expect(customerHandler().executeAsync(AT_NORTHSIDE, customer.id), customer.surname).rejects.toThrow(
        NotFoundException,
      );
    }
  });

  it("UpdateCustomer: another dealer's, another location's and a deleted customer are not found, and are not changed", async () => {
    for (const customer of [anotherDealersCustomer, anotherLocationsCustomer, deletedCustomer]) {
      await expect(
        updateHandler().executeAsync(AT_NORTHSIDE, customer.id, update, null),
        customer.surname,
      ).rejects.toThrow(NotFoundException);
    }
    const unchanged = await database.db.select({ surname: customers.surname }).from(customers);
    expect(unchanged.map((row) => row.surname)).not.toContain("Over");
  });

  it("GetPart: a part another dealer stocks is not found", async () => {
    await expect(partHandler().executeAsync(AT_NORTHSIDE, theirPart.part.id)).rejects.toThrow(NotFoundException);
  });

  it("GetPart: a part only another location of the same dealer stocks is not found either", async () => {
    // A part belongs to the dealer, but it is found by the location that stocks it.
    await expect(partHandler().executeAsync(AT_NORTHSIDE, otherLocationsPart.part.id)).rejects.toThrow(
      NotFoundException,
    );
  });

  it("SetStockLevel: another dealer's part is not found, and another dealer's bin is not a bin of this location", async () => {
    await expect(
      setLevelHandler().executeAsync(AT_NORTHSIDE, theirPart.part.id, {
        binId: ours.bin.id,
        quantityOnHand: 1,
        reorderLevel: 1,
      }),
    ).rejects.toThrow(NotFoundException);
    await expect(
      setLevelHandler().executeAsync(AT_NORTHSIDE, ours.part.id, {
        binId: theirPart.bin.id,
        quantityOnHand: 1,
        reorderLevel: 1,
      }),
    ).rejects.toThrow(/Bin .* is not a bin of this location/);
  });

  it("the part, stock and bin lists show only the request's own location's rows, and each dealer sees its own", async () => {
    const parts = database.asRequest(new GetPartListQueryHandler(database.unitOfWorkFactory));
    const stock = database.asRequest(new GetStockListQueryHandler(database.unitOfWorkFactory));
    const bins = database.asRequest(new GetBinListQueryHandler(database.unitOfWorkFactory));

    expect((await parts.executeAsync(AT_NORTHSIDE, page)).items.map((item) => item.partNumber)).toEqual([
      "NW-ISOLATED",
    ]);
    expect((await stock.executeAsync(AT_NORTHSIDE, page)).items.map((item) => item.partNumber)).toEqual([
      "NW-ISOLATED",
    ]);
    expect((await bins.executeAsync(AT_NORTHSIDE)).map((bin) => bin.code)).toEqual(["B-NW-ISOLATED"]);
    expect((await parts.executeAsync(AT_CENTRAL, page)).items.map((item) => item.partNumber)).toEqual(["CM-ISOLATED"]);
  });
});
