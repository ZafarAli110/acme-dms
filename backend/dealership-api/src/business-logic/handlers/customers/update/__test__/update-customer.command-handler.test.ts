import { NotFoundException, PreconditionFailedException } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { customers } from "#persistence/schema/customers";
import { describe, expect, it } from "vitest";
import { fixedClock } from "#test-setup/time/fixed-clock";
import { AT_NORTHSIDE, AT_RIVERSIDE } from "#test-setup/users/test-users";
import { NORTHSIDE } from "#test-setup/postgres/seed-kit";
import { useTestDatabase } from "#test-setup/postgres/use-test-database";
import { UpdateCustomerCommandHandler } from "../update-customer.command-handler";

const ALL_FIELDS = {
  firstName: "Grace",
  surname: "Hopper",
  companyName: null,
  email: "grace@example.test",
  phone: null,
  city: "Hillcrest",
  status: "active" as const,
  lastContactDate: "2026-10-21",
};

describe("UpdateCustomerCommandHandler", () => {
  const database = useTestDatabase();

  it("replaces every field, null included", async () => {
    const customer = await database.seed.addCustomerAsync({
      locationId: NORTHSIDE,
      surname: "Hopper",
      companyName: "Hopper Logistics",
    });

    const updated = await database
      .asRequest(new UpdateCustomerCommandHandler(database.unitOfWorkFactory, fixedClock()))
      .executeAsync(AT_NORTHSIDE, customer.id, ALL_FIELDS, 1);

    expect(updated).toMatchObject({ ...ALL_FIELDS, id: customer.id, locationId: NORTHSIDE, version: 2 });
    expect(updated.companyName).toBeNull();
  });

  it("refuses another location's customer", async () => {
    const customer = await database.seed.addCustomerAsync({ locationId: NORTHSIDE, surname: "Hopper" });

    await expect(
      database
        .asRequest(new UpdateCustomerCommandHandler(database.unitOfWorkFactory, fixedClock()))
        .executeAsync(AT_RIVERSIDE, customer.id, ALL_FIELDS, 1),
    ).rejects.toThrow(NotFoundException);
  });

  it("refuses a save that started from an older version, and keeps the newer one", async () => {
    const customer = await database.seed.addCustomerAsync({ locationId: NORTHSIDE, surname: "Hopper" });
    const handler = database.asRequest(new UpdateCustomerCommandHandler(database.unitOfWorkFactory, fixedClock()));
    // Two people opened version 1; the first saves.
    await handler.executeAsync(AT_NORTHSIDE, customer.id, { ...ALL_FIELDS, city: "Leeds" }, 1);

    await expect(handler.executeAsync(AT_NORTHSIDE, customer.id, { ...ALL_FIELDS, city: "York" }, 1)).rejects.toThrow(
      PreconditionFailedException,
    );
    const [stored] = await database.db.select().from(customers).where(eq(customers.id, customer.id));
    expect(stored).toMatchObject({ city: "Leeds", version: 2 });
  });

  it("saves whatever the version for If-Match: * (null), and still refuses another location's", async () => {
    const customer = await database.seed.addCustomerAsync({ locationId: NORTHSIDE, surname: "Hopper" });
    const handler = database.asRequest(new UpdateCustomerCommandHandler(database.unitOfWorkFactory, fixedClock()));
    await handler.executeAsync(AT_NORTHSIDE, customer.id, ALL_FIELDS, 1);

    expect((await handler.executeAsync(AT_NORTHSIDE, customer.id, ALL_FIELDS, null)).version).toBe(3);
    await expect(handler.executeAsync(AT_RIVERSIDE, customer.id, ALL_FIELDS, null)).rejects.toThrow(NotFoundException);
  });
});
