import { expect, test } from "@playwright/test";

// Playground Bank, phase 1: the shared shell around every React page (practice
// banner, sidebar, home hub, account menu), the gear shop and the About page.
// Safe in the fully parallel suite: nothing here changes shared data, and the
// login test's session cookie lives only in its own browser context.
const PAGES = [
  "/app",
  "/app/orders",
  "/app/users",
  "/app/products",
  "/app/account",
  "/app/about",
];

test.describe("Playground Bank shell (/app)", () => {
  test("shows the practice-site banner on every page", async ({ page }) => {
    for (const path of PAGES) {
      await page.goto(path);
      await expect(page.getByTestId("practice-banner")).toContainText(
        "QA, agents and platform engineers",
      );
    }
  });

  test("the home hub links into the back office", async ({ page }) => {
    await page.goto("/app");
    await expect(page.getByTestId("hub-card-bank")).not.toContainText("Soon");
    await expect(page.getByTestId("hub-link-bank")).toBeVisible();
    // Phase 3a opened the exchange, so the crypto card is a real link now.
    await expect(page.getByTestId("hub-card-crypto")).not.toContainText("Soon");
    await expect(page.getByTestId("hub-link-markets")).toBeVisible();

    await page.getByTestId("hub-link-orders").click();
    await expect(page).toHaveURL(/\/app\/orders$/);
    await expect(page.getByTestId("orders-page")).toBeVisible();
  });

  test("the sidebar marks the current page", async ({ page }) => {
    await page.goto("/app/users");
    await expect(page.getByTestId("nav-link-users")).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(page.getByTestId("nav-link-home")).not.toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  test("the gear shop sells crypto gear", async ({ page }) => {
    await page.goto("/app/products/sku-001");
    await expect(page.getByTestId("app-heading")).toHaveText(
      "Hashforge S1 Miner",
    );
    await expect(page.getByTestId("product-category")).toHaveText("Compute");
  });

  test("every product card has its own icon", async ({ page }) => {
    await page.goto("/app/products");
    const icons = page.getByTestId("products-grid").locator("svg[data-icon]");
    await expect(icons).toHaveCount(48);
    const names = await icons.evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("data-icon")),
    );
    expect(new Set(names).size).toBe(48);
  });

  test("the guest menu offers log in, profile and settings", async ({
    page,
  }) => {
    await page.goto("/app");
    await page.getByTestId("account-menu-trigger").click();
    await expect(page.getByTestId("account-menu-login")).toBeVisible();
    await expect(page.getByTestId("account-menu-view-profile")).toBeVisible();
    await expect(page.getByTestId("account-menu-edit-profile")).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    await expect(page.getByTestId("account-menu-settings")).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  // Each test has its own browser context, so this session cookie stays here.
  test("logging in shows the user and role; logging out returns to Guest", async ({
    page,
  }) => {
    await page.goto("/app/login");
    await page.getByTestId("login-email").fill("maya@playgroundbank.test");
    await page.getByTestId("login-password").fill("demo1234");
    await page.getByTestId("login-submit").click();

    await expect(page).toHaveURL(/\/app\/profile$/);
    await expect(page.getByTestId("profile-name")).toHaveText("Maya Chen");
    await expect(page.getByTestId("profile-role")).toHaveText("Customer");
    await expect(page.getByTestId("account-menu-trigger")).toContainText(
      "Maya",
    );

    await page.getByTestId("account-menu-trigger").click();
    await page.getByTestId("account-menu-logout").click();
    await expect(page.getByTestId("account-menu-trigger")).toContainText(
      "Guest",
    );
  });

  test("a locked account cannot log in", async ({ page }) => {
    await page.goto("/app/login");
    await page.getByTestId("login-email").fill("lee@playgroundbank.test");
    await page.getByTestId("login-password").fill("demo1234");
    await page.getByTestId("login-submit").click();
    await expect(page.getByTestId("login-error")).toHaveText(
      "This account is locked.",
    );
  });

  test("the About page credits the author", async ({ page }) => {
    await page.goto("/app/about");
    await expect(page.getByTestId("about-author-name")).toHaveText("Asaf Nuri");
    await expect(page.getByTestId("about-author")).toContainText(
      "Quality Platform Engineer",
    );
  });
});
