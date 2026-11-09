import { expect, type Page, test } from "@playwright/test";
import { createPartAsync, signInAsync } from "./support/demo-users";

test.describe("parts", () => {
  test.beforeEach(async ({ page }) => {
    await signInAsync(page);
  });

  test("the search goes into the URL and survives a reload", async ({ page }) => {
    await page.goto("/parts");
    await page.getByTestId("grid-search").locator("input").fill("filter");

    await expect(page).toHaveURL(/\?search=filter/);
    await page.reload();
    await expect(page.getByTestId("grid-search").locator("input")).toHaveValue("filter");
    await expect(page.getByTestId("parts-table").locator(".MuiDataGrid-row").first()).toContainText(/filter/i);
  });

  test("a sort by a column goes into the URL and orders the rows", async ({ page }) => {
    await page.goto("/parts");
    await page.getByRole("columnheader", { name: "On hand" }).click();
    await page.getByRole("columnheader", { name: "On hand" }).click();

    await expect(page).toHaveURL(/sort=onHand&direction=desc/);
    const onHand = page.getByTestId("parts-table").locator('[role="gridcell"][data-field="onHand"]');
    await expect(onHand.first()).toBeVisible();
    const quantities = (await onHand.allTextContents()).map((text) => Number(text.replace(/\D/g, "")));
    expect(quantities).toEqual(quantities.toSorted((a, b) => b - a));
  });

  test("the next page goes into the URL", async ({ page }) => {
    await page.goto("/parts?pageSize=10");
    await page.getByRole("button", { name: "Go to next page" }).click();

    await expect(page).toHaveURL(/page=2/);
    await expect(page.locator(".MuiTablePagination-displayedRows")).toContainText(/^11–/);
    // The grid once went back to page 1 as soon as page 2 had loaded, so look again once it has.
    await expect(page.getByTestId("parts-table").locator(".MuiLinearProgress-root")).toHaveCount(0);
    await expect(page).toHaveURL(/page=2/);
    await expect(page.locator(".MuiTablePagination-displayedRows")).toContainText(/^11–/);
  });

  test("a part edit is saved", async ({ page, request }) => {
    const part = await createPartAsync(request);
    await page.goto(`/parts/${part.id}`);

    await page.getByTestId("part-description").locator("input").fill("Oil filter, spin-on, long life");
    await page.getByTestId("save-part").click();

    await expect(page.getByTestId("save-success")).toBeVisible();
    await page.reload();
    await expect(page.getByTestId("part-description").locator("input")).toHaveValue("Oil filter, spin-on, long life");
  });

  // ACME-124: the exact total, asked once per question; the stock value asked on each visit, so it is always current.
  test("the footer shows the count's exact number; paging and sorting do not ask again, a search asks once", async ({
    page,
  }) => {
    const asked = askedFor(page);
    const counted = page.waitForResponse((response) => /\/v1\/parts\/count\?/.test(response.url()));
    await page.goto("/parts");
    const { total } = (await (await counted).json()) as { total: number };

    await expect(page.locator(".MuiTablePagination-displayedRows")).toContainText(
      `1–25 of ${total.toLocaleString("en")}`,
    );
    await page.getByRole("button", { name: "Go to next page" }).click();
    await expect(page).toHaveURL(/page=2/);
    await page.getByRole("button", { name: "Go to next page" }).click();
    await expect(page).toHaveURL(/page=3/);
    await expect(page.locator(".MuiTablePagination-displayedRows")).toContainText(/^51–75 of /);
    await page.getByRole("columnheader", { name: "Unit price" }).click();
    await expect(page).toHaveURL(/sort=unitPriceCents/);
    await expect(page.getByTestId("parts-table").locator(".MuiLinearProgress-root")).toHaveCount(0);
    expect([asked.counts(), asked.stockValues()]).toEqual([1, 1]);

    await page.getByTestId("grid-search").locator("input").fill("brake pad");
    await expect(page).toHaveURL(/search=brake/);
    await expect(page.getByTestId("parts-table").locator(".MuiLinearProgress-root")).toHaveCount(0);
    expect([asked.counts(), asked.stockValues()]).toEqual([2, 1]);
  });

  test("a price saved at another counter moves the stock value by quantity × change the next time Parts opens", async ({
    page,
    browser,
    request,
  }) => {
    const part = await createPartAsync(request);
    await page.goto(`/parts?search=${part.partNumber}`);
    const before = await stockValueCentsAsync(page);
    await page.getByTestId("parts-table").locator(".MuiDataGrid-row").first().click();
    await expect(page.getByTestId("save-part")).toBeVisible();

    // Another counter: its own browser, its own cache.
    const elsewhere = await browser.newContext();
    const other = await elsewhere.newPage();
    await signInAsync(other);
    await other.goto(`/parts/${part.id}`);
    await other.getByTestId("part-unit-price").locator("input").fill("2.50");
    await other.getByTestId("save-part").click();
    await expect(other.getByTestId("save-success")).toBeVisible();
    await elsewhere.close();

    // Back to the list from inside the app, not by a reload: the stock value is asked again.
    await page.getByTestId("cancel").click();
    await expect(page).toHaveURL(/\/parts$/);
    // createPartAsync stocks 1 at $1.00: $2.50 adds 150 cents.
    await expect.poll(() => stockValueCentsAsync(page)).toBe(before + 150);
  });

  test("a long description ends with '…' at the column's edge and shows in full on hover", async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 800 });
    await page.goto("/parts");
    const cells = page.getByTestId("part-description-cell");
    await expect(cells.first()).toBeVisible();

    const cut = await cells.evaluateAll((elements) =>
      elements
        .filter((element) => element.scrollWidth > element.clientWidth)
        .map((element) => ({
          title: element.getAttribute("title"),
          text: element.textContent,
          ellipsis: getComputedStyle(element).textOverflow,
        })),
    );
    expect(cut.length).toBeGreaterThan(0);
    for (const cell of cut) {
      expect(cell.ellipsis).toBe("ellipsis");
      expect(cell.title).toBe(cell.text);
    }
  });
});

/** Counts the count and stock-value requests the page sends from now on. */
function askedFor(page: Page): { counts: () => number; stockValues: () => number } {
  let counts = 0;
  let stockValues = 0;
  page.on("request", (sent) => {
    if (/\/v1\/parts\/count\?/.test(sent.url())) {
      counts += 1;
    }
    if (sent.url().endsWith("/v1/parts/stock-value")) {
      stockValues += 1;
    }
  });
  return { counts: () => counts, stockValues: () => stockValues };
}

/** The stock value in the page's subtitle, in cents: "… · stock value $1,234.56". */
async function stockValueCentsAsync(page: Page): Promise<number> {
  const subtitle = page.getByText(/stock value \$/);
  await expect(subtitle).toBeVisible();
  const [, dollars] = /stock value \$([\d,]+\.\d{2})/.exec((await subtitle.textContent()) ?? "") ?? [];
  return Math.round(Number((dollars ?? "").replaceAll(",", "")) * 100);
}
