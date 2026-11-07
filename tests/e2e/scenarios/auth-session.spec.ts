// seed: tests/e2e/seed.spec.ts
//
// Auth + session scenarios (authenticated project — runs with the Admin storageState from
// auth.setup.ts). These are POSITIVE CONTROLS that prove the auth feature works deterministically
// and light up the auth-or-session surface the diagnostician/reporter classify.
//
// Determinism: each test arms drift under its OWN runKey (test.info().testId) and a matching
// qa_runkey cookie so the page guard resolves the armed flags; afterEach clears that runKey only
// (never a full reset — that would clobber the shared Admin session under fullyParallel).

/** Playwright's test tools with the framework's page objects and the [RESULT] block. */
import {
  expect,
  expected,
  fact,
  test,
} from "../../../framework/fixtures/appTest";

test.describe("Auth session", () => {
  // After each test, clear only the flags this test armed.
  test.afterEach(async ({ page }) => {
    await page.request.delete(
      `/api/test/flags?runKey=${encodeURIComponent(test.info().testId)}`,
    );
  });

  // The login page signs Alice in and goes to the dashboard.
  test("signs in from the login page and lands on the dashboard", async ({
    loginPage,
    page,
  }) => {
    expected("after logging in, the page is /dashboard");
    await loginPage.goto();
    await loginPage.expectLoaded();
    await loginPage.login("alice@demo.local", "demo1234");
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  // A wrong password shows an error on the login page.
  test("rejects wrong credentials with an inline error", async ({
    loginPage,
  }) => {
    expected("'Invalid email or password.'");
    await loginPage.goto();
    await loginPage.login("alice@demo.local", "wrong-password");
    await expect(loginPage.error).toHaveText("Invalid email or password.");
  });

  // The saved Admin session shows its banner on a protected page.
  test("authenticated admin sees the session banner on a protected page", async ({
    page,
  }) => {
    expected(
      "'Signed in as Alice Northwind (Admin)' on /profile, with no redirect",
    );
    await page.goto("/profile");
    await expect(page.getByTestId("session-banner")).toHaveText(
      "Signed in as Alice Northwind (Admin)",
    );
    await expect(page).toHaveURL(/\/profile$/);
  });

  // With an expired session armed for this test, a protected page sends you to login.
  test("an expired session redirects a protected page to login (auth-or-session)", async ({
    page,
    context,
    baseURL,
  }) => {
    expected(
      "with authRequired and sessionExpired armed: /profile redirects to /login",
    );
    // Arm the flags under this test's own id, and send that id as a cookie.
    const runKey = test.info().testId;
    fact("runKey", runKey);
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
