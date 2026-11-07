/** Playwright's test tools, with the [RESULT] block printed after every test. */
import {
  expect,
  expected,
  test,
} from "../../../framework/fixtures/resultBlock";
/** Arms a planted bug for one runKey. */
import { armFlags } from "../../../framework/helpers/flags";

/** The React Orders page, which loads its data with TanStack Query. */
test.describe("React Orders (TanStack Query)", () => {
  // In stable mode the seeded orders load.
  test("stable mode loads seeded orders", async ({ page }) => {
    expected("the orders table shows ORD-1001");
    await page.goto("/app/orders?runKey=orders-stable");
    await expect(page.getByTestId("orders-table")).toBeVisible();
    await expect(page.getByTestId("orders-table")).toContainText("ORD-1001");
  });

  // In flaky mode the first load fails once, and the query's retry recovers it.
  test("flaky mode recovers through the query retry", async ({ page }) => {
    expected("after one 503 and a retry, the table shows ORD-1001");
    // mode=flaky returns one 503 per runKey, then succeeds; retry: 1 recovers it.
    await page.goto("/app/orders?runKey=orders-flaky");
    await page.getByTestId("orders-mode-flaky").click();
    await page.getByTestId("orders-refresh").click();
    await expect(page.getByTestId("orders-table")).toBeVisible();
    await expect(page.getByTestId("orders-table")).toContainText("ORD-1001");
  });

  // With the drift armed, the Refresh button's text changes but its test id doesn't.
  test("HEAL: armed ordersRefreshLabel renames the control (selector drift)", async ({
    page,
    request,
  }) => {
    expected("with ordersRefreshLabel armed: orders-refresh reads 'Reload'");
    await armFlags(request, "orders-label", { ordersRefreshLabel: "Reload" });
    await page.goto("/app/orders?runKey=orders-label");
    // The data-testid is stable but the visible text drifted "Refresh"->"Reload":
    // a text-based selector would break, so the diagnostician verdict is HEAL.
    await expect(page.getByTestId("orders-refresh")).toHaveText("Reload");
  });
});
