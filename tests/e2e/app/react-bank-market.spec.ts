import { expect, test } from "@playwright/test";

// The crypto exchange's pages (phase 3a): /app/markets and /app/markets/:symbol.
//
// Prices move while the page is open and differ per visitor, so nothing here
// asserts an exact number. The tests check the shape: every coin is listed, a
// price is formatted as money, a row leads to its coin, the chart is drawn, and
// the range buttons really change the window.

const SYMBOLS = ["BTC", "ETH", "SOL", "ADA", "AVAX", "LINK", "DOT", "PLAY"];
const MONEY = /^\$[\d,]+\.\d{2,6}$/;
const PERCENT = /^[+−]?\d+\.\d{2}%$/;

test.describe("Playground Bank markets", () => {
  test("lists every coin with a price, a change and a sparkline", async ({
    page,
  }) => {
    await page.goto("/app/markets");
    await expect(page.getByTestId("app-heading")).toHaveText("Markets");

    const rows = page.getByTestId("market-list").locator("li");
    await expect(rows).toHaveCount(SYMBOLS.length);

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

  test("the market is open to a visitor who has not signed in", async ({
    page,
  }) => {
    await page.goto("/app/markets");
    await expect(page.getByTestId("market-list")).toBeVisible();
    // No sign-in wall, and nothing claims the visitor is signed in.
    await expect(page.getByTestId("market-price-BTC")).toHaveText(MONEY);
  });

  test("the top-bar ticker shows the same prices as the list", async ({
    page,
  }) => {
    await page.goto("/app/markets");
    await expect(page.getByTestId("market-ticker")).toBeVisible();

    // One query feeds both, so the strip and the row can never disagree.
    const rowPrice = await page.getByTestId("market-price-BTC").textContent();
    await expect(page.getByTestId("market-ticker")).toContainText(
      rowPrice ?? "",
    );
  });

  test("a row opens that coin's page, and back returns to the market", async ({
    page,
  }) => {
    await page.goto("/app/markets");
    await page.getByTestId("market-link-ETH").click();

    await expect(page).toHaveURL(/\/app\/markets\/ETH$/);
    await expect(page.getByTestId("app-heading")).toHaveText("Ethereum (ETH)");
    await expect(page.getByTestId("coin-price")).toHaveText(MONEY);
    await expect(page.getByTestId("coin-chart")).toBeVisible();

    await page.getByTestId("coin-back").click();
    await expect(page).toHaveURL(/\/app\/markets$/);
    await expect(page.getByTestId("app-heading")).toHaveText("Markets");
  });

  test("the coin page draws a chart with a high and a low", async ({
    page,
  }) => {
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

  test("the range buttons change the window and are not dead controls", async ({
    page,
  }) => {
    await page.goto("/app/markets/BTC");

    await expect(page.getByTestId("coin-range-24h")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    const dayHigh = await page.getByTestId("coin-high").textContent();

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

  test("an unknown coin says so instead of breaking", async ({ page }) => {
    await page.goto("/app/markets/NOPE");
    await expect(page.getByTestId("coin-error")).toBeVisible();
    await expect(page.getByTestId("coin-error")).toHaveText("No such coin.");
  });

  test("the exchange is reachable from the sidebar and the home hub", async ({
    page,
  }) => {
    await page.goto("/app");
    // Phase 3a replaced the "Soon" placeholder with the real thing.
    await expect(page.getByTestId("hub-card-crypto")).not.toContainText("Soon");

    await page.getByTestId("hub-link-markets").click();
    await expect(page).toHaveURL(/\/app\/markets$/);

    await page.getByTestId("nav-link-markets").click();
    await expect(page.getByTestId("app-heading")).toHaveText("Markets");
  });
});
