import { expect, test } from "@playwright/test";
import { armFlags } from "./_helpers";

test.describe("React Orders (TanStack Query)", () => {
  test("stable mode loads seeded orders", async ({ page }) => {
    await page.goto("/app/orders?runKey=orders-stable");
    await expect(page.getByTestId("orders-table")).toBeVisible();
    await expect(page.getByTestId("orders-table")).toContainText("ORD-1001");
  });

  test("flaky mode recovers through the query retry", async ({ page }) => {
    // mode=flaky returns one 503 per runKey, then succeeds; retry: 1 recovers it.
    await page.goto("/app/orders?runKey=orders-flaky");
    await page.getByTestId("orders-mode-flaky").click();
    await page.getByTestId("orders-refresh").click();
    await expect(page.getByTestId("orders-table")).toBeVisible();
    await expect(page.getByTestId("orders-table")).toContainText("ORD-1001");
  });

  test("HEAL: armed ordersRefreshLabel renames the control (selector drift)", async ({
    page,
    request,
  }) => {
    await armFlags(request, "orders-label", { ordersRefreshLabel: "Reload" });
    await page.goto("/app/orders?runKey=orders-label");
    // The data-testid is stable but the visible text drifted "Refresh"->"Reload":
    // a text-based selector would break, so the diagnostician verdict is HEAL.
    await expect(page.getByTestId("orders-refresh")).toHaveText("Reload");
  });
});
