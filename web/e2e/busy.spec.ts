import { expect, type Page, test } from "@playwright/test";
import { signInAsync } from "./support/demo-users";

// ACME-122: what a person sees when the system answers "busy" (ACME-121). A real busy morning cannot be made on demand
// in a test, so these answer chosen requests busy in the browser (Playwright's `page.route`) and let the rest through to
// the running system; each counts the requests the page sent.

const RETRYING = "The system is busy, trying again…";
const STILL_BUSY = "The system is still busy. Try again in a moment.";
const NOTHING_SAVED = "The system is busy and nothing was saved. Your changes are still here: try again in a moment.";

const CUSTOMER_LIST = /\/api\/dealership\/v1\/customers\?/;
const RECENT_CUSTOMERS = /\/api\/dealership\/v1\/customers\/recent$/;
const ONE_CUSTOMER = /\/api\/dealership\/v1\/customers\/[0-9a-f-]{36}$/;
const ONE_PART = /\/api\/dealership\/v1\/parts\/[0-9a-f-]{36}$/;
const CUSTOMERS = /\/api\/dealership\/v1\/customers$/;
const PARTS = /\/api\/dealership\/v1\/parts$/;
const BINS = /\/api\/dealership\/v1\/bins$/;

interface Answering {
  /** How many matching requests the page sent, busy or not. */
  sent: () => number;
  /** The location the last matching request was for. */
  locationId: () => string | null;
}

/** Answers the first `times` matching requests busy, as ACME-121 does, and lets the rest through. */
async function answerBusyAsync(page: Page, url: RegExp, method: string, times: number): Promise<Answering> {
  let sent = 0;
  let locationId: string | null = null;
  await page.route(url, async (route) => {
    if (route.request().method() !== method) {
      await route.fallback();
      return;
    }
    sent += 1;
    locationId = route.request().headers()["x-location-id"] ?? null;
    if (sent > times) {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 503,
      headers: { "content-type": "application/problem+json", "retry-after": "1" },
      body: JSON.stringify({
        type: "urn:acme:error:busy",
        title: "Service Unavailable",
        status: 503,
        detail: "The system is busy. Try again in a moment.",
        instance: null,
        location: null,
        userId: null,
        traceId: null,
        timestamp: new Date().toISOString(),
      }),
    });
  });
  return { sent: () => sent, locationId: () => locationId };
}

/** A first name no other record has: letters only, as a name may be. */
function uniqueFirstName(): string {
  const letters = Array.from({ length: 9 }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join("");
  return `E${letters}`;
}

/** Opens the first row of a list and returns the record's address. */
async function firstRecordUrlAsync(page: Page, list: string, table: string): Promise<string> {
  await page.goto(list);
  await page.getByTestId(table).locator(".MuiDataGrid-row").first().click();
  await expect(page).toHaveURL(/\/[0-9a-f-]{36}$/);
  return page.url();
}

test.describe("when the system is busy", () => {
  test("a list opened from inside the app says it is trying again, then shows its rows", async ({ page }) => {
    await signInAsync(page);
    const list = await answerBusyAsync(page, CUSTOMER_LIST, "GET", 2);

    await page.locator('main a[href="/customers"]').click();

    await expect(page.getByTestId("busy-notice")).toHaveText(RETRYING);
    await expect(page.getByTestId("customers-table").locator(".MuiDataGrid-row").first()).toBeVisible();
    await expect(page.getByTestId("busy-notice")).toBeHidden();
    await page.waitForTimeout(1500);
    expect(list.sent()).toBe(3);
  });

  test("a list opened by its address shows the line over the loading screen, never a long spinner", async ({
    page,
  }) => {
    await signInAsync(page);
    const list = await answerBusyAsync(page, CUSTOMER_LIST, "GET", 2);

    await page.goto("/customers");

    await expect(page.getByTestId("busy-notice")).toHaveText(RETRYING);
    await expect(page.getByTestId("customers-table").locator(".MuiDataGrid-row").first()).toBeVisible();
    await page.waitForTimeout(1500);
    expect(list.sent()).toBe(3);
  });

  test("a list still busy after two tries says so above the grid, and asks no more", async ({ page }) => {
    await signInAsync(page);
    const list = await answerBusyAsync(page, CUSTOMER_LIST, "GET", 99);

    await page.goto("/customers");

    await expect(page.getByText(STILL_BUSY)).toBeVisible();
    await expect(page.getByTestId("busy-notice")).toBeHidden();
    await page.waitForTimeout(3000);
    expect(list.sent()).toBe(3);
  });

  test("signing in while Home's data is busy shows the line, then Home", async ({ page }) => {
    const recent = await answerBusyAsync(page, RECENT_CUSTOMERS, "GET", 2);

    await page.goto("/sign-in");
    await page.locator('input[name="email"]').fill("maria@northwind.test");
    await page.locator('input[name="password"]').fill("Acme123!");
    await page.locator('form button[type="submit"]').click();

    await expect(page.getByTestId("busy-notice")).toHaveText(RETRYING);
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByTestId("busy-notice")).toBeHidden();
    expect(recent.sent()).toBe(3);
    await expect(page.getByText(STILL_BUSY)).toBeHidden();
  });

  test("Home still busy says so at the top", async ({ page }) => {
    const recent = await answerBusyAsync(page, RECENT_CUSTOMERS, "GET", 99);

    await signInAsync(page);

    await expect(page.getByText(STILL_BUSY)).toBeVisible();
    await page.waitForTimeout(3000);
    expect(recent.sent()).toBe(3);
  });

  test("a customer's page busy shows the line then the customer; still busy, never 'not found'", async ({ page }) => {
    await signInAsync(page);
    const url = await firstRecordUrlAsync(page, "/customers", "customers-table");
    await expect(page.getByTestId("customer-firstName")).toBeVisible();
    const heading = await page.getByRole("heading", { level: 1 }).textContent();

    await page.goto("/");
    const once = await answerBusyAsync(page, ONE_CUSTOMER, "GET", 2);
    await page.goto(url);
    await expect(page.getByTestId("busy-notice")).toHaveText(RETRYING);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading ?? "");
    expect(once.sent()).toBe(3);

    await page.unroute(ONE_CUSTOMER);
    await page.goto("/");
    const always = await answerBusyAsync(page, ONE_CUSTOMER, "GET", 99);
    await page.goto(url);
    await expect(page.getByText(STILL_BUSY)).toBeVisible();
    await expect(page.getByTestId("customer-not-found")).toHaveCount(0);
    await page.waitForTimeout(3000);
    expect(always.sent()).toBe(3);
  });

  test("a part's page busy shows the line then the part; still busy, never 'not found'", async ({ page }) => {
    await signInAsync(page);
    const url = await firstRecordUrlAsync(page, "/parts", "parts-table");

    await page.goto("/");
    const once = await answerBusyAsync(page, ONE_PART, "GET", 2);
    await page.goto(url);
    await expect(page.getByTestId("busy-notice")).toHaveText(RETRYING);
    await expect(page.getByTestId("save-part")).toBeVisible();
    expect(once.sent()).toBe(3);

    await page.unroute(ONE_PART);
    await page.goto("/");
    const always = await answerBusyAsync(page, ONE_PART, "GET", 99);
    await page.goto(url);
    await expect(page.getByText(STILL_BUSY)).toBeVisible();
    await expect(page.getByTestId("part-not-found")).toHaveCount(0);
    await page.waitForTimeout(3000);
    expect(always.sent()).toBe(3);
  });

  test("a busy save keeps the form, is not sent again by itself, and saving by hand adds the customer once", async ({
    page,
  }) => {
    await signInAsync(page);
    const firstName = uniqueFirstName();
    await page.goto("/customers/new");
    await page.getByTestId("customer-firstName").locator("input").fill(firstName);
    await page.getByTestId("customer-surname").locator("input").fill("Busyday");
    const create = await answerBusyAsync(page, CUSTOMERS, "POST", 1);

    await page.getByTestId("save-customer").click();

    await expect(page.getByText(NOTHING_SAVED)).toBeVisible();
    await expect(page.getByTestId("customer-firstName").locator("input")).toHaveValue(firstName);
    await expect(page.getByTestId("customer-surname").locator("input")).toHaveValue("Busyday");
    await page.waitForTimeout(2500);
    expect(create.sent()).toBe(1);

    await page.getByTestId("save-customer").click();
    await expect(page).toHaveURL(/\/customers\/[0-9a-f-]{36}$/);
    expect(create.sent()).toBe(2);
    const found = await page.request.get(`/api/dealership/v1/customers?search=${firstName}`, {
      headers: { "x-location-id": create.locationId() ?? "" },
    });
    const { items } = (await found.json()) as { items: { firstName: string }[] };
    expect(items.filter((item) => item.firstName === firstName)).toHaveLength(1);

    // An edit of that customer told busy: the same message, the field as typed, sent once.
    const edit = await answerBusyAsync(page, ONE_CUSTOMER, "PUT", 1);
    await page.getByTestId("customer-surname").locator("input").fill("Busyweek");
    await page.getByTestId("save-customer").click();
    await expect(page.getByText(NOTHING_SAVED)).toBeVisible();
    await expect(page.getByTestId("customer-surname").locator("input")).toHaveValue("Busyweek");
    await page.waitForTimeout(2500);
    expect(edit.sent()).toBe(1);
  });

  test("the new-part dialog says 'still busy' for its bins and 'nothing was saved' for its save", async ({ page }) => {
    await signInAsync(page);
    const bins = await answerBusyAsync(page, BINS, "GET", 99);
    await page.goto("/parts");
    await page.getByTestId("create-part").click();
    await expect(page.getByRole("dialog").getByText(STILL_BUSY)).toBeVisible();
    expect(bins.sent()).toBe(3);
    await page.keyboard.press("Escape");

    await page.unroute(BINS);
    await page.reload();
    const create = await answerBusyAsync(page, PARTS, "POST", 99);
    await page.getByTestId("create-part").click();
    const dialog = page.getByRole("dialog");
    await dialog.getByTestId("part-number").locator("input").fill("BUSY-000001");
    await dialog.getByTestId("part-unit-price").locator("input").fill("1.00");
    await dialog.getByTestId("part-description").locator("input").fill("Oil filter, spin-on");
    await dialog.getByTestId("part-bin").click();
    await page.getByRole("option").first().click();
    await dialog.getByTestId("create-part-submit").click();

    await expect(dialog.getByText(NOTHING_SAVED)).toBeVisible();
    await expect(dialog.getByTestId("part-description").locator("input")).toHaveValue("Oil filter, spin-on");
    await page.waitForTimeout(2500);
    expect(create.sent()).toBe(1);
  });
});
