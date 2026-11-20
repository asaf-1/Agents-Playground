// seed: tests/e2e/seed.spec.ts
//
// HEALER DEMO: the classic Playwright self-heal scenario, on the bank. The
// bank's planted HEAL fault ordersRefreshLabel renames /app/orders' Refresh
// button to Reload (web/src/pages/OrdersPage.tsx); its data-testid,
// orders-refresh, stays. This test was written against the OLD label, so with
// the fault armed it FAILS.
//
// The point: run @playwright-test-healer on this file. It inspects the live
// page, finds the button is now "Reload" (data-testid="orders-refresh"), and
// rewrites the LOCATOR IN THIS TEST, to the test id. It must NOT touch the
// app: the drift is the planted fault; only the test gets fixed.
//
// ARMED-DEMO STATE: marked test.fixme() so it is SKIPPED in CI (keeps the
// suite green). To run the self-heal demo, change `test.fixme(` back to
// `test(`, run it (it fails on the stale "Refresh" locator), then run the
// healer to watch it rewrite the locator and go green. (It replaces the
// original demo site's "Sign Up" call-to-action demo, removed on 2026-11-20.)

/** Playwright's test tools, with the [RESULT] block printed after every test. */
import {
  test,
  expect,
  expected,
} from "../../../framework/fixtures/resultBlock";

test.describe("Orders Refresh", () => {
  // Skipped on purpose (fixme): the healer demo described above.
  test.fixme("Refresh reloads the orders after the button is relabelled", async ({
    page,
  }) => {
    expected(
      "with ordersRefreshLabel armed, the 'Refresh' button reloads the orders and the table stays",
    );
    // Arm the planted HEAL fault for this test only.
    const runKey = `healer-demo-${Date.now()}`;
    await page.request.post("/api/test/flags", {
      data: { runKey, flags: { ordersRefreshLabel: "Reload" } },
    });
    await page.goto(`/app/orders?runKey=${runKey}`);
    await expect(page.getByTestId("orders-table")).toBeVisible();

    // 1. Click Refresh (stale: the label is Reload now)
    await page
      .getByRole("button", { name: "Refresh" })
      .click({ timeout: 5000 });

    // 2. The orders are still there after the reload
    await expect(page.getByTestId("orders-table")).toBeVisible();
  });
});
