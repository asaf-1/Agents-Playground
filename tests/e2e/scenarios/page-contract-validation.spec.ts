/** The page contracts: what the home, dashboard and product pages must contain. */
import {
  dashboardPageContract,
  homePageContract,
  productPageContract,
} from "../../../framework/agents/validation/contracts";
/** The framework's page checker, which tests a page against a contract. */
import { PageValidationAgent } from "../../../framework/agents/validation/PageValidationAgent";
/** Playwright's test tools with the framework's page objects and the [RESULT] block. */
import {
  expect,
  expected,
  fact,
  test,
} from "../../../framework/fixtures/appTest";

/**
 * One checker, several contracts: the home page, the dashboard and a valid
 * product pass theirs; the broken product page fails for three reasons.
 */
test("validates reusable page contracts across home, dashboard, and product pages", async ({
  dashboardPage,
  homePage,
  page,
  productPage,
}) => {
  expected(
    "home, dashboard and the valid product pass their contracts; the broken product fails naming a non-finite number, an undefined token and a visual overlap",
  );
  const validationAgent = new PageValidationAgent(page);

  // The home page.
  await homePage.goto();
  const homeResult = await validationAgent.validateContract(homePageContract);
  fact("home", homeResult.valid);
  expect(homeResult.valid, JSON.stringify(homeResult, null, 2)).toBeTruthy();

  // The dashboard, once its three orders are in.
  await dashboardPage.goto();
  await dashboardPage.waitForOrdersLoaded(3);
  const dashboardResult = await validationAgent.validateContract(
    dashboardPageContract,
  );
  fact("dashboard", dashboardResult.valid);
  expect(dashboardResult.valid).toBeTruthy();

  // The product page, valid.
  await productPage.goto("sku-123", "valid");
  const validProductResult =
    await validationAgent.validateContract(productPageContract);
  fact("product ok", validProductResult.valid);
  expect(validProductResult.valid).toBeTruthy();

  // The product page, broken: it fails, for all three reasons.
  await productPage.goto("sku-123", "broken");
  const brokenProductResult =
    await validationAgent.validateContract(productPageContract);
  fact("broken issues", brokenProductResult.issues);
  expect(brokenProductResult.valid).toBeFalsy();
  expect(
    brokenProductResult.issues.some((issue) =>
      issue.includes("not a finite number"),
    ),
  ).toBeTruthy();
  expect(
    brokenProductResult.issues.some((issue) =>
      issue.includes("undefined token"),
    ),
  ).toBeTruthy();
  expect(
    brokenProductResult.issues.some((issue) =>
      issue.includes("Visual overlap detected"),
    ),
  ).toBeTruthy();
});
