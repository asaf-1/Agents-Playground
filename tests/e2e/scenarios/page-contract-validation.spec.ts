/** The page contracts: what the bank's pages must contain. */
import {
  accountPageContract,
  homePageContract,
  ordersPageContract,
  productPageContract,
  usersPageContract,
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
/** Arms a planted bug for one runKey, and makes a runKey of the test's own. */
import { armFlags } from "../../../framework/helpers/flags";
import { uniqueRunKey } from "../../../framework/helpers/bank";

/**
 * One checker, several contracts: the bank's home, Orders, Users, the
 * sign-in status page and a product pass theirs; the product in the AI
 * agents' broken state fails for three reasons. (Until 2026-11-20 this ran on
 * the original demo site's pages.)
 */
test("validates reusable page contracts across the bank's home, back office, account, and product pages", async ({
  accountPage,
  homePage,
  ordersPage,
  page,
  productPage,
  request,
  usersPage,
}) => {
  expected(
    "home, Orders, Users, the sign-in status page and a product pass their contracts; the broken product fails naming a non-finite number, a NaN token and a visual overlap",
  );
  const validationAgent = new PageValidationAgent(page);
  const runKey = uniqueRunKey("page-contracts");

  try {
    await test.step("the home page", async () => {
      await homePage.goto();
      const result = await validationAgent.validateContract(homePageContract);
      fact("home", result.valid);
      expect(result.valid, result.explanation).toBe(true);
    });

    await test.step("Orders, once its three orders are in", async () => {
      await ordersPage.goto(runKey);
      await ordersPage.waitForOrdersLoaded(3);
      const result = await validationAgent.validateContract(ordersPageContract);
      fact("orders", result.valid);
      expect(result.valid, result.explanation).toBe(true);
    });

    await test.step("Users, once its users are in", async () => {
      await usersPage.goto(runKey);
      await usersPage.waitForUsersLoaded();
      const result = await validationAgent.validateContract(usersPageContract);
      fact("users", result.valid);
      expect(result.valid, result.explanation).toBe(true);
    });

    await test.step("the sign-in status page", async () => {
      await accountPage.goto(runKey);
      await expect(accountPage.guest, "a guest").toBeVisible();
      const result =
        await validationAgent.validateContract(accountPageContract);
      fact("account", result.valid);
      expect(result.valid, result.explanation).toBe(true);
    });

    const catalogue = await (await request.get("/api/products")).json();
    const productId: string = catalogue.products[0].id;

    await test.step("a product, as it is", async () => {
      await productPage.goto(productId);
      const result =
        await validationAgent.validateContract(productPageContract);
      fact("product", result.valid);
      expect(result.valid, result.explanation).toBe(true);
    });

    await test.step("the product in the broken state", async () => {
      await armFlags(request, runKey, { productRenderBroken: true });
      await productPage.goto(productId, runKey);
      await expect(
        productPage.price,
        "the broken price has drawn",
      ).toContainText("NaN");
      const result =
        await validationAgent.validateContract(productPageContract);
      fact("broken issues", result.issues);
      expect(result.valid, "not valid").toBe(false);
      for (const reason of [
        "not a finite number",
        "NaN token",
        "Visual overlap detected",
      ]) {
        expect(
          result.issues.some((issue) => issue.includes(reason)),
          `it names: ${reason}`,
        ).toBe(true);
      }
    });
  } finally {
    await request.delete(
      `/api/test/flags?runKey=${encodeURIComponent(runKey)}`,
    );
  }
});
