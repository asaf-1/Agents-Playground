// Playwright's test with one fixture per page object, so a test can ask for
// `homePage` or `userManagerPage` and get it ready to use. Specs take it
// through appTest.ts, which adds the [RESULT] block.

// Playwright's test and expect.
import { expect, test as base } from "@playwright/test";
// The page objects.
import { AdminPage } from "../pom/AdminPage";
import { DashboardPage } from "../pom/DashboardPage";
import { HomePage } from "../pom/HomePage";
import { LoginPage } from "../pom/LoginPage";
import { OrdersPage } from "../pom/OrdersPage";
import { ProductPage } from "../pom/ProductPage";
import { ProfilePage } from "../pom/ProfilePage";
import { SettingsPage } from "../pom/SettingsPage";
import { UserManagerPage } from "../pom/UserManagerPage";

// The page-object fixtures and their types.
type AppFixtures = {
  adminPage: AdminPage;
  dashboardPage: DashboardPage;
  homePage: HomePage;
  loginPage: LoginPage;
  ordersPage: OrdersPage;
  productPage: ProductPage;
  profilePage: ProfilePage;
  settingsPage: SettingsPage;
  userManagerPage: UserManagerPage;
};

// Each fixture wraps the test's own page in its page object.
export const test = base.extend<AppFixtures>({
  adminPage: async ({ page }, use) => {
    await use(new AdminPage(page));
  },
  dashboardPage: async ({ page }, use) => {
    await use(new DashboardPage(page));
  },
  homePage: async ({ page }, use) => {
    await use(new HomePage(page));
  },
  loginPage: async ({ page }, use) => {
    await use(new LoginPage(page));
  },
  ordersPage: async ({ page }, use) => {
    await use(new OrdersPage(page));
  },
  productPage: async ({ page }, use) => {
    await use(new ProductPage(page));
  },
  profilePage: async ({ page }, use) => {
    await use(new ProfilePage(page));
  },
  settingsPage: async ({ page }, use) => {
    await use(new SettingsPage(page));
  },
  userManagerPage: async ({ page }, use) => {
    await use(new UserManagerPage(page));
  },
});

// Passed on, so one import brings both.
export { expect };
