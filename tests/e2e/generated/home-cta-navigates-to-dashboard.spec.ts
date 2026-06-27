// seed: tests/e2e/seed.spec.ts
//
// HEALER DEMO — the classic Playwright self-heal scenario, on this app.
// Marketing renamed the hero call-to-action from "Sign Up" to "Join Now"
// (see public/index.html line ~37 and the signal: "Outdated selector: Sign Up becomes Join Now").
// This test was written against the OLD label, so it FAILS today.
//
// The point: run @playwright-test-healer on this file. It inspects the live page, finds the
// button is now "Join Now" (data-testid="join-now"), and rewrites the LOCATOR IN THIS TEST.
// It must NOT touch server.js or public/* — the app drift is intentional; only the test gets fixed.
//
// ARMED-DEMO STATE: marked test.fixme() so it is SKIPPED in CI (keeps the suite green). To run the
// self-heal demo, change `test.fixme(` back to `test(`, run it (it fails on the stale "Sign Up"
// locator), then run the healer to watch it rewrite the locator to "Join Now" and go green.
import { test, expect } from "@playwright/test";

test.describe("Home CTA", () => {
  test.fixme("primary call-to-action navigates to the dashboard", async ({
    page,
  }) => {
    await page.goto("/");

    // 1. Click the primary call-to-action  (stale: the label used to be "Sign Up")
    await page
      .getByRole("button", { name: "Sign Up" })
      .click({ timeout: 5000 });

    // 2. Land on the Orders Recovery Console
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByTestId("orders-mode")).toBeVisible();
  });
});
