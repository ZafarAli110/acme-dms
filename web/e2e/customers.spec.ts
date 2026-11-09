import { expect, test } from "@playwright/test";
import { signInAsync, throwawaySurname } from "./support/demo-users";

test.describe("customers", () => {
  test.beforeEach(async ({ page }) => {
    await signInAsync(page);
  });

  test("a new prospect is created and shown on its own page", async ({ page }) => {
    const surname = throwawaySurname();
    await page.goto("/customers/new");
    await page.getByTestId("customer-firstName").locator("input").fill("Pat");
    await page.getByTestId("customer-surname").locator("input").fill(surname);
    await page.getByTestId("save-customer").click();

    await expect(page).toHaveURL(/\/customers\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { name: `Pat ${surname}` })).toBeVisible();
  });

  test("a filter from a shared link shows only the matching rows, with the filter marked", async ({ page }) => {
    await page.goto("/customers?filterField=status&filterOperator=is&filterValue=prospect");

    const statuses = page.getByTestId("customers-table").locator('[role="gridcell"][data-field="status"]');
    await expect(statuses.first()).toHaveText("Prospect");
    expect(new Set(await statuses.allTextContents())).toEqual(new Set(["Prospect"]));
    await expect(page.getByTestId("grid-filters").locator(".MuiBadge-dot")).toBeVisible();
  });

  test("missing names are shown on their fields", async ({ page }) => {
    await page.goto("/customers/new");
    await page.getByTestId("save-customer").click();

    await expect(page.getByText("Enter a first name.")).toBeVisible();
    await expect(page.getByText("Enter a surname.")).toBeVisible();
    await expect(page).toHaveURL(/\/customers\/new$/);
  });

  test("an edit is saved", async ({ page }) => {
    await page.goto("/customers/new");
    await page.getByTestId("customer-firstName").locator("input").fill("Pat");
    await page.getByTestId("customer-surname").locator("input").fill(throwawaySurname());
    await page.getByTestId("save-customer").click();
    await expect(page).toHaveURL(/\/customers\/[0-9a-f-]{36}$/);

    await page.getByTestId("customer-city").locator("input").fill("Hillcrest");
    await page.getByTestId("save-customer").click();

    await expect(page.getByTestId("save-success")).toHaveText("Saved.");
  });

  // ACME-129: a big list says "about"; next, last and a jump cost what page 1 costs.
  test("the whole list says about how many; Last, Previous and the page box move through it", async ({ page }) => {
    await page.goto("/customers");
    const rows = page.getByTestId("list-footer-rows");

    await expect(rows).toContainText(/^1–25 of (about )?[\d,]+$/);
    await page.getByRole("button", { name: "Last page" }).click();
    await expect(page).toHaveURL(/last=true/);
    await expect(rows).toContainText(/^Last 25 of /);
    await expect(page.getByTestId("list-footer-page")).toHaveValue("");
    await page.getByRole("button", { name: "Previous page" }).click();
    await expect(rows).toContainText("Rows before the last 25");
    await page.getByTestId("list-footer-page").fill("300");
    await page.getByTestId("list-footer-page").press("Enter");
    await expect(page).toHaveURL(/page=300/);
    await expect(rows).toContainText(/^7,476–7,500 of /);
    await page.getByRole("button", { name: "Next page" }).click();
    await expect(page).toHaveURL(/page=301&after=/);
    await expect(rows).toContainText(/^7,501–7,525 of /);
  });

  test("the export dialog says what it will export: about a number, or every match", async ({ page }) => {
    await page.goto("/customers");
    await expect(page.getByTestId("list-footer-rows")).toContainText(/^1–25 of /);
    await page.getByTestId("export-customers").click();
    await expect(page.getByRole("dialog")).toContainText(/(About [\d,]+|[\d,]+) customers at /);
    await page.getByRole("button", { name: "Cancel" }).click();

    await page.getByTestId("grid-search").locator("input").fill("a");
    await expect(page).toHaveURL(/search=a/);
    await expect(page.getByTestId("list-footer-rows")).toContainText(/^1–25 of many$/);
    await page.getByTestId("export-customers").click();
    await expect(page.getByRole("dialog")).toContainText("All customers that match, at ");
  });
});
