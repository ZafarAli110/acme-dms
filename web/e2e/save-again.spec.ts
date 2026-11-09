import { expect, type Page, test } from "@playwright/test";
import { createPartAsync, signInAsync, throwawayPartNumber, throwawaySurname } from "./support/demo-users";

// ACME-125: pressing Save again after a save got no answer is always safe; nothing is added twice. A lost answer
// cannot be made on demand against the running system, so these lose it in the browser (Playwright's `page.route`):
// "after" lets the request reach the service and then fails the page's connection (the save went through, its answer
// did not come back); "before" fails it without sending (nothing reached the service).

const UNCONFIRMED = "We could not confirm the save. Save again: it will never be added twice.";
const WENT_THROUGH = "Your first save went through. This is what it saved; your later changes were not saved.";

const CUSTOMERS = /\/api\/dealership\/v1\/customers$/;
const ONE_PART = /\/api\/dealership\/v1\/parts\/[0-9a-f-]{36}$/;
const PARTS = /\/api\/dealership\/v1\/parts$/;

/** Loses the answer to the first matching request, "after" it reached the service or "before"; lets the rest through. */
async function loseFirstAnswerAsync(page: Page, url: RegExp, method: string, when: "after" | "before"): Promise<void> {
  let sent = 0;
  await page.route(url, async (route) => {
    if (route.request().method() !== method) {
      await route.fallback();
      return;
    }
    sent += 1;
    if (sent > 1) {
      await route.fallback();
      return;
    }
    if (when === "after") {
      await route.fetch();
    }
    await route.abort("connectionfailed");
  });
}

/** A first name no other record has, so a search for it counts only this test's customers. */
function uniqueFirstName(): string {
  const letters = Array.from({ length: 9 }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join("");
  return `E${letters}`;
}

/** A 1×1 PNG, as a person would pick from their files. */
function photo(name: string) {
  const onePixel = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  return { name, mimeType: "image/png", buffer: Buffer.from(onePixel, "base64") };
}

function field(page: Page, name: string) {
  return page.getByTestId(`customer-${name}`).locator("input");
}

async function fillNewCustomerAsync(page: Page, firstName: string, phone: string): Promise<void> {
  await page.goto("/customers/new");
  await field(page, "firstName").fill(firstName);
  await field(page, "surname").fill(throwawaySurname());
  await field(page, "phone").fill(phone);
}

/** How many rows the list shows for a search. */
async function rowsFoundAsync(page: Page, list: "customers" | "parts", search: string): Promise<number> {
  await page.goto(`/${list}?search=${search}`);
  const table = page.getByTestId(`${list}-table`);
  await expect(table.locator(".MuiDataGrid-row").first()).toBeVisible();
  return table.locator(".MuiDataGrid-row").count();
}

test.describe("saving again after no answer", () => {
  test.beforeEach(async ({ page }) => {
    await signInAsync(page);
  });

  test("a new customer whose answer was lost: the form keeps everything, and saving again adds it once", async ({
    page,
  }) => {
    const firstName = uniqueFirstName();
    await loseFirstAnswerAsync(page, CUSTOMERS, "POST", "after");
    await fillNewCustomerAsync(page, firstName, "555-0101");

    await page.getByTestId("save-customer").click();
    await expect(page.getByTestId("save-error")).toHaveText(UNCONFIRMED);
    await expect(field(page, "firstName")).toHaveValue(firstName);

    await page.getByTestId("save-customer").click();
    await expect(page).toHaveURL(/\/customers\/[0-9a-f-]{36}$/);
    expect(await rowsFoundAsync(page, "customers", firstName)).toBe(1);
  });

  test("changed before saving again: the first save went through, and the customer opens as it saved", async ({
    page,
  }) => {
    const firstName = uniqueFirstName();
    await loseFirstAnswerAsync(page, CUSTOMERS, "POST", "after");
    await fillNewCustomerAsync(page, firstName, "555-0102");
    await page.getByTestId("save-customer").click();
    await expect(page.getByTestId("save-error")).toHaveText(UNCONFIRMED);

    await field(page, "phone").fill("555-0199");
    await page.getByTestId("save-customer").click();

    await expect(page).toHaveURL(/\/customers\/[0-9a-f-]{36}\?first-save-went-through$/);
    await expect(page.getByTestId("save-went-through")).toHaveText(WENT_THROUGH);
    await expect(field(page, "phone")).toHaveValue("555-0102");
    expect(await rowsFoundAsync(page, "customers", firstName)).toBe(1);
  });

  test("a save that never left the page: the changed form is saved, once", async ({ page }) => {
    const firstName = uniqueFirstName();
    await loseFirstAnswerAsync(page, CUSTOMERS, "POST", "before");
    await fillNewCustomerAsync(page, firstName, "555-0103");
    await page.getByTestId("save-customer").click();
    await expect(page.getByTestId("save-error")).toHaveText(UNCONFIRMED);

    await field(page, "phone").fill("555-0198");
    await page.getByTestId("save-customer").click();

    await expect(page).toHaveURL(/\/customers\/[0-9a-f-]{36}$/);
    await expect(field(page, "phone")).toHaveValue("555-0198");
    expect(await rowsFoundAsync(page, "customers", firstName)).toBe(1);
  });

  test("a double click on Save adds one customer", async ({ page }) => {
    const firstName = uniqueFirstName();
    await fillNewCustomerAsync(page, firstName, "555-0104");

    await page.getByTestId("save-customer").dblclick();

    await expect(page).toHaveURL(/\/customers\/[0-9a-f-]{36}$/);
    expect(await rowsFoundAsync(page, "customers", firstName)).toBe(1);
  });

  test("a part changed with a new photo, its answer lost: saving again saves it once, one photo, never refused", async ({
    page,
    request,
  }) => {
    const part = await createPartAsync(request);
    await loseFirstAnswerAsync(page, ONE_PART, "PATCH", "after");
    await page.goto(`/parts/${part.id}`);
    await page.getByTestId("part-description").locator("input").fill("Oil filter, saved once");
    await page.getByTestId("photo-input").setInputFiles(photo("front.png"));

    await page.getByTestId("save-part").click();
    await expect(page.getByTestId("save-error")).toHaveText(UNCONFIRMED);
    await page.getByTestId("save-part").click();

    await expect(page.getByTestId("save-success")).toBeVisible();
    await page.reload();
    await expect(page.getByTestId("part-description").locator("input")).toHaveValue("Oil filter, saved once");
    await expect(page.getByTestId("photo-tile")).toHaveCount(1);
  });

  test("a part added in the dialog, its answer lost: adding again adds one part, never 'number in use'", async ({
    page,
  }) => {
    const partNumber = throwawayPartNumber();
    await loseFirstAnswerAsync(page, PARTS, "POST", "after");
    await page.goto("/parts");
    await page.getByTestId("create-part").click();
    await page.getByTestId("part-number").locator("input").fill(partNumber);
    await page.getByTestId("part-unit-price").locator("input").fill("12.50");
    await page.getByTestId("part-description").locator("input").fill("Wiper blade, 22 inch");
    await page.getByTestId("part-bin").click();
    await page.getByRole("option").first().click();

    await page.getByTestId("create-part-submit").click();
    await expect(page.getByRole("dialog")).toContainText(UNCONFIRMED);
    await page.getByTestId("create-part-submit").click();

    await expect(page).toHaveURL(/\/parts\/[0-9a-f-]{36}$/);
    expect(await rowsFoundAsync(page, "parts", partNumber)).toBe(1);
  });
});
