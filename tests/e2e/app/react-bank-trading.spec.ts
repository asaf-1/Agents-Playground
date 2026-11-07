// Playwright's test tools, with the [RESULT] block printed after every test.
import {
  expect,
  expected,
  fact,
  test,
} from "../../../framework/fixtures/resultBlock";
// The bank helpers: accounts, sign up, and money the way the pages print it.
import {
  moneyAccounts,
  signUpCustomer,
  usd,
} from "../../../framework/helpers/bank";

// Buying and selling in the browser, and the portfolio that follows (phase 3b).
//
// The trade panel is deliberately two steps: ask for a price, then confirm it.
// That gap is where a moving market bites, so the tests walk both steps rather
// than posting straight to the API.

// Buys a coin through the trade panel: amount, price it, confirm, done.
async function buy(
  page: import("@playwright/test").Page,
  symbol: string,
  amount: string,
) {
  fact("bought", `$${amount} of ${symbol}`);
  await page.goto(`/app/markets/${symbol}`);
  await expect(page.getByTestId("trade-panel")).toBeVisible();
  await page.getByTestId("trade-amount").fill(amount);
  await page.getByTestId("trade-quote").click();
  await expect(page.getByTestId("trade-quote-box")).toBeVisible();
  await page.getByTestId("trade-confirm").click();
  await expect(page.getByTestId("trade-done")).toBeVisible();
}

test.describe("Playground Bank trading (/app/markets, /app/portfolio)", () => {
  // Signed out, the trade panel asks to sign in and has no amount field.
  test("a visitor who is not signed in is asked to log in", async ({
    page,
  }) => {
    expected("the trade panel with a sign-in prompt and no amount field");
    await page.goto("/app/markets/BTC");
    await expect(page.getByTestId("trade-panel")).toBeVisible();
    await expect(page.getByTestId("trade-sign-in")).toBeVisible();
    await expect(page.getByTestId("trade-amount")).toHaveCount(0);
  });

  // The panel lists the customer's own account and balance, and needs an
  // amount before it can price anything.
  test("the panel offers your own bank accounts with their balances", async ({
    page,
  }) => {
    expected(
      "the account picker shows Checking's number and balance; the price button is disabled",
    );
    await signUpCustomer(page.request, "Panel Customer");
    const [checking] = (await moneyAccounts(page.request)).accounts;
    fact("checking", checking.number);

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

  // A $500 buy shows its price and a countdown, then takes $500 out of Checking.
  test("buy: price it, confirm it, and the money leaves the bank account", async ({
    page,
  }) => {
    expected(
      "the quote box: total $500.00, a $ price, an amount in BTC, a countdown in seconds; 'Bought'; Checking -50000",
    );
    // A new customer on Bitcoin's page.
    await signUpCustomer(page.request, "Browser Buyer");
    const [checking] = (await moneyAccounts(page.request)).accounts;
    fact("checking", checking.id);
    fact("balance", checking.balanceCents);

    // Price a $500 buy.
    await page.goto("/app/markets/BTC");
    await page.getByTestId("trade-amount").fill("500");
    await page.getByTestId("trade-quote").click();

    // The quote box.
    const box = page.getByTestId("trade-quote-box");
    await expect(box).toBeVisible();
    await expect(page.getByTestId("trade-quote-total")).toHaveText("$500.00");
    await expect(page.getByTestId("trade-quote-price")).toHaveText(/^\$[\d,]+/);
    await expect(page.getByTestId("trade-quote-amount")).toContainText("BTC");
    await expect(page.getByTestId("trade-countdown")).toContainText("second");

    // Confirm it.
    await page.getByTestId("trade-confirm").click();
    await expect(page.getByTestId("trade-done")).toContainText("Bought");

    // The real account really moved.
    const after = (await moneyAccounts(page.request)).accounts[0];
    expect(after.balanceCents).toBe(checking.balanceCents - 50_000);
  });

  // After a buy, the Portfolio page shows the cost, the value, the position
  // and the trade, and the position links to its coin.
  test("the portfolio shows the holding, the totals and the trade", async ({
    page,
  }) => {
    expected(
      "heading Portfolio; cost $400.00; a $ value; an ETH position with a $ value; 'Bought' and ETH in the trades; the position opens /app/markets/ETH",
    );
    // A new customer buys $400 of ETH.
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

  // With nothing bought, the Portfolio page says so.
  test("an empty portfolio says so instead of showing nothing", async ({
    page,
  }) => {
    expected("the empty portfolio and empty trades messages; value $0.00");
    await signUpCustomer(page.request, "Empty Customer");
    await page.goto("/app/portfolio");
    await expect(page.getByTestId("portfolio-empty")).toBeVisible();
    await expect(page.getByTestId("trades-empty")).toBeVisible();
    await expect(page.getByTestId("portfolio-value")).toHaveText("$0.00");
  });

  // Selling half of a holding through the panel pays some of the money back.
  test("sell: the panel knows what you hold and pays the money back", async ({
    page,
  }) => {
    expected(
      "the sell side shows the SOL holding; selling half says 'Sold'; Checking ends between start - 30000 and start",
    );
    // A new customer buys $300 of SOL.
    await signUpCustomer(page.request, "Browser Seller");
    const [checking] = (await moneyAccounts(page.request)).accounts;
    fact("checking", checking.id);
    fact("balance", checking.balanceCents);
    await buy(page, "SOL", "300");

    // Switch the panel to Sell: it knows the holding.
    await page.goto("/app/markets/SOL");
    await page.getByTestId("trade-side-sell").click();
    await expect(page.getByTestId("trade-holding")).toContainText("SOL");

    // Half of what is held, to 8 decimals.
    const held = (await (
      await page.request.get("/api/bank/portfolio")
    ).json()) as { positions: { quantity: string }[] };
    const half = (Number(held.positions[0].quantity) / 2).toFixed(8);
    fact("selling", half);

    // Price and confirm the sale.
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

  // A buy shows in the bank's activity and as a notification.
  test("the buy also lands in the bank's history and the bell", async ({
    page,
  }) => {
    expected("'Bought BTC' in the bank activity; BTC in the notifications");
    await signUpCustomer(page.request, "Joined Up Customer");
    await buy(page, "BTC", "250");

    await page.goto("/app/bank");
    await expect(page.getByTestId("bank-activity")).toContainText("Bought BTC");

    await page.goto("/app/notifications");
    await expect(page.getByTestId("notifications-list")).toContainText("BTC");
  });

  // The sidebar's Portfolio link works from the market.
  test("the exchange is reachable from the sidebar", async ({ page }) => {
    expected("the Portfolio link opens a page headed Portfolio");
    await signUpCustomer(page.request, "Nav Customer");
    await page.goto("/app/markets");
    await page.getByTestId("nav-link-portfolio").click();
    await expect(page.getByTestId("app-heading")).toHaveText("Portfolio");
  });
});
