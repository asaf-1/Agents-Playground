import { expect, test } from "../../../framework/fixtures/baseTest";

test("sanity smoke covers the landing page, dashboard, and valid product view", async ({
  dashboardPage,
  homePage,
  productPage,
}) => {
  await homePage.goto();
  await homePage.expectLoaded();
  await homePage.checkHealth();
  await expect(homePage.healthOutput).toContainText("Status:");
  await expect(homePage.healthOutput).toContainText("ok");

  await dashboardPage.goto("stable");
  await dashboardPage.expectLoaded();
  await dashboardPage.waitForOrdersLoaded(3);
  await expect(dashboardPage.ordersError).toBeHidden();

  await productPage.goto("sku-123", "valid");
  await productPage.expectStateText("Valid state");
  await productPage.expectLoaded();
  await expect(productPage.title).toContainText("Agentic QA Console");
  await expect(productPage.price).toContainText("$");
});
