// tests/e2e/seed.spec.ts
// Seed for the official Playwright agents (planner / generator / healer).
// Its ONLY job: leave the app on a known, warm page so that when the MCP runs
// this file (planner_setup_page / generator_setup_page) with pauseAtEnd, the
// agent drives a deterministic live page: Playground Bank's home at /app.
// It captures NO credentials and needs NO storageState: determinism comes from
// the bank's own seed data and from each test's own runKey and customer.
// Keep this side-effect-only: NO business assertions (they belong in tests).
// (Until 2026-11-20 it warmed the original demo site, removed that day.)
import { expected, test } from "../../framework/fixtures/resultBlock";

test.describe("Seed", () => {
  test("seed", async ({ page }) => {
    expected("the bank's ready check 2xx, and /app loaded");
    // (1) Readiness probe: the bank answers and its database is up. A dead
    //     server fails here once, not as many noisy failures later.
    const ready = await page.request.get("/api/bank/health/ready");
    if (!ready.ok()) {
      throw new Error(
        `Seed ready probe failed: ${ready.status()} ${await ready.text()}`,
      );
    }

    // (2) Warm the home page (primes the build's files, checks routing). The
    //     agent navigates onward, e.g. to '/app/orders', '/app/users',
    //     '/app/products/sku-001', '/app/account', '/app/bank'.
    await page.goto("/app");

    // PAUSED here under the MCP setup_page path; a plain run PASSES and exits.
  });
});

// Determinism cheat-sheet for tests generated off this seed:
//   - Planted bugs are off until armed: POST /api/test/flags with a runKey
//     of the test's own, then open the page with ?runKey=<it>. Never arm
//     "global": parallel tests would see it.
//   - Money pages need a customer: sign one up with signUpCustomer() in
//     framework/helpers/bank.ts; the demo accounts are read-only.
//   - /app/orders is the RESILIENCE surface (stable, slow 7 s, flaky: the
//     first answer per runKey is a 503 that the page's one retry recovers).
//   - /app/users is shared by every test: create your own user to change,
//     never edit or delete the seeded Alice, Bob or Carol.
//   - The back-office session (Alice Admin, Bob Editor) signs in on
//     /app/account, password demo1234; Carol is inactive on purpose.
//   - The AI agents' broken product state is the test flag
//     productRenderBroken: a NaN price drawn over the buy area.
//   - Prefer data-testid selectors: the HEAL fault ordersRefreshLabel renames
//     Refresh to Reload and keeps the test id.
//   - Slow mode is 7 s, past the default expect timeout: give it its own.
//   - Prices and balances come from the bank: read them, never write them.
