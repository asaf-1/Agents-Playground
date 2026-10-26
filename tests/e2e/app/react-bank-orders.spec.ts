import { expect, test } from "@playwright/test";
import { DEMO, moneyAccounts, signIn, signUpCustomer } from "./_bank";

// Limit orders and price alerts in the browser (phase A4): the panel on a
// coin's page, the fill showing up as the page polls, and the open-orders
// list on the Portfolio page.

// A micro-dollar price as the form takes it, rounded up to whole cents.
function dollars(micros: number, factor: number): string {
  return (Math.ceil((micros * factor) / 10_000) / 100).toFixed(2);
}

async function price(request: Parameters<typeof signIn>[0], symbol: string) {
  return (await (await request.get(`/api/bank/market/${symbol}`)).json())
    .priceMicros as number;
}

test.describe("Orders and alerts (/app/markets/:symbol)", () => {
  test("place a buy order the price already meets, and watch it fill", async ({
    page,
  }) => {
    await signUpCustomer(page.request, "Order Customer");
    const btc = await price(page.request, "BTC");

    await page.goto("/app/markets/BTC");
    await expect(page.getByTestId("orders-panel")).toBeVisible();
    await expect(page.getByTestId("orders-empty")).toBeVisible();

    await page.getByTestId("order-side").selectOption("buy");
    await page.getByTestId("order-amount").fill("250.00");
    await page.getByTestId("order-limit").fill(dollars(btc, 1.02));
    await page.getByTestId("order-place").click();

    const row = page.locator('[data-testid^="order-row-"]').first();
    await expect(row).toBeVisible();
    const id = (await row.getAttribute("data-testid"))!.replace(
      "order-row-",
      "",
    );
    // The panel polls; each poll is a request, and the sweep fills on one.
    await expect(page.getByTestId(`order-status-${id}`)).toHaveText("Filled", {
      timeout: 15_000,
    });
    await expect(row).toContainText("at $");

    await page.goto("/app/portfolio");
    await expect(page.getByTestId("position-BTC")).toBeVisible();
    await expect(page.getByTestId("portfolio-orders-empty")).toBeVisible();
  });

  test("a price alert fires on the page and an out-of-reach order is cancelled from the portfolio", async ({
    page,
  }) => {
    await signUpCustomer(page.request, "Alert Customer");
    const [checking] = (await moneyAccounts(page.request)).accounts;
    const eth = await price(page.request, "ETH");

    await page.goto("/app/markets/ETH");
    await page.getByTestId("alert-direction").selectOption("below");
    await page.getByTestId("alert-price").fill(dollars(eth, 1.02));
    await page.getByTestId("alert-set").click();
    const alertRow = page.locator('[data-testid^="alert-row-"]').first();
    await expect(alertRow).toBeVisible();
    const alertId = (await alertRow.getAttribute("data-testid"))!.replace(
      "alert-row-",
      "",
    );
    await expect(page.getByTestId(`alert-status-${alertId}`)).toHaveText(
      "Fired",
      { timeout: 15_000 },
    );

    // An order far below the price waits, and shows on the Portfolio page.
    const placed = await page.request.post("/api/bank/orders", {
      data: {
        symbol: "ETH",
        side: "buy",
        accountId: checking.id,
        spendCents: 10_000,
        limitMicros: Math.max(1, Math.floor(eth / 2)),
      },
    });
    const order = (await placed.json()).order as { id: string };
    await page.goto("/app/portfolio");
    await expect(page.getByTestId(`portfolio-order-${order.id}`)).toBeVisible();
    await page.getByTestId(`portfolio-order-cancel-${order.id}`).click();
    await expect(page.getByTestId("portfolio-orders-empty")).toBeVisible();
  });

  test("a demo customer sees the lists but no forms", async ({ page }) => {
    await signIn(page.request, DEMO.customer);
    await page.goto("/app/markets/BTC");
    await expect(page.getByTestId("orders-panel")).toBeVisible();
    await expect(page.getByTestId("orders-demo-note")).toBeVisible();
    await expect(page.getByTestId("order-form")).toHaveCount(0);
  });
});
