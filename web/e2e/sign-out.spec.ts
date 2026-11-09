import { expect, test } from "@playwright/test";
import { MARIA, signInAsync } from "./support/demo-users";

/**
 * Signing in and out as the browser sees it. The page holds no token at all: the gateway keeps the sign-in (the backend for
 * the frontend) and the browser only an httpOnly session cookie; signing out deletes the session, so that cookie signs no one
 * in from the next request on.
 */
test.describe("the session", () => {
  test("keeps no token in the browser: only an httpOnly session cookie", async ({ page, context }) => {
    await signInAsync(page, MARIA);

    const cookies = await context.cookies();
    // The same name and rules as live (ACME-130): __Host- holds the browser to Secure, no Domain, Path=/.
    expect(cookies.map((cookie) => cookie.name)).toEqual(["__Host-acme_session"]);
    expect(cookies[0]).toMatchObject({ httpOnly: true, secure: true, sameSite: "Strict", path: "/" });
    const readable = await page.evaluate(() => ({
      cookie: document.cookie,
      local: JSON.stringify(window.localStorage),
      session: JSON.stringify(window.sessionStorage),
    }));
    expect(readable.cookie).toBe("");
    for (const stored of [readable.local, readable.session]) {
      expect(stored.toLowerCase()).not.toContain("token");
      expect(stored).not.toContain("eyJ");
    }
  });

  test("survives a reload: the session cookie is the sign-in", async ({ page }) => {
    await signInAsync(page, MARIA);

    await page.reload();

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByTestId("profile-menu")).toBeVisible();
  });

  test("signing out ends the sign-in at once: the old cookie, copied before, is refused on the next request", async ({
    page,
    context,
    request,
  }) => {
    await signInAsync(page, MARIA);
    const session = (await context.cookies()).find((cookie) => cookie.name === "__Host-acme_session");
    expect(session).toBeDefined();
    const withCopy = { cookie: `__Host-acme_session=${session!.value}` };
    expect((await request.get("/api/identity/v1/users/me", { headers: withCopy })).status()).toBe(200);

    await page.getByTestId("profile-menu").click();
    await page.getByTestId("sign-out").click();
    await page.getByTestId("confirm-sign-out").click();

    await expect(page).toHaveURL(/\/sign-in/);
    expect((await context.cookies()).some((cookie) => cookie.name === "__Host-acme_session")).toBe(false);
    expect((await request.get("/api/identity/v1/users/me", { headers: withCopy })).status()).toBe(401);
  });

  test("signing out in one tab takes every tab to the sign-in page, a half-filled form too, with one click", async ({
    page,
    context,
  }) => {
    await signInAsync(page, MARIA);
    await page.goto("/customers");
    const other = await context.newPage();
    await other.goto("/customers/new");
    await other.getByTestId("customer-firstName").locator("input").fill("Pat");

    await page.getByTestId("profile-menu").click();
    await page.getByTestId("sign-out").click();
    await page.getByTestId("confirm-sign-out").click();

    await expect(page).toHaveURL(/\/sign-in/);
    // The form's unsaved changes do not hold the tab: nothing could save them once the sign-in has ended.
    await expect(other).toHaveURL(/\/sign-in/);
    // Back leads to a screen of the old sign-in, which sends the browser to the sign-in page again.
    await page.goBack();
    await expect(page).toHaveURL(/\/sign-in/);
  });

  test("a reload after signing out stays signed out: nothing is left to sign anyone in", async ({ page }) => {
    await signInAsync(page, MARIA);
    await page.getByTestId("profile-menu").click();
    await page.getByTestId("sign-out").click();
    await page.getByTestId("confirm-sign-out").click();
    await expect(page).toHaveURL(/\/sign-in/);

    await page.goto("/customers");

    await expect(page).toHaveURL(/\/sign-in/);
  });

  test("a sign-in ended at the server, as one that ran out is, takes the open page to sign-in on its next request", async ({
    page,
    context,
    request,
  }) => {
    await signInAsync(page, MARIA);
    await page.goto("/customers");
    await expect(page.getByTestId("customers-table").locator(".MuiDataGrid-row").first()).toBeVisible();
    // Ended where the page cannot see it: a copy of the cookie signs out, as the gateway ends a sign-in that ran out.
    const session = (await context.cookies()).find((cookie) => cookie.name === "__Host-acme_session");
    const ended = await request.delete("/api/session", {
      headers: { cookie: `__Host-acme_session=${session!.value}`, "x-requested-with": "acme-web" },
    });
    expect(ended.status()).toBe(204);

    // The page's next request is answered "ended", and the page goes to sign-in, as it does today.
    await page.getByTestId("customers-table").locator(".MuiDataGrid-row").first().click();

    await expect(page).toHaveURL(/\/sign-in/);
  });
});
