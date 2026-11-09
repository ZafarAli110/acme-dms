import { readSettings } from "#settings/settings";
import { beforeAll, describe, expect, it } from "vitest";
import { AT_NORTHSIDE, AT_RIVERSIDE } from "#test-setup/users/test-users";
import { NORTHSIDE, RIVERSIDE } from "#test-setup/postgres/seed-kit";
import { useTestDatabase } from "#test-setup/postgres/use-test-database";
import { GetCustomerListQueryHandler } from "../get-customer-list.query-handler";

const page = { page: 1, pageSize: 25 };

/** "First Surname (match)" for each item: what a test expects to see. */
function named(items: { surname: string; firstName: string; match: string }[]): string[] {
  return items.map((item) => `${item.firstName} ${item.surname} (${item.match})`);
}

/**
 * ACME-120: a search finds customers whose name or company is spelt a little differently, and says so (`match:
 * "close"`), after the exact matches, on page 1 only. A known name is a correct spelling: today's list. Phones and
 * emails stay exact.
 */
describe("GetCustomerListQueryHandler: close spellings", () => {
  const database = useTestDatabase();

  beforeAll(async () => {
    const seed = database.seed;
    await seed.addCustomerAsync({
      locationId: NORTHSIDE,
      firstName: "Yusuf",
      surname: "Penwood",
      phone: "07336 421692",
    });
    await seed.addCustomerAsync({
      locationId: NORTHSIDE,
      firstName: "Amy",
      surname: "Penwood",
      email: "amy@outlook.com",
    });
    await seed.addCustomerAsync({
      locationId: NORTHSIDE,
      firstName: "Bilal",
      surname: "Shah",
      companyName: "Penwood Haulage",
    });
    await seed.addCustomerAsync({ locationId: NORTHSIDE, firstName: "Ava", surname: "Penworth" });
    await seed.addCustomerAsync({ locationId: NORTHSIDE, firstName: "Cara", surname: "Whitworth" });
    await seed.addCustomerAsync({ locationId: RIVERSIDE, firstName: "Dev", surname: "Riverlyn" });
    // A rare name beside a common one the same plain distance away: "hpoper" is one swap from Hopper, two edits from
    // Harper (the verifier's finding).
    await seed.addCustomerAsync({ locationId: NORTHSIDE, firstName: "Grace", surname: "Hopper" });
    for (let index = 0; index < 30; index++) {
      await seed.addCustomerAsync({ locationId: NORTHSIDE, firstName: `Harp${index}`, surname: "Harper" });
    }
  });

  const handler = () =>
    database.asRequest(new GetCustomerListQueryHandler(database.unitOfWorkFactory, readSettings({})));

  it("finds Penwood for a letter missing, an extra letter, or two letters swapped, closest first", async () => {
    for (const search of ["penwod", "penwoood", "pnewood"]) {
      const found = await handler().executeAsync(AT_NORTHSIDE, { ...page, search });

      expect(found.items.every((item) => item.match === "close")).toBe(true);
      expect(named(found.items).slice(0, 2).toSorted()).toEqual(["Amy Penwood (close)", "Yusuf Penwood (close)"]);
    }
  });

  it("ranks a swap of two letters as one edit, and lets no one name fill the page", async () => {
    const found = await handler().executeAsync(AT_NORTHSIDE, { ...page, search: "hpoper" });

    expect(named(found.items)[0]).toBe("Grace Hopper (close)");
    expect(found.items.filter((item) => item.surname === "Harper").length).toBeLessThanOrEqual(10);
  });

  // A part of an email or a phone is not a name: exact, as today (Zafar Ali, 8 Nov).
  it("keeps a search with @, a dot or a digit exact", async () => {
    const found = await handler().executeAsync(AT_NORTHSIDE, { ...page, search: "amy@outl" });

    expect(named(found.items)).toEqual(["Amy Penwood (exact)"]);
  });

  it("finds the customers of a company whose word is misspelt", async () => {
    const found = await handler().executeAsync(AT_NORTHSIDE, { ...page, search: "haulge" });

    expect(named(found.items)).toContain("Bilal Shah (close)");
  });

  it("shows a known name exactly as today: no close spellings", async () => {
    const found = await handler().executeAsync(AT_NORTHSIDE, { ...page, search: "Penwood" });

    // Bilal Shah's company is Penwood Haulage: an exact match, as today.
    expect(named(found.items).toSorted()).toEqual([
      "Amy Penwood (exact)",
      "Bilal Shah (exact)",
      "Yusuf Penwood (exact)",
    ]);
  });

  it("puts the exact matches first, then close spellings to fill page 1; page 2 has exact matches only", async () => {
    const first = await handler().executeAsync(AT_NORTHSIDE, { ...page, search: "penwort" });
    const second = await handler().executeAsync(AT_NORTHSIDE, { page: 2, pageSize: 25, search: "penwort" });

    expect(named(first.items)[0]).toBe("Ava Penworth (exact)");
    expect(first.items.slice(1).every((item) => item.match === "close")).toBe(true);
    expect(first.items.length).toBeGreaterThan(1);
    expect(second.items).toEqual([]);
  });

  it("finds part of an email as today", async () => {
    const found = await handler().executeAsync(AT_NORTHSIDE, { ...page, search: "outlook" });

    expect(named(found.items)).toEqual(["Amy Penwood (exact)"]);
  });

  it("never close-matches a phone number: one digit wrong finds nobody", async () => {
    const found = await handler().executeAsync(AT_NORTHSIDE, { ...page, search: "421693" });

    expect(found.items).toEqual([]);
  });

  it("suggests only the person's own location's customers", async () => {
    const found = await handler().executeAsync(AT_RIVERSIDE, { ...page, search: "penwod" });

    expect(found.items).toEqual([]);
  });

  it("keeps a search under three letters, or of several words, exact", async () => {
    const short = await handler().executeAsync(AT_NORTHSIDE, { ...page, search: "wh" });
    const words = await handler().executeAsync(AT_NORTHSIDE, { ...page, search: "penwod yusuf" });

    expect(short.items.every((item) => item.match === "exact")).toBe(true);
    expect(words.items).toEqual([]);
  });

  it("finds nothing when nothing is exact or close", async () => {
    const found = await handler().executeAsync(AT_NORTHSIDE, { ...page, search: "zzqqx" });

    expect(found.items).toEqual([]);
  });
});
