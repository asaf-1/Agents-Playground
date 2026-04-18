import { expect, test as base } from "@playwright/test";
import { AdminPage } from "../pom/AdminPage";
import { DashboardPage } from "../pom/DashboardPage";
import { HomePage } from "../pom/HomePage";
import { OrdersPage } from "../pom/OrdersPage";
import { ProductPage } from "../pom/ProductPage";
import { ProfilePage } from "../pom/ProfilePage";
import { SettingsPage } from "../pom/SettingsPage";
import { UserManagerPage } from "../pom/UserManagerPage";

type AppFixtures = {
  adminPage: AdminPage;
  dashboardPage: DashboardPage;
  homePage: HomePage;
  ordersPage: OrdersPage;
  productPage: ProductPage;
  profilePage: ProfilePage;
  settingsPage: SettingsPage;
  userManagerPage: UserManagerPage;
};

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
  }
});

export { expect };
