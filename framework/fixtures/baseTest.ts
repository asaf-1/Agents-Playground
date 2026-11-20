// Playwright's test with one fixture per page object of the bank, so a test
// can ask for `homePage` or `usersPage` and get it ready to use. Specs take it
// through appTest.ts, which adds the [RESULT] block.

// Playwright's test and expect.
import { expect, test as base } from "@playwright/test";
// The page objects.
import { AccountPage } from "../pom/AccountPage";
import { HomePage } from "../pom/HomePage";
import { OrdersPage } from "../pom/OrdersPage";
import { ProductPage } from "../pom/ProductPage";
import { UsersPage } from "../pom/UsersPage";

// The page-object fixtures and their types.
type AppFixtures = {
  accountPage: AccountPage;
  homePage: HomePage;
  ordersPage: OrdersPage;
  productPage: ProductPage;
  usersPage: UsersPage;
};

// Each fixture wraps the test's own page in its page object.
export const test = base.extend<AppFixtures>({
  accountPage: async ({ page }, use) => {
    await use(new AccountPage(page));
  },
  homePage: async ({ page }, use) => {
    await use(new HomePage(page));
  },
  ordersPage: async ({ page }, use) => {
    await use(new OrdersPage(page));
  },
  productPage: async ({ page }, use) => {
    await use(new ProductPage(page));
  },
  usersPage: async ({ page }, use) => {
    await use(new UsersPage(page));
  },
});

// Passed on, so one import brings both.
export { expect };
