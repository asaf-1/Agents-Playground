// seed: tests/e2e/seed.spec.ts
//
// Auth + session scenarios (authenticated project — runs with the Admin storageState from
// auth.setup.ts). These are POSITIVE CONTROLS that prove the auth feature works deterministically
// and light up the auth-or-session surface the diagnostician/reporter classify.
//
// Determinism: each test arms drift under its OWN runKey (test.info().testId) and a matching
// qa_runkey cookie so the page guard resolves the armed flags; afterEach clears that runKey only
// (never a full reset — that would clobber the shared Admin session under fullyParallel).
import { expect, test } from "../../../framework/fixtures/baseTest";

test.describe("Auth session", () => {
  test.afterEach(async ({ page }) => {
    await page.request.delete(
      `/api/test/flags?runKey=${encodeURIComponent(test.info().testId)}`,
    );
  });

  test("signs in from the login page and lands on the dashboard", async ({
    loginPage,
    page,
  }) => {
    await loginPage.goto();
    await loginPage.expectLoaded();
    await loginPage.login("alice@demo.local", "demo1234");
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test("rejects wrong credentials with an inline error", async ({
    loginPage,
  }) => {
    await loginPage.goto();
    await loginPage.login("alice@demo.local", "wrong-password");
    await expect(loginPage.error).toHaveText("Invalid email or password.");
  });

  test("authenticated admin sees the session banner on a protected page", async ({
    page,
  }) => {
    await page.goto("/profile");
    await expect(page.getByTestId("session-banner")).toHaveText(
      "Signed in as Alice Northwind (Admin)",
    );
    await expect(page).toHaveURL(/\/profile$/);
  });

  test("an expired session redirects a protected page to login (auth-or-session)", async ({
    page,
    context,
    baseURL,
  }) => {
    const runKey = test.info().testId;
    await page.request.post("/api/test/flags", {
      data: { runKey, flags: { authRequired: true, sessionExpired: true } },
    });
    await context.addCookies([
      { name: "qa_runkey", value: runKey, url: baseURL },
    ]);

    await page.goto("/profile");

    await expect(page).toHaveURL(/\/login/);
  });
});
