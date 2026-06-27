import { expect, test } from "@playwright/test";

// Visual-regression snapshots for the React surface. Opt-in
// (npm run test:visual) and excluded from the gated suite because baselines are
// platform-specific. On a fresh machine, create baselines first:
//   npm run test:visual -- --update-snapshots
test.describe("React surface visual snapshots", () => {
  test("orders page renders consistently", async ({ page }) => {
    await page.goto("/app/orders?runKey=visual-orders");
    await expect(page.getByTestId("orders-table")).toBeVisible();
    await expect(page).toHaveScreenshot("orders-page.png", {
      maxDiffPixels: 200,
    });
  });
});
