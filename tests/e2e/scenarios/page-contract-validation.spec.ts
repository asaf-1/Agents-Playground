import {
  dashboardPageContract,
  homePageContract,
  productPageContract
} from "../../../framework/agents/validation/contracts";
import { PageValidationAgent } from "../../../framework/agents/validation/PageValidationAgent";
import { expect, test } from "../../../framework/fixtures/baseTest";

test("validates reusable page contracts across home, dashboard, and product pages", async ({
  dashboardPage,
  homePage,
  page,
  productPage
}) => {
  const validationAgent = new PageValidationAgent(page);

  await homePage.goto();
  const homeResult = await validationAgent.validateContract(homePageContract);
  expect(homeResult.valid, JSON.stringify(homeResult, null, 2)).toBeTruthy();

  await dashboardPage.goto();
  await dashboardPage.waitForOrdersLoaded(3);
  const dashboardResult = await validationAgent.validateContract(dashboardPageContract);
  expect(dashboardResult.valid).toBeTruthy();

  await productPage.goto("sku-123", "valid");
  const validProductResult = await validationAgent.validateContract(productPageContract);
  expect(validProductResult.valid).toBeTruthy();

  await productPage.goto("sku-123", "broken");
  const brokenProductResult = await validationAgent.validateContract(productPageContract);
  expect(brokenProductResult.valid).toBeFalsy();
  expect(
    brokenProductResult.issues.some((issue) => issue.includes("not a finite number"))
  ).toBeTruthy();
  expect(
    brokenProductResult.issues.some((issue) => issue.includes("undefined token"))
  ).toBeTruthy();
  expect(
    brokenProductResult.issues.some((issue) => issue.includes("Visual overlap detected"))
  ).toBeTruthy();
});
