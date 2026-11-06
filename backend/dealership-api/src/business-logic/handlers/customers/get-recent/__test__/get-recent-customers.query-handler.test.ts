import { BadRequestException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { CENTRAL, NORTHSIDE, RIVERSIDE } from "#test-setup/postgres/seed-kit";
import { useTestDatabase } from "#test-setup/postgres/use-test-database";
import { AT_NORTHSIDE, AT_RIVERSIDE, userAt } from "#test-setup/users/test-users";
import { GetRecentCustomersQueryHandler } from "../get-recent-customers.query-handler";

const day = (iso: string) => Temporal.PlainDate.from(iso);

describe("GetRecentCustomersQueryHandler", () => {
  const database = useTestDatabase();

  it("returns this location's most recently contacted customers, newest first, and no one else's", async () => {
    const seed = database.seed;
    await seed.addCustomerAsync({ locationId: NORTHSIDE, surname: "Doyle", lastContactDate: day("2026-10-23") });
    await seed.addCustomerAsync({ locationId: NORTHSIDE, surname: "Byrne", lastContactDate: day("2026-10-26") });
    // What must not come back: never contacted, deleted, another location of the dealer, another dealer.
    await seed.addCustomerAsync({ locationId: NORTHSIDE, surname: "Never" });
    await seed.addCustomerAsync({
      locationId: NORTHSIDE,
      surname: "Gone",
      lastContactDate: day("2026-10-30"),
      deleted: true,
    });
    await seed.addCustomerAsync({ locationId: RIVERSIDE, surname: "Farooq", lastContactDate: day("2026-10-31") });
    await seed.addCustomerAsync({ locationId: CENTRAL, surname: "Adeyemi", lastContactDate: day("2026-10-31") });

    const handler = database.asRequest(new GetRecentCustomersQueryHandler(database.unitOfWorkFactory));

    expect((await handler.executeAsync(AT_NORTHSIDE)).map((customer) => customer.surname)).toEqual(["Byrne", "Doyle"]);
    expect((await handler.executeAsync(AT_RIVERSIDE)).map((customer) => customer.surname)).toEqual(["Farooq"]);
  });

  it("refuses a request with no location selected", async () => {
    const handler = database.asRequest(new GetRecentCustomersQueryHandler(database.unitOfWorkFactory));

    await expect(handler.executeAsync({ ...userAt(NORTHSIDE), locationId: null })).rejects.toThrow(BadRequestException);
  });
});
