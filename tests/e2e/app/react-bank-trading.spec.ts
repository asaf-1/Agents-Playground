import { expect, test } from "@playwright/test";
import { moneyAccounts, signUpCustomer, usd } from "./_bank";

// Buying and selling in the browser, and the portfolio that follows (phase 3b).
//
// The trade panel is deliberately two steps: ask for a price, then confirm it.
// That gap is where a moving market bites, so the tests walk both steps rather
// than posting straight to the API.

async function buy(
  page: import("@playwright/test").Page,
  symbol: string,
  amount: string,
) {
  await page.goto(`/app/markets/${symbol}`);
  await expect(page.getByTestId("trade-panel")).toBeVisible();
  await page.getByTestId("trade-amount").fill(amount);
  await page.getByTestId("trade-quote").click();
  await expect(page.getByTestId("trade-quote-box")).toBeVisible();
  await page.getByTestId("trade-confirm").click();
  await expect(page.getByTestId("trade-done")).toBeVisible();
}

test.describe("Playground Bank trading (/app/markets, /app/portfolio)", () => {
  test("a visitor who is not signed in is asked to log in", async ({
    page,
  }) => {
    await page.goto("/app/markets/BTC");
    await expect(page.getByTestId("trade-panel")).toBeVisible();
    await expect(page.getByTestId("trade-sign-in")).toBeVisible();
    await expect(page.getByTestId("trade-amount")).toHaveCount(0);
  });

  test("the panel offers your own bank accounts with their balances", async ({
    page,
  }) => {
    await signUpCustomer(page.request, "Panel Customer");
    const [checking] = (await moneyAccounts(page.request)).accounts;

    await page.goto("/app/markets/BTC");
    await expect(page.getByTestId("trade-account")).toContainText(
      checking.number,
    );
    await expect(page.getByTestId("trade-account")).toContainText(
      usd(checking.balanceCents),
    );
    // Nothing can be priced until an amount is entered.
    await expect(page.getByTestId("trade-quote")).toBeDisabled();
  });

  test("buy: price it, confirm it, and the money leaves the bank account", async ({
    page,
  }) => {
    await signUpCustomer(page.request, "Browser Buyer");
    const [checking] = (await moneyAccounts(page.request)).accounts;

    await page.goto("/app/markets/BTC");
    await page.getByTestId("trade-amount").fill("500");
    await page.getByTestId("trade-quote").click();

    const box = page.getByTestId("trade-quote-box");
    await expect(box).toBeVisible();
    await expect(page.getByTestId("trade-quote-total")).toHaveText("$500.00");
    await expect(page.getByTestId("trade-quote-price")).toHaveText(/^\$[\d,]+/);
    await expect(page.getByTestId("trade-quote-amount")).toContainText("BTC");
    await expect(page.getByTestId("trade-countdown")).toContainText("second");

    await page.getByTestId("trade-confirm").click();
    await expect(page.getByTestId("trade-done")).toContainText("Bought");

    // The real account really moved.
    const after = (await moneyAccounts(page.request)).accounts[0];
    expect(after.balanceCents).toBe(checking.balanceCents - 50_000);
  });

  test("the portfolio shows the holding, the totals and the trade", async ({
    page,
  }) => {
    await signUpCustomer(page.request, "Portfolio Customer");
    await buy(page, "ETH", "400");

    await page.goto("/app/portfolio");
    await expect(page.getByTestId("app-heading")).toHaveText("Portfolio");
    await expect(page.getByTestId("portfolio-cost")).toHaveText("$400.00");
    await expect(page.getByTestId("portfolio-value")).toHaveText(/^\$[\d,]+/);
    await expect(page.getByTestId("position-ETH")).toBeVisible();
    await expect(page.getByTestId("position-value-ETH")).toHaveText(
      /^\$[\d,]+/,
    );
    await expect(page.getByTestId("trades-table")).toContainText("Bought");
    await expect(page.getByTestId("trades-table")).toContainText("ETH");

    // A position links back to the coin it is.
    await page.getByTestId("position-link-ETH").click();
    await expect(page).toHaveURL(/\/app\/markets\/ETH$/);
  });

  test("an empty portfolio says so instead of showing nothing", async ({
    page,
  }) => {
    await signUpCustomer(page.request, "Empty Customer");
    await page.goto("/app/portfolio");
    await expect(page.getByTestId("portfolio-empty")).toBeVisible();
    await expect(page.getByTestId("trades-empty")).toBeVisible();
    await expect(page.getByTestId("portfolio-value")).toHaveText("$0.00");
  });

  test("sell: the panel knows what you hold and pays the money back", async ({
    page,
  }) => {
    await signUpCustomer(page.request, "Browser Seller");
    const [checking] = (await moneyAccounts(page.request)).accounts;
    await buy(page, "SOL", "300");

    await page.goto("/app/markets/SOL");
    await page.getByTestId("trade-side-sell").click();
    await expect(page.getByTestId("trade-holding")).toContainText("SOL");

    const held = (await (
      await page.request.get("/api/bank/portfolio")
    ).json()) as { positions: { quantity: string }[] };
    const half = (Number(held.positions[0].quantity) / 2).toFixed(8);

    await page.getByTestId("trade-amount").fill(half);
    await page.getByTestId("trade-quote").click();
    await expect(page.getByTestId("trade-quote-box")).toBeVisible();
    await page.getByTestId("trade-confirm").click();
    await expect(page.getByTestId("trade-done")).toContainText("Sold");

    // Money came back, so the account is no longer down the full $300.
    const after = (await moneyAccounts(page.request)).accounts[0];
    expect(after.balanceCents).toBeGreaterThan(checking.balanceCents - 30_000);
    expect(after.balanceCents).toBeLessThan(checking.balanceCents);
  });

  test("the buy also lands in the bank's history and the bell", async ({
    page,
  }) => {
    await signUpCustomer(page.request, "Joined Up Customer");
    await buy(page, "BTC", "250");

    await page.goto("/app/bank");
    await expect(page.getByTestId("bank-activity")).toContainText("Bought BTC");

    await page.goto("/app/notifications");
    await expect(page.getByTestId("notifications-list")).toContainText("BTC");
  });

  test("the exchange is reachable from the sidebar", async ({ page }) => {
    await signUpCustomer(page.request, "Nav Customer");
    await page.goto("/app/markets");
    await page.getByTestId("nav-link-portfolio").click();
    await expect(page.getByTestId("app-heading")).toHaveText("Portfolio");
  });
});
