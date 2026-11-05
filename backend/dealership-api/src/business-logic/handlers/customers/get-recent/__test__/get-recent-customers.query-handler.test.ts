import { BadRequestException } from "@nestjs/common";
import { beforeEach, describe, expect, it } from "vitest";
import { customers } from "#persistence/schema/index";
import { CENTRAL, CITY_MOTORS, NORTHSIDE, RIVERSIDE } from "#test-setup/postgres/seed-kit";
import { useTestDatabase } from "#test-setup/postgres/use-test-database";
import { AT_CENTRAL, AT_NORTHSIDE, AT_RIVERSIDE, userAt } from "#test-setup/users/test-users";
import { GetRecentCustomersQueryHandler } from "../get-recent-customers.query-handler";

describe("GetRecentCustomersQueryHandler", () => {
  const database = useTestDatabase();

  // The database is shared by the tests of this file: each starts with no customers.
  beforeEach(async () => {
    await database.db.delete(customers);
  });

  function handler(): GetRecentCustomersQueryHandler {
    return new GetRecentCustomersQueryHandler(database.unitOfWorkFactory);
  }

  it("returns the selected location's most recently contacted customers, newest first", async () => {
    await database.seed.addCustomerAsync({
      locationId: NORTHSIDE,
      surname: "Doyle",
      lastContactDate: Temporal.PlainDate.from("2026-10-23"),
    });
    await database.seed.addCustomerAsync({
      locationId: NORTHSIDE,
      surname: "Byrne",
      lastContactDate: Temporal.PlainDate.from("2026-10-26"),
    });

    const recent = await handler().executeAsync(AT_NORTHSIDE);

    expect(recent.map((customer) => customer.surname)).toEqual(["Byrne", "Doyle"]);
  });

  it("returns only the selected location's customers, not another location's of the same dealer", async () => {
    await database.seed.addCustomerAsync({
      locationId: NORTHSIDE,
      surname: "Northsider",
      lastContactDate: Temporal.PlainDate.from("2026-10-20"),
    });
    await database.seed.addCustomerAsync({
      locationId: RIVERSIDE,
      surname: "Riversider",
      lastContactDate: Temporal.PlainDate.from("2026-10-30"),
    });

    const northside = await handler().executeAsync(AT_NORTHSIDE);
    const riverside = await handler().executeAsync(AT_RIVERSIDE);

    expect(northside.map((customer) => customer.surname)).toEqual(["Northsider"]);
    expect(riverside.map((customer) => customer.surname)).toEqual(["Riversider"]);
  });

  it("returns none of another dealer's customers, even ones filed under the same location id", async () => {
    await database.seed.addCustomerAsync({
      locationId: NORTHSIDE,
      surname: "Ours",
      lastContactDate: Temporal.PlainDate.from("2026-10-20"),
    });
    // Another dealer's row carrying Northside's location id: only the dealer filter can keep it out.
    await database.seed.addCustomerAsync({
      locationId: NORTHSIDE,
      dealerId: CITY_MOTORS,
      surname: "Theirs",
      lastContactDate: Temporal.PlainDate.from("2026-10-30"),
    });
    await database.seed.addCustomerAsync({
      locationId: CENTRAL,
      surname: "Central",
      lastContactDate: Temporal.PlainDate.from("2026-10-31"),
    });

    const northwind = await handler().executeAsync(AT_NORTHSIDE);
    const cityMotors = await handler().executeAsync(AT_CENTRAL);

    expect(northwind.map((customer) => customer.surname)).toEqual(["Ours"]);
    expect(cityMotors.map((customer) => customer.surname)).toEqual(["Central"]);
  });

  it("leaves out deleted customers and customers never contacted", async () => {
    await database.seed.addCustomerAsync({
      locationId: NORTHSIDE,
      surname: "Gone",
      lastContactDate: Temporal.PlainDate.from("2026-10-30"),
      deleted: true,
    });
    await database.seed.addCustomerAsync({ locationId: NORTHSIDE, surname: "Never" });

    await expect(handler().executeAsync(AT_NORTHSIDE)).resolves.toEqual([]);
  });

  it("returns an empty list for a location with no contacted customers, not another location's", async () => {
    await database.seed.addCustomerAsync({
      locationId: NORTHSIDE,
      surname: "Northsider",
      lastContactDate: Temporal.PlainDate.from("2026-10-20"),
    });

    await expect(handler().executeAsync(AT_RIVERSIDE)).resolves.toEqual([]);
  });

  it("is refused when no location is selected", async () => {
    await database.seed.addCustomerAsync({
      locationId: NORTHSIDE,
      surname: "Northsider",
      lastContactDate: Temporal.PlainDate.from("2026-10-20"),
    });

    await expect(handler().executeAsync({ ...userAt(NORTHSIDE), locationId: null })).rejects.toThrow(
      BadRequestException,
    );
  });
});
