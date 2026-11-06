import { NotFoundException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { CENTRAL, NORTHSIDE } from "#test-setup/postgres/seed-kit";
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
 * No handler names the dealer or the location in its own `where`: Postgres row-level security keeps a request to its
 * own rows. Here City Motors' rows sit beside Northwind's, and each handler, working as a request, must not see, change
 * or even confirm them. (`row-level-security.test.ts` shows the same at the tables; this shows it through the handlers.)
 */
describe("handlers and another dealer's rows", () => {
  const database = useTestDatabase();
  const page = { page: 1, pageSize: 25, search: undefined };

  it("never show another dealer's customer, part, bin or stock, and answer 'not found' for their ids", async () => {
    const theirs = await database.seed.addCustomerAsync({ locationId: CENTRAL, surname: "TheirCustomer" });
    const theirPart = await database.seed.addStockedPartAsync({ locationId: CENTRAL, partNumber: "CM-ISOLATED" });
    const ours = await database.seed.addStockedPartAsync({ locationId: NORTHSIDE, partNumber: "NW-ISOLATED" });

    const customer = database.asRequest(new GetCustomerQueryHandler(database.unitOfWorkFactory));
    const update = database.asRequest(new UpdateCustomerCommandHandler(database.unitOfWorkFactory, fixedClock()));
    const part = database.asRequest(new GetPartQueryHandler(database.unitOfWorkFactory));
    const parts = database.asRequest(new GetPartListQueryHandler(database.unitOfWorkFactory));
    const stock = database.asRequest(new GetStockListQueryHandler(database.unitOfWorkFactory));
    const bins = database.asRequest(new GetBinListQueryHandler(database.unitOfWorkFactory));
    const setLevel = database.asRequest(new SetStockLevelCommandHandler(database.unitOfWorkFactory, fixedClock()));

    await expect(customer.executeAsync(AT_NORTHSIDE, theirs.id)).rejects.toThrow(NotFoundException);
    await expect(
      update.executeAsync(
        AT_NORTHSIDE,
        theirs.id,
        {
          firstName: "Taken",
          surname: "Over",
          companyName: null,
          email: null,
          phone: null,
          city: null,
          status: "active",
          lastContactDate: null,
        },
        null,
      ),
    ).rejects.toThrow(NotFoundException);
    await expect(part.executeAsync(AT_NORTHSIDE, theirPart.part.id)).rejects.toThrow(NotFoundException);
    await expect(
      setLevel.executeAsync(AT_NORTHSIDE, theirPart.part.id, {
        binId: ours.bin.id,
        quantityOnHand: 1,
        reorderLevel: 1,
      }),
    ).rejects.toThrow(NotFoundException);
    await expect(
      setLevel.executeAsync(AT_NORTHSIDE, ours.part.id, {
        binId: theirPart.bin.id,
        quantityOnHand: 1,
        reorderLevel: 1,
      }),
    ).rejects.toThrow(/Bin .* is not a bin of this location/);

    const partNumbers = (await parts.executeAsync(AT_NORTHSIDE, page)).items.map((item) => item.partNumber);
    const stocked = (await stock.executeAsync(AT_NORTHSIDE, page)).items.map((item) => item.partNumber);
    const binCodes = (await bins.executeAsync(AT_NORTHSIDE)).map((bin) => bin.code);
    expect(partNumbers).toEqual(["NW-ISOLATED"]);
    expect(stocked).toEqual(["NW-ISOLATED"]);
    expect(binCodes).toEqual(["B-NW-ISOLATED"]);

    // And the other way round: City Motors sees only its own.
    expect((await parts.executeAsync(AT_CENTRAL, page)).items.map((item) => item.partNumber)).toEqual(["CM-ISOLATED"]);
  });
});
