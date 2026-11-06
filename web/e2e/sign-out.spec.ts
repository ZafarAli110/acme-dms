import { expect, test } from "@playwright/test";
import { MARIA, signInAsync } from "./support/demo-users";

/**
 * Signing in and out as the browser sees it: where the tokens are, and what signing out ends. The tokens are not in
 * storage a script can read; the refresh token is an httpOnly cookie; and signing out ends the refresh token, while an
 * access token already issued lives out its 15 minutes (docs/ARCHITECTURE.md, "An access token is not taken back").
 */
test.describe("the session", () => {
  test("keeps no token where a script can read it: the refresh token is an httpOnly cookie for the token endpoints only", async ({
    page,
    context,
  }) => {
    await signInAsync(page, MARIA);

    const cookies = await context.cookies();
    const refresh = cookies.find((cookie) => cookie.name === "acme_refresh");
    expect(refresh).toMatchObject({ httpOnly: true, sameSite: "Strict", path: "/api/identity/v1/tokens" });
    const readable = await page.evaluate(() => ({
      cookie: document.cookie,
      local: JSON.stringify(window.localStorage),
      session: JSON.stringify(window.sessionStorage),
    }));
    expect(readable.cookie).not.toContain("acme_refresh");
    for (const stored of [readable.local, readable.session]) {
      expect(stored.toLowerCase()).not.toContain("token");
      expect(stored).not.toContain("eyJ");
    }
  });

  test("survives a reload with no stored token: the cookie gets a new access token", async ({ page }) => {
    await signInAsync(page, MARIA);

    await page.reload();

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByTestId("profile-menu")).toBeVisible();
  });

  test("signing out removes the cookie and shows the sign-in page; an access token already issued is not taken back", async ({
    page,
    context,
    request,
  }) => {
    let accessToken = "";
    page.on("response", async (response) => {
      if (response.request().method() === "POST" && response.url().endsWith("/api/identity/v1/tokens")) {
        accessToken = ((await response.json()) as { accessToken: string }).accessToken;
      }
    });
    await signInAsync(page, MARIA);
    expect(accessToken).not.toBe("");
    const withToken = { authorization: `Bearer ${accessToken}` };
    expect((await request.get("/api/identity/v1/users/me", { headers: withToken })).status()).toBe(200);

    await page.getByTestId("profile-menu").click();
    await page.getByTestId("sign-out").click();
    await page.getByTestId("confirm-sign-out").click();

    await expect(page).toHaveURL(/\/sign-in/);
    expect((await context.cookies()).some((cookie) => cookie.name === "acme_refresh")).toBe(false);
    // A decision, not an oversight: the token works until it expires, and nothing is left that can renew it.
    expect((await request.get("/api/identity/v1/users/me", { headers: withToken })).status()).toBe(200);
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
