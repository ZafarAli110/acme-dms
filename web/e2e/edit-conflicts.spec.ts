import { expect, type Page, test } from "@playwright/test";
import { createPartAsync, signInAsync, throwawaySurname } from "./support/demo-users";

function description(page: Page) {
  return page.getByTestId("part-description").locator("input");
}

function price(page: Page) {
  return page.getByTestId("part-unit-price").locator("input");
}

/**
 * Two people, in two windows, editing one record: the second save must neither overwrite the first nor be refused for
 * good. Each window is one page of the same signed-in browser; the conflict comes from the record's version.
 */
test.describe("two people editing one record", () => {
  test.beforeEach(async ({ page }) => {
    await signInAsync(page);
  });

  test("a part: keeping my edits puts them on top of the other person's, and the save goes through", async ({
    page,
    context,
    request,
  }) => {
    const part = await createPartAsync(request);
    const other = await context.newPage();
    await page.goto(`/parts/${part.id}`);
    await other.goto(`/parts/${part.id}`);

    await description(page).fill("Oil filter, spin-on, long life");
    await price(other).fill("12.50");
    await other.getByTestId("save-part").click();
    await expect(other.getByTestId("save-success")).toBeVisible();

    // Saved over the other person's change: refused, and their version is offered, with this window's edit kept.
    await page.getByTestId("save-part").click();
    await expect(page.getByTestId("changed-elsewhere")).toBeVisible();
    await expect(description(page)).toHaveValue("Oil filter, spin-on, long life");

    await page.getByTestId("keep-mine").click();
    await expect(page.getByTestId("changed-elsewhere")).toHaveCount(0);
    await page.getByTestId("save-part").click();
    await expect(page.getByTestId("save-success")).toBeVisible();

    await page.reload();
    await expect(description(page)).toHaveValue("Oil filter, spin-on, long life");
    await expect(price(page)).toHaveValue(/^12[.,]50$/);
  });

  test("a part: showing their version drops my edits and shows theirs", async ({ page, context, request }) => {
    const part = await createPartAsync(request);
    const other = await context.newPage();
    await page.goto(`/parts/${part.id}`);
    await other.goto(`/parts/${part.id}`);

    await description(page).fill("An edit that will be dropped");
    await price(other).fill("7.25");
    await other.getByTestId("save-part").click();
    await expect(other.getByTestId("save-success")).toBeVisible();

    await page.getByTestId("save-part").click();
    await page.getByTestId("show-latest").click();

    await expect(page.getByTestId("changed-elsewhere")).toHaveCount(0);
    await expect(description(page)).toHaveValue("Oil filter, spin-on");
    await expect(price(page)).toHaveValue(/^7[.,]25$/);
    await expect(page.getByTestId("save-part")).toBeDisabled();
  });

  test("a customer: keeping my edits puts them on top of the other person's", async ({ page, context }) => {
    await page.goto("/customers/new");
    await page.getByTestId("customer-firstName").locator("input").fill("Pat");
    await page.getByTestId("customer-surname").locator("input").fill(throwawaySurname());
    await page.getByTestId("save-customer").click();
    await expect(page).toHaveURL(/\/customers\/[0-9a-f-]{36}$/);
    const other = await context.newPage();
    await other.goto(page.url());

    await page.getByTestId("customer-city").locator("input").fill("Hillcrest");
    await other.getByTestId("customer-firstName").locator("input").fill("Patricia");
    await other.getByTestId("save-customer").click();
    await expect(other.getByTestId("save-success")).toBeVisible();

    await page.getByTestId("save-customer").click();
    await expect(page.getByTestId("changed-elsewhere")).toBeVisible();
    await page.getByTestId("keep-mine").click();
    await page.getByTestId("save-customer").click();
    await expect(page.getByTestId("save-success")).toBeVisible();

    await page.reload();
    await expect(page.getByTestId("customer-city").locator("input")).toHaveValue("Hillcrest");
    await expect(page.getByTestId("customer-firstName").locator("input")).toHaveValue("Patricia");
  });
});
