import { expect, test as base } from "@playwright/test";
import { DashboardPage } from "../pom/DashboardPage";
import { HomePage } from "../pom/HomePage";
import { ProductPage } from "../pom/ProductPage";
import { UserManagerPage } from "../pom/UserManagerPage";

type AppFixtures = {
  dashboardPage: DashboardPage;
  homePage: HomePage;
  productPage: ProductPage;
  userManagerPage: UserManagerPage;
};

export const test = base.extend<AppFixtures>({
  dashboardPage: async ({ page }, use) => {
    await use(new DashboardPage(page));
  },
  homePage: async ({ page }, use) => {
    await use(new HomePage(page));
  },
  productPage: async ({ page }, use) => {
    await use(new ProductPage(page));
  },
  userManagerPage: async ({ page }, use) => {
    await use(new UserManagerPage(page));
  }
});

export { expect };
