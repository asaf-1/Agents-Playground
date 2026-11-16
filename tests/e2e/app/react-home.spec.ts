// Playwright's test tools, with the [RESULT] block printed after every test.
import {
  expect,
  expected,
  fact,
  test,
} from "../../../framework/fixtures/resultBlock";
// The bank helpers: the demo people and signing in.
import { DEMO, signIn } from "../../../framework/helpers/bank";

// The home page (web/src/pages/HomePage.tsx): Start practicing, a second
// button that depends on who is looking, cards that say what exists, and the
// shop's count read from the shop itself.
//
// Safe in the fully parallel suite: nothing here changes data. The tests sign
// in as the read-only demo customer, support and admin, or not at all.

// The crypto card's links, and the page each opens.
const CRYPTO_LINKS = [
  { testId: "hub-link-markets", url: /\/app\/markets$/, page: "markets-page" },
  {
    testId: "hub-link-portfolio",
    url: /\/app\/portfolio$/,
    page: "portfolio-page",
  },
  { testId: "hub-link-wallet", url: /\/app\/wallet$/, page: "wallet-page" },
];

test.describe("Home page (/app)", () => {
  // A visitor: Start practicing and Explore a demo, and no stale copy.
  test("a visitor gets Start practicing and Explore a demo, and no 'on the way'", async ({
    page,
  }) => {
    expected(
      "signed out: Start practicing opens /app/practice, Explore a demo opens /app/login; the page never says 'on the way' or names the build tools",
    );
    await page.goto("/app");
    await expect(page.getByTestId("hub-cta-practice")).toHaveText(
      "Start practicing",
    );
    await expect(page.getByTestId("hub-cta-demo")).toHaveText("Explore a demo");
    await expect(page.getByTestId("hub-cta-accounts")).toHaveCount(0);
    const home = page.getByTestId("app-home");
    await expect(home).not.toContainText("on the way");
    await expect(home).not.toContainText("Vite");

    await page.getByTestId("hub-cta-practice").click();
    await expect(page).toHaveURL(/\/app\/practice$/);
    await expect(page.getByTestId("practice-page")).toBeVisible();

    await page.goto("/app");
    await page.getByTestId("hub-cta-demo").click();
    await expect(page).toHaveURL(/\/app\/login$/);
    await expect(page.getByTestId("login-page")).toBeVisible();
  });

  // A customer goes to their money.
  test("a customer gets Your accounts, which opens the bank", async ({
    page,
  }) => {
    expected(
      "signed in as the demo customer: Your accounts (no Explore a demo) opens /app/bank",
    );
    fact("customer", DEMO.customer);
    await signIn(page.request, DEMO.customer);

    await page.goto("/app");
    await expect(page.getByTestId("hub-cta-accounts")).toHaveText(
      "Your accounts",
    );
    await expect(page.getByTestId("hub-cta-demo")).toHaveCount(0);
    await page.getByTestId("hub-cta-accounts").click();
    await expect(page).toHaveURL(/\/app\/bank$/);
    await expect(page.getByTestId("bank-page")).toBeVisible();
  });

  // Staff, Support and Admin alike, go to their work.
  for (const role of ["support", "admin"] as const) {
    test(`${role} staff get Back office, which opens Bank users`, async ({
      page,
    }) => {
      expected(
        `signed in as the demo ${role}: Back office (no Your accounts) opens /app/admin/users`,
      );
      fact(role, DEMO[role]);
      await signIn(page.request, DEMO[role]);

      await page.goto("/app");
      await expect(page.getByTestId("hub-cta-backoffice")).toHaveText(
        "Back office",
      );
      await expect(page.getByTestId("hub-cta-accounts")).toHaveCount(0);
      await page.getByTestId("hub-cta-backoffice").click();
      await expect(page).toHaveURL(/\/app\/admin\/users$/);
      await expect(page.getByTestId("admin-users-page")).toBeVisible();
    });
  }

  // The shop card's count is the shop's own, never a number in the page.
  test("the shop card counts what the Products page lists", async ({
    page,
  }) => {
    expected(
      "the home card's 'N products' equals the Products page's 'N products'",
    );
    await page.goto("/app/products");
    const shopCount = page.getByTestId("products-count");
    await expect(shopCount).toHaveText(/^\d+ products$/);
    const listed = await shopCount.innerText();
    fact("products page", listed);

    await page.goto("/app");
    await expect(page.getByTestId("hub-shop-count")).toHaveText(listed);
    fact("home card", await page.getByTestId("hub-shop-count").innerText());
  });

  // The crypto card's three links each open their page.
  test("the crypto card links Markets, Portfolio and Wallet", async ({
    page,
  }) => {
    expected(
      "Markets opens /app/markets, Portfolio /app/portfolio, Wallet /app/wallet",
    );
    fact(
      "links",
      CRYPTO_LINKS.map((link) => link.testId),
    );
    for (const link of CRYPTO_LINKS) {
      await page.goto("/app");
      await page.getByTestId(link.testId).click();
      await expect(page, link.testId).toHaveURL(link.url);
      await expect(page.getByTestId(link.page), link.testId).toBeVisible();
    }
  });
});
