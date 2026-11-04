import { BadRequestException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { CENTRAL, CITY_MOTORS, NORTHSIDE, RIVERSIDE } from "#test-setup/postgres/seed-kit";
import { useTestDatabase } from "#test-setup/postgres/use-test-database";
import { AT_CENTRAL, AT_NORTHSIDE, AT_RIVERSIDE } from "#test-setup/users/test-users";
import { GetRecentCustomersQueryHandler, RECENT_CUSTOMERS_LIMIT } from "../get-recent-customers.query-handler";

const date = (iso: string) => Temporal.PlainDate.from(iso);

describe("GetRecentCustomersQueryHandler", () => {
  const database = useTestDatabase();

  it("returns the most recently contacted customers of the user's location, newest first", async () => {
    await database.seed.addCustomerAsync({
      locationId: NORTHSIDE,
      surname: "Doyle",
      lastContactDate: date("2026-10-23"),
    });
    await database.seed.addCustomerAsync({
      locationId: NORTHSIDE,
      surname: "Byrne",
      lastContactDate: date("2026-10-26"),
    });
    await database.seed.addCustomerAsync({ locationId: NORTHSIDE, surname: "Never" });

    const recent = await new GetRecentCustomersQueryHandler(database.unitOfWorkFactory).executeAsync(AT_NORTHSIDE);

    expect(recent.map((customer) => customer.surname)).toEqual(["Byrne", "Doyle"]);
  });

  it("never returns another location's, another dealer's or a deleted customer", async () => {
    await database.seed.addCustomerAsync({
      locationId: RIVERSIDE,
      surname: "Riverside",
      lastContactDate: date("2026-10-20"),
    });
    // Newer than Riverside's own, so they would come first if anything let them through.
    await database.seed.addCustomerAsync({
      locationId: NORTHSIDE,
      surname: "OtherLocation",
      lastContactDate: date("2026-10-30"),
    });
    // Another dealer's customer at the caller's own location: only the dealer filter can exclude it.
    await database.seed.addCustomerAsync({
      locationId: RIVERSIDE,
      dealerId: CITY_MOTORS,
      surname: "OtherDealer",
      lastContactDate: date("2026-10-31"),
    });
    await database.seed.addCustomerAsync({
      locationId: RIVERSIDE,
      surname: "Deleted",
      lastContactDate: date("2026-11-01"),
      deleted: true,
    });

    const recent = await new GetRecentCustomersQueryHandler(database.unitOfWorkFactory).executeAsync(AT_RIVERSIDE);

    expect(recent.map((customer) => customer.surname)).toEqual(["Riverside"]);
  });

  it("returns no more than the limit, the newest ones, when more customers qualify", async () => {
    // Central holds no other test's customers, so these six are all the user can see.
    for (const [index, surname] of ["Aa", "Bb", "Cc", "Dd", "Ee", "Ff"].entries()) {
      await database.seed.addCustomerAsync({
        locationId: CENTRAL,
        surname,
        lastContactDate: date(`2026-10-0${index + 1}`),
      });
    }

    const recent = await new GetRecentCustomersQueryHandler(database.unitOfWorkFactory).executeAsync(AT_CENTRAL);

    expect(RECENT_CUSTOMERS_LIMIT).toBe(5);
    expect(recent.map((customer) => customer.surname)).toEqual(["Ff", "Ee", "Dd", "Cc", "Bb"]);
  });

  it("answers 400 when no location is selected", async () => {
    const handler = new GetRecentCustomersQueryHandler(database.unitOfWorkFactory);

    await expect(handler.executeAsync({ ...AT_RIVERSIDE, locationId: null })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
