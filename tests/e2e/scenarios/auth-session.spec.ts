// seed: tests/e2e/seed.spec.ts
//
// Auth + session scenarios on the bank's back-office sign-in (/app/account),
// in the authenticated project: it runs with the back-office Admin
// storageState from auth.setup.ts. These are POSITIVE CONTROLS that prove the
// sign-in works deterministically and light up the auth-or-session surface
// the diagnostician/reporter classify. (Until 2026-11-20 they ran on the
// original demo site's /login and /profile pages.)
//
// Determinism: each test arms drift under its OWN runKey (test.info().testId)
// and opens the page with it; afterEach clears that runKey only (never a full
// reset — that would clobber the shared Admin session under fullyParallel).
// The signed-out tests start from an empty storageState of their own.

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

  test.describe("signed out", () => {
    // These two start with no session at all.
    test.use({ storageState: { cookies: [], origins: [] } });

    // The back-office form signs Alice in, and the page says so.
    test("signs in from the back-office form and shows who is signed in", async ({
      accountPage,
    }) => {
      expected(
        "after signing in as alice@demo.local: 'Signed in as Alice Northwind (Admin)'",
      );
      await accountPage.goto(test.info().testId);
      await expect(accountPage.guest, "a guest first").toBeVisible();
      await accountPage.signIn("alice@demo.local", "demo1234");
      await expect(accountPage.signedInAs, "signed in").toHaveText(
        "Signed in as Alice Northwind (Admin)",
      );
    });

    // A wrong password shows an error under the form.
    test("rejects wrong credentials with an inline error", async ({
      accountPage,
    }) => {
      expected("'Invalid email or password.', still a guest");
      await accountPage.goto(test.info().testId);
      await accountPage.signIn("alice@demo.local", "wrong-password");
      await expect(accountPage.signInError, "the error").toHaveText(
        "Invalid email or password.",
      );
      await expect(accountPage.guest, "still a guest").toBeVisible();
    });
  });

  // The saved Admin session shows on the sign-in status page.
  test("authenticated admin sees who is signed in on the sign-in status page", async ({
    accountPage,
    page,
  }) => {
    expected(
      "'Signed in as Alice Northwind (Admin)' on /app/account, with Sign out",
    );
    await accountPage.goto(test.info().testId);
    await expect(accountPage.signedInAs, "the saved session").toHaveText(
      "Signed in as Alice Northwind (Admin)",
    );
    await expect(
      page.getByTestId("backoffice-signout"),
      "with Sign out",
    ).toBeVisible();
  });

  // With an expired session armed for this test, the page says so and offers
  // the sign-in again.
  test("an expired session shows the sign-in-again state (auth-or-session)", async ({
    accountPage,
    page,
  }) => {
    expected(
      "with authRequired and sessionExpired armed: 'no longer valid' and the sign-in form",
    );
    // Arm the flags under this test's own id, and open the page with it.
    const runKey = test.info().testId;
    fact("runKey", runKey);
    await page.request.post("/api/test/flags", {
      data: { runKey, flags: { authRequired: true, sessionExpired: true } },
    });

    await accountPage.goto(runKey);

    await expect(accountPage.expired, "the session is expired").toContainText(
      "no longer valid",
    );
    await expect(accountPage.signInForm, "sign in again").toBeVisible();
  });
});
