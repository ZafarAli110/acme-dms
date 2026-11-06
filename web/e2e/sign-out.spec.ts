import { expect, test } from "@playwright/test";
import { MARIA, signInAsync } from "./support/demo-users";

/**
 * Signing in and out as the browser sees it. The page holds no token at all: the gateway keeps the sign-in (the backend for
 * the frontend) and the browser only an httpOnly session cookie; signing out deletes the session, so that cookie signs no one
 * in from the next request on.
 */
test.describe("the session", () => {
  test("keeps no token in the browser: only an httpOnly session cookie, sent to the API only", async ({
    page,
    context,
  }) => {
    await signInAsync(page, MARIA);

    const cookies = await context.cookies();
    expect(cookies.map((cookie) => cookie.name)).toEqual(["acme_session"]);
    expect(cookies[0]).toMatchObject({ httpOnly: true, sameSite: "Strict", path: "/api" });
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
    const session = (await context.cookies()).find((cookie) => cookie.name === "acme_session");
    expect(session).toBeDefined();
    const withCopy = { cookie: `acme_session=${session!.value}` };
    expect((await request.get("/api/identity/v1/users/me", { headers: withCopy })).status()).toBe(200);

    await page.getByTestId("profile-menu").click();
    await page.getByTestId("sign-out").click();
    await page.getByTestId("confirm-sign-out").click();

    await expect(page).toHaveURL(/\/sign-in/);
    expect((await context.cookies()).some((cookie) => cookie.name === "acme_session")).toBe(false);
    expect((await request.get("/api/identity/v1/users/me", { headers: withCopy })).status()).toBe(401);
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
});
