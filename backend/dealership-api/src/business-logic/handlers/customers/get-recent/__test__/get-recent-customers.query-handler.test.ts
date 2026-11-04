import { BadRequestException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { CENTRAL, NORTHSIDE, RIVERSIDE } from "#test-setup/postgres/seed-kit";
import { useTestDatabase } from "#test-setup/postgres/use-test-database";
import { AT_CENTRAL, AT_NORTHSIDE, AT_RIVERSIDE } from "#test-setup/users/test-users";
import { GetRecentCustomersQueryHandler } from "../get-recent-customers.query-handler";

const contacted = (day: string) => ({ lastContactDate: Temporal.PlainDate.from(day) });

describe("GetRecentCustomersQueryHandler", () => {
  // One database serves every test of this file, so the rows are seeded once and each user's view is read from them.
  const database = useTestDatabase();

  let seeded: Promise<GetRecentCustomersQueryHandler> | null = null;
  const seedOnceAsync = () => (seeded ??= seedAsync());

  async function seedAsync(): Promise<GetRecentCustomersQueryHandler> {
    await database.seed.addCustomerAsync({ locationId: NORTHSIDE, surname: "Doyle", ...contacted("2026-10-23") });
    await database.seed.addCustomerAsync({ locationId: NORTHSIDE, surname: "Byrne", ...contacted("2026-10-26") });
    // Must not come back at Northside: never contacted, deleted, another location, another dealer.
    await database.seed.addCustomerAsync({ locationId: NORTHSIDE, surname: "Never" });
    await database.seed.addCustomerAsync({
      locationId: NORTHSIDE,
      surname: "Deleted",
      deleted: true,
      ...contacted("2026-10-30"),
    });
    await database.seed.addCustomerAsync({ locationId: RIVERSIDE, surname: "Riverside", ...contacted("2026-10-29") });
    await database.seed.addCustomerAsync({ locationId: CENTRAL, surname: "CityMotors", ...contacted("2026-10-31") });
    return new GetRecentCustomersQueryHandler(database.unitOfWorkFactory);
  }

  it("returns only the selected location's contacted, undeleted customers, newest first", async () => {
    const handler = await seedOnceAsync();

    const atNorthside = await handler.executeAsync(AT_NORTHSIDE);
    const atRiverside = await handler.executeAsync(AT_RIVERSIDE);

    expect(atNorthside.map((customer) => customer.surname)).toEqual(["Byrne", "Doyle"]);
    expect(atRiverside.map((customer) => customer.surname)).toEqual(["Riverside"]);
  });

  it("returns none of another dealer's customers", async () => {
    const handler = await seedOnceAsync();

    // Here the location matches the rows and only the dealer does not, so only the dealer filter keeps them out.
    const northwindAtCentral = await handler.executeAsync({ ...AT_NORTHSIDE, locationId: CENTRAL });
    const cityMotorsAtNorthside = await handler.executeAsync({ ...AT_CENTRAL, locationId: NORTHSIDE });
    const cityMotors = await handler.executeAsync(AT_CENTRAL);

    expect(northwindAtCentral).toEqual([]);
    expect(cityMotorsAtNorthside).toEqual([]);
    expect(cityMotors.map((customer) => customer.surname)).toEqual(["CityMotors"]);
  });

  it("answers 400 when no location is selected", async () => {
    const handler = new GetRecentCustomersQueryHandler(database.unitOfWorkFactory);

    await expect(handler.executeAsync({ ...AT_NORTHSIDE, locationId: null })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe("GetRecentCustomersQueryHandler with customers contacted on the same day", () => {
  const database = useTestDatabase();

  it("lists them in the same order every time: by surname, then by id", async () => {
    const [first, second, third] = [1, 2, 3].map((n) => `01a1a25c-0000-7000-8000-00000000000${n}`);
    // Inserted in the reverse of their id order, so only an explicit sort by id puts them right.
    for (const id of [third, second, first]) {
      await database.seed.addCustomerAsync({ id, locationId: NORTHSIDE, surname: "Same", ...contacted("2026-10-31") });
    }

    const recent = await new GetRecentCustomersQueryHandler(database.unitOfWorkFactory).executeAsync(AT_NORTHSIDE);

    expect(recent.map((customer) => customer.id)).toEqual([first, second, third]);
  });
});
