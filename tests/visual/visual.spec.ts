// Playwright's test tools, with the [RESULT] block printed after every test.
import { expect, expected, test } from "../../framework/fixtures/resultBlock";

// Visual-regression snapshots for the React surface. Opt-in
// (npm run test:visual) and excluded from the gated suite because baselines are
// platform-specific. On a fresh machine, create baselines first:
//   npm run test:visual -- --update-snapshots
test.describe("React surface visual snapshots", () => {
  // The Orders page looks the same as its saved picture, within 200 pixels.
  test("orders page renders consistently", async ({ page }) => {
    expected("the orders page matches orders-page.png within 200 pixels");
    await page.goto("/app/orders?runKey=visual-orders");
    await expect(page.getByTestId("orders-table")).toBeVisible();
    await expect(page).toHaveScreenshot("orders-page.png", {
      maxDiffPixels: 200,
    });
  });
});
