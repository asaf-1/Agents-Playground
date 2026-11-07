// Playwright's test tools, with the [RESULT] block printed after every test.
import {
  expect,
  expected,
  fact,
  test,
} from "../../../framework/fixtures/resultBlock";
// The bank helpers: the demo people, accounts, sign in, sign up.
import {
  DEMO,
  moneyAccounts,
  signIn,
  signUpCustomer,
} from "../../../framework/helpers/bank";

// Limit orders and price alerts in the browser (phase A4): the panel on a
// coin's page, the fill showing up as the page polls, and the open-orders
// list on the Portfolio page.

// A micro-dollar price as the form takes it, rounded up to whole cents.
function dollars(micros: number, factor: number): string {
  return (Math.ceil((micros * factor) / 10_000) / 100).toFixed(2);
}

// The signed-in customer's price for a coin right now, in micro-dollars.
async function price(request: Parameters<typeof signIn>[0], symbol: string) {
  return (await (await request.get(`/api/bank/market/${symbol}`)).json())
    .priceMicros as number;
}

test.describe("Orders and alerts (/app/markets/:symbol)", () => {
  // A buy with a limit above the price fills while the page watches, and the
  // coin then shows on the Portfolio page.
  test("place a buy order the price already meets, and watch it fill", async ({
    page,
  }) => {
    expected(
      "the new order turns Filled 'at $' within 15 s; the portfolio shows BTC and no open orders",
    );
    // A new customer on Bitcoin's page, with no orders yet.
    await signUpCustomer(page.request, "Order Customer");
    const btc = await price(page.request, "BTC");
    fact("btc price", btc);

    await page.goto("/app/markets/BTC");
    await expect(page.getByTestId("orders-panel")).toBeVisible();
    await expect(page.getByTestId("orders-empty")).toBeVisible();

    // A $250 buy with a limit 2% above the price.
    await page.getByTestId("order-side").selectOption("buy");
    await page.getByTestId("order-amount").fill("250.00");
    await page.getByTestId("order-limit").fill(dollars(btc, 1.02));
    await page.getByTestId("order-place").click();

    // Its row appears; read its id from the row's test id.
    const row = page.locator('[data-testid^="order-row-"]').first();
    await expect(row).toBeVisible();
    const id = (await row.getAttribute("data-testid"))!.replace(
      "order-row-",
      "",
    );
    fact("orderId", id);
    // The panel polls; each poll is a request, and the sweep fills on one.
    await expect(page.getByTestId(`order-status-${id}`)).toHaveText("Filled", {
      timeout: 15_000,
    });
    await expect(row).toContainText("at $");

    // The Portfolio page holds the BTC and has no open orders.
    await page.goto("/app/portfolio");
    await expect(page.getByTestId("position-BTC")).toBeVisible();
    await expect(page.getByTestId("portfolio-orders-empty")).toBeVisible();
  });

  // An alert the price already meets fires on the page; an order far below
  // the price waits on the Portfolio page and can be cancelled there.
  test("a price alert fires on the page and an out-of-reach order is cancelled from the portfolio", async ({
    page,
  }) => {
    expected(
      "the new alert turns Fired within 15 s; the half-price order shows on the portfolio and is cancelled, leaving none open",
    );
    // A new customer on Ether's page.
    await signUpCustomer(page.request, "Alert Customer");
    const [checking] = (await moneyAccounts(page.request)).accounts;
    const eth = await price(page.request, "ETH");
    fact("eth price", eth);

    // An alert "below" a price 2% over the current one: already true.
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
    fact("alertId", alertId);
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
    fact("orderId", order.id);
    await page.goto("/app/portfolio");
    await expect(page.getByTestId(`portfolio-order-${order.id}`)).toBeVisible();
    // Cancel it there: no open orders left.
    await page.getByTestId(`portfolio-order-cancel-${order.id}`).click();
    await expect(page.getByTestId("portfolio-orders-empty")).toBeVisible();
  });

  // The demo customer sees the orders panel with a note, but no form.
  test("a demo customer sees the lists but no forms", async ({ page }) => {
    expected("the orders panel and the demo note; no order form");
    await signIn(page.request, DEMO.customer);
    await page.goto("/app/markets/BTC");
    await expect(page.getByTestId("orders-panel")).toBeVisible();
    await expect(page.getByTestId("orders-demo-note")).toBeVisible();
    await expect(page.getByTestId("order-form")).toHaveCount(0);
  });
});
