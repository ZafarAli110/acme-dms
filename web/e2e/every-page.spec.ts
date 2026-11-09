import { expect, type Page, test } from "@playwright/test";
import { MARIA, SAM, signInAsync } from "./support/demo-users";

// ACME-130: every page opens over HTTPS, as sam and as maria, in English and in French, with no error on the page or in
// the console; and the browser itself says which connection it used (`nextHopProtocol`): HTTP/2 to the web server,
// for the page and for the API behind it, on a developer's machine as live.

const PAGES = ["/", "/parts", "/customers", "/customers/new", "/locations"];
const LANGUAGES = { en: "Something went wrong", fr: "Une erreur s'est produite" } as const;

/** The protocol the browser used for the page and for its last request to the API, as it reports them. */
function protocolsAsync(page: Page): Promise<{ page: string; api: string }> {
  return page.evaluate(() => {
    const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
    const api = (performance.getEntriesByType("resource") as PerformanceResourceTiming[])
      .filter((entry) => new URL(entry.name).pathname.startsWith("/api/"))
      .at(-1);
    return { page: navigation.nextHopProtocol, api: api?.nextHopProtocol ?? "no API request" };
  });
}

/** The first row of a list, opened: a record's own page. */
async function firstRecordAsync(page: Page, list: "parts" | "customers"): Promise<string> {
  await page.goto(`/${list}`);
  await page.getByTestId(`${list}-table`).locator(".MuiDataGrid-row").first().click();
  await expect(page).toHaveURL(new RegExp(`/${list}/[0-9a-f-]{36}$`));
  return new URL(page.url()).pathname;
}

for (const [language, errorTitle] of Object.entries(LANGUAGES)) {
  for (const user of [SAM, MARIA]) {
    test(`every page opens for ${user} in ${language}, over HTTP/2, with no error`, async ({ page }) => {
      const consoleErrors: string[] = [];
      page.on("console", (message) => {
        if (message.type() === "error") {
          consoleErrors.push(message.text());
        }
      });
      page.on("pageerror", (error) => consoleErrors.push(error.message));
      await page.addInitScript((chosen) => window.localStorage.setItem("acme.language", chosen), language);
      await signInAsync(page, user);

      const paths = [...PAGES, await firstRecordAsync(page, "parts"), await firstRecordAsync(page, "customers")];
      for (const path of paths) {
        await page.goto(path);
        await page.waitForLoadState("networkidle");
        await expect(page.getByText(errorTitle)).toHaveCount(0);
        const protocols = await protocolsAsync(page);
        test
          .info()
          .annotations.push({ type: "protocol", description: `${path}: page ${protocols.page}, API ${protocols.api}` });
        expect(protocols, path).toEqual({ page: "h2", api: "h2" });
      }
      expect(consoleErrors).toEqual([]);
    });
  }
}
