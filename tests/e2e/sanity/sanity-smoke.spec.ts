/** Playwright's test tools with the framework's page objects and the [RESULT] block. */
import { expect, expected, test } from "../../../framework/fixtures/appTest";

/**
 * The quickest proof the classic site works: the landing page and its health
 * check, the dashboard's orders, and a valid product page.
 */
test("sanity smoke covers the landing page, dashboard, and valid product view", async ({
  dashboardPage,
  homePage,
  productPage,
}) => {
  expected(
    "the home page loads and its health check says ok; the dashboard loads 3 orders with no error; sku-123 shows its title and a $ price",
  );
  // The landing page, and its health check.
  await homePage.goto();
  await homePage.expectLoaded();
  await homePage.checkHealth();
  await expect(homePage.healthOutput).toContainText("Status:");
  await expect(homePage.healthOutput).toContainText("ok");

  // The dashboard in stable mode, with its three orders.
  await dashboardPage.goto("stable");
  await dashboardPage.expectLoaded();
  await dashboardPage.waitForOrdersLoaded(3);
  await expect(dashboardPage.ordersError).toBeHidden();

  // A product in its valid state.
  await productPage.goto("sku-123", "valid");
  await productPage.expectStateText("Valid state");
  await productPage.expectLoaded();
  await expect(productPage.title).toContainText("Agentic QA Console");
  await expect(productPage.price).toContainText("$");
});
