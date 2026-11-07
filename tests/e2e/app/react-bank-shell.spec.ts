// Playwright's test tools, with the [RESULT] block printed after every test.
import {
  expect,
  expected,
  fact,
  test,
} from "../../../framework/fixtures/resultBlock";

// Playground Bank, phase 1: the shared shell around every React page (practice
// banner, sidebar, home hub, account menu), the gear shop and the About page.
// Safe in the fully parallel suite: nothing here changes shared data, and the
// login test's session cookie lives only in its own browser context.

// The pages the banner test visits.
const PAGES = [
  "/app",
  "/app/orders",
  "/app/users",
  "/app/products",
  "/app/account",
  "/app/about",
];

test.describe("Playground Bank shell (/app)", () => {
  // Every page carries the banner saying this is a practice site.
  test("shows the practice-site banner on every page", async ({ page }) => {
    expected(
      "on each of the 6 pages, the banner mentions 'QA, agents and platform engineers'",
    );
    fact("pages", PAGES);
    for (const path of PAGES) {
      await page.goto(path);
      await expect(page.getByTestId("practice-banner")).toContainText(
        "QA, agents and platform engineers",
      );
    }
  });

  // The home hub's Bank and Crypto cards are real links, and Orders opens the Orders page.
  test("the home hub links into the back office", async ({ page }) => {
    expected(
      "the bank and crypto cards are not 'Soon' and have links; the Orders link opens /app/orders",
    );
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

  // The sidebar marks the page you are on, and only that one.
  test("the sidebar marks the current page", async ({ page }) => {
    expected("on /app/users, Users has aria-current=page and Home does not");
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

  // The shop's first product is a crypto miner.
  test("the gear shop sells crypto gear", async ({ page }) => {
    expected("sku-001 is the Hashforge S1 Miner, in Compute");
    await page.goto("/app/products/sku-001");
    await expect(page.getByTestId("app-heading")).toHaveText(
      "Hashforge S1 Miner",
    );
    await expect(page.getByTestId("product-category")).toHaveText("Compute");
  });

  // All 48 product cards have an icon, and no two share one.
  test("every product card has its own icon", async ({ page }) => {
    expected("48 icons in the grid, 48 different names");
    await page.goto("/app/products");
    const icons = page.getByTestId("products-grid").locator("svg[data-icon]");
    await expect(icons).toHaveCount(48);
    // Read every icon's name and count the different ones.
    const names = await icons.evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("data-icon")),
    );
    fact("icons", names.length);
    expect(new Set(names).size).toBe(48);
  });

  // A signed-out visitor's menu offers Log in and View profile; Edit profile
  // and Settings are greyed out.
  test("the guest menu offers log in, profile and settings", async ({
    page,
  }) => {
    expected(
      "Log in and View profile visible; Edit profile and Settings aria-disabled",
    );
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
  // Logging in as the demo customer shows their name and role; logging out
  // goes back to Guest.
  test("logging in shows the user and role; logging out returns to Guest", async ({
    page,
  }) => {
    expected(
      "/app/profile shows Maya Chen, Customer, and Maya in the menu; after logout the menu says Guest",
    );
    // Log in through the form.
    await page.goto("/app/login");
    await page.getByTestId("login-email").fill("maya@playgroundbank.test");
    await page.getByTestId("login-password").fill("demo1234");
    await page.getByTestId("login-submit").click();

    // The profile shows the demo customer.
    await expect(page).toHaveURL(/\/app\/profile$/);
    await expect(page.getByTestId("profile-name")).toHaveText("Maya Chen");
    await expect(page.getByTestId("profile-role")).toHaveText("Customer");
    await expect(page.getByTestId("account-menu-trigger")).toContainText(
      "Maya",
    );

    // Log out from the menu.
    await page.getByTestId("account-menu-trigger").click();
    await page.getByTestId("account-menu-logout").click();
    await expect(page.getByTestId("account-menu-trigger")).toContainText(
      "Guest",
    );
  });

  // The locked demo account's log-in is refused with a message.
  test("a locked account cannot log in", async ({ page }) => {
    expected("'This account is locked.'");
    await page.goto("/app/login");
    await page.getByTestId("login-email").fill("lee@playgroundbank.test");
    await page.getByTestId("login-password").fill("demo1234");
    await page.getByTestId("login-submit").click();
    await expect(page.getByTestId("login-error")).toHaveText(
      "This account is locked.",
    );
  });

  // The About page names the author.
  test("the About page credits the author", async ({ page }) => {
    expected("Asaf Nuri, Quality Platform Engineer");
    await page.goto("/app/about");
    await expect(page.getByTestId("about-author-name")).toHaveText("Asaf Nuri");
    await expect(page.getByTestId("about-author")).toContainText(
      "Quality Platform Engineer",
    );
  });
});
