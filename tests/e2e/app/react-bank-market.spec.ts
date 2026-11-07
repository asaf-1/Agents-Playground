// Playwright's test tools, with the [RESULT] block printed after every test.
import {
  expect,
  expected,
  fact,
  test,
} from "../../../framework/fixtures/resultBlock";

// The crypto exchange's pages (phase 3a): /app/markets and /app/markets/:symbol.
//
// Prices move while the page is open and differ per visitor, so nothing here
// asserts an exact number. The tests check the shape: every coin is listed, a
// price is formatted as money, a row leads to its coin, the chart is drawn, and
// the range buttons really change the window.

// Every coin, in the market's order.
const SYMBOLS = ["BTC", "ETH", "SOL", "ADA", "AVAX", "LINK", "DOT", "PLAY"];
// Money as the page prints it, like $67,420.12.
const MONEY = /^\$[\d,]+\.\d{2,6}$/;
// A change as the page prints it, like +1.23% (the minus is a real minus sign).
const PERCENT = /^[+−]?\d+\.\d{2}%$/;

test.describe("Playground Bank markets", () => {
  // The market lists all eight coins, each with a price, a change and a sparkline.
  test("lists every coin with a price, a change and a sparkline", async ({
    page,
  }) => {
    expected(
      "heading Markets; 8 rows, each with a money price and a percent change; 8 sparklines",
    );
    await page.goto("/app/markets");
    await expect(page.getByTestId("app-heading")).toHaveText("Markets");

    // One row per coin.
    const rows = page.getByTestId("market-list").locator("li");
    await expect(rows).toHaveCount(SYMBOLS.length);

    // Each row's price and change are formatted.
    for (const symbol of SYMBOLS) {
      await expect(page.getByTestId(`market-row-${symbol}`)).toBeVisible();
      await expect(page.getByTestId(`market-price-${symbol}`)).toHaveText(
        MONEY,
      );
      await expect(page.getByTestId(`market-change-${symbol}`)).toHaveText(
        PERCENT,
      );
    }

    // One sparkline per row, drawn inline rather than by a chart library.
    // Scoped to .sparkline: each row also carries the coin's own icon, which
    // is an svg too.
    await expect(
      page.getByTestId("market-list").locator("svg.sparkline"),
    ).toHaveCount(SYMBOLS.length);
  });

  // The market needs no sign-in.
  test("the market is open to a visitor who has not signed in", async ({
    page,
  }) => {
    expected("the market list and a money price for BTC, signed out");
    await page.goto("/app/markets");
    await expect(page.getByTestId("market-list")).toBeVisible();
    // No sign-in wall, and nothing claims the visitor is signed in.
    await expect(page.getByTestId("market-price-BTC")).toHaveText(MONEY);
  });

  // The ticker across the top shows the same BTC price as the list.
  test("the top-bar ticker shows the same prices as the list", async ({
    page,
  }) => {
    expected("the ticker contains the list's BTC price");
    await page.goto("/app/markets");
    await expect(page.getByTestId("market-ticker")).toBeVisible();

    // One query feeds both, so the strip and the row can never disagree.
    const rowPrice = await page.getByTestId("market-price-BTC").textContent();
    fact("btc", rowPrice);
    await expect(page.getByTestId("market-ticker")).toContainText(
      rowPrice ?? "",
    );
  });

  // A row opens its coin's page, and Back returns to the market.
  test("a row opens that coin's page, and back returns to the market", async ({
    page,
  }) => {
    expected(
      "/app/markets/ETH with 'Ethereum (ETH)', a price and a chart; Back returns to /app/markets",
    );
    await page.goto("/app/markets");
    await page.getByTestId("market-link-ETH").click();

    // Ethereum's page.
    await expect(page).toHaveURL(/\/app\/markets\/ETH$/);
    await expect(page.getByTestId("app-heading")).toHaveText("Ethereum (ETH)");
    await expect(page.getByTestId("coin-price")).toHaveText(MONEY);
    await expect(page.getByTestId("coin-chart")).toBeVisible();

    // Back to the list.
    await page.getByTestId("coin-back").click();
    await expect(page).toHaveURL(/\/app\/markets$/);
    await expect(page.getByTestId("app-heading")).toHaveText("Markets");
  });

  // Bitcoin's page has a 24-hour chart with its high and low.
  test("the coin page draws a chart with a high and a low", async ({
    page,
  }) => {
    expected(
      "'Bitcoin (BTC)'; the chart labelled for 24 hours; money high and low; the change mentions 24 hours",
    );
    await page.goto("/app/markets/BTC");
    await expect(page.getByTestId("app-heading")).toHaveText("Bitcoin (BTC)");

    await expect(page.getByTestId("coin-chart")).toHaveAttribute(
      "aria-label",
      /Bitcoin price over 24 hours/,
    );
    await expect(page.getByTestId("coin-high")).toHaveText(MONEY);
    await expect(page.getByTestId("coin-low")).toHaveText(MONEY);
    await expect(page.getByTestId("coin-change")).toContainText("24 hours");
  });

  // The 30-day button really changes the chart: pressed state, label and high all move.
  test("the range buttons change the window and are not dead controls", async ({
    page,
  }) => {
    expected(
      "24h pressed first; after 30d: 30d pressed, 24h not, the change and chart say 30 days, the high differs from the day's",
    );
    await page.goto("/app/markets/BTC");

    // 24 hours to begin with; remember the day's high.
    await expect(page.getByTestId("coin-range-24h")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    const dayHigh = await page.getByTestId("coin-high").textContent();
    fact("day high", dayHigh);

    // Switch to 30 days.
    await page.getByTestId("coin-range-30d").click();

    await expect(page.getByTestId("coin-range-30d")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.getByTestId("coin-range-24h")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await expect(page.getByTestId("coin-change")).toContainText("30 days");
    await expect(page.getByTestId("coin-chart")).toHaveAttribute(
      "aria-label",
      /over 30 days/,
    );
    // A month reaches past a day, so its high cannot be the day's high.
    await expect(page.getByTestId("coin-high")).not.toHaveText(dayHigh ?? "");
  });

  // An unknown coin shows a message instead of an error page.
  test("an unknown coin says so instead of breaking", async ({ page }) => {
    expected("'No such coin.'");
    await page.goto("/app/markets/NOPE");
    await expect(page.getByTestId("coin-error")).toBeVisible();
    await expect(page.getByTestId("coin-error")).toHaveText("No such coin.");
  });

  // The exchange is linked from the home hub and from the sidebar.
  test("the exchange is reachable from the sidebar and the home hub", async ({
    page,
  }) => {
    expected(
      "the crypto card is not 'Soon'; its link opens /app/markets; the sidebar link shows Markets",
    );
    await page.goto("/app");
    // Phase 3a replaced the "Soon" placeholder with the real thing.
    await expect(page.getByTestId("hub-card-crypto")).not.toContainText("Soon");

    await page.getByTestId("hub-link-markets").click();
    await expect(page).toHaveURL(/\/app\/markets$/);

    await page.getByTestId("nav-link-markets").click();
    await expect(page.getByTestId("app-heading")).toHaveText("Markets");
  });
});
