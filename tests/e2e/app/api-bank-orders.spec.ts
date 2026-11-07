// Reads openapi.json from disk, so answers can be checked against the contract.
import { readFileSync } from "node:fs";
// Ajv checks a JSON value against a JSON Schema; ajv-formats adds formats like date-time.
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
// The type of a request context.
import { type APIRequestContext } from "@playwright/test";
// Playwright's test tools, with the [RESULT] block printed after every test.
import {
  expect,
  expected,
  fact,
  test,
} from "../../../framework/fixtures/resultBlock";
// The bank helpers: sign up, sign in, accounts, balances, a unique runKey.
import {
  DEMO,
  balanceOf,
  moneyAccounts,
  signIn,
  signUpCustomer,
  uniqueRunKey,
} from "../../../framework/helpers/bank";

// Limit orders and price alerts (phase A4). An order fills when the
// customer's own price reaches its limit; an alert fires once. Neither runs in
// the background: both are checked at the start of every request the customer
// makes, so "the next request" is when things happen.
//
// Prices are personal and moving, so every limit here is set relative to the
// price the server reports a moment before, with room for the second or two
// in between. Nothing asserts an exact price; what is asserted is that the
// fill respected the limit.

// Load the OpenAPI document once and teach Ajv its schemas.
const openApiSpec = JSON.parse(readFileSync("openapi.json", "utf8"));
const ajv = new Ajv2020({
  strict: false,
  allErrors: true,
  validateSchema: false,
});
addFormats(ajv);
ajv.addSchema(openApiSpec, "openapi.json");

// Checks one answer against a named schema in openapi.json, and prints Ajv's
// errors when it does not match.
function expectSchema(schemaName: string, body: unknown) {
  const validate = ajv.compile({
    $ref: `openapi.json#/components/schemas/${schemaName}`,
  });
  expect(validate(body), JSON.stringify(validate.errors, null, 2)).toBe(true);
}

// One limit order, as the API returns it.
interface Order {
  id: string;
  symbol: string;
  side: "buy" | "sell";
  limitMicros: number;
  status: "open" | "filled" | "cancelled" | "failed";
  fillPriceMicros: number | null;
  tradeId: string | null;
  failReason: string | null;
}

// The customer's own price for a coin right now (or at `query`'s instant).
async function currentPrice(
  request: APIRequestContext,
  symbol: string,
  query = "",
): Promise<number> {
  const response = await request.get(`/api/bank/market/${symbol}${query}`);
  expect(response.status(), await response.text()).toBe(200);
  return (await response.json()).priceMicros;
}

// Places a limit order and checks it was taken (201).
async function placeOrder(
  request: APIRequestContext,
  body: Record<string, unknown>,
  query = "",
): Promise<Order> {
  fact("order", body);
  const response = await request.post(`/api/bank/orders${query}`, {
    data: body,
  });
  expect(response.status(), await response.text()).toBe(201);
  return (await response.json()).order;
}

// The customer's orders. Reading them is what runs the fill check.
async function orders(
  request: APIRequestContext,
  query = "",
): Promise<Order[]> {
  const response = await request.get(`/api/bank/orders${query}`);
  expect(response.status(), await response.text()).toBe(200);
  return (await response.json()).orders;
}

// One order by id; the test fails if it is not listed.
async function orderById(request: APIRequestContext, id: string, query = "") {
  const found = (await orders(request, query)).find((o) => o.id === id);
  expect(found, `order ${id} listed`).toBeDefined();
  return found!;
}

// A market buy through the ordinary quote-and-fill, to have coin to sell.
async function buyNow(
  request: APIRequestContext,
  symbol: string,
  spendCents: number,
  accountId: string,
) {
  fact("bought", `${spendCents} cents of ${symbol}`);
  const quote = await (
    await request.post("/api/bank/trades/quote", {
      data: { symbol, side: "buy", spendCents },
    })
  ).json();
  const filled = await request.post("/api/bank/trades", {
    data: { quoteId: quote.id, accountId },
  });
  expect(filled.status(), await filled.text()).toBe(201);
  return quote.filledAtoms as number;
}

// A new customer and their Checking account.
async function setUp(request: APIRequestContext) {
  await signUpCustomer(request, "Order Customer");
  const [checking] = (await moneyAccounts(request)).accounts;
  fact("checking", checking.id);
  fact("balance", checking.balanceCents);
  return { checking };
}

test.describe("Limit orders (/api/bank/orders)", () => {
  // A buy with a limit above today's price fills as soon as the customer
  // makes another request.
  test("a buy order whose limit the price already meets fills on the next request", async ({
    request,
  }) => {
    expected(
      "placed open; on the next read filled at or below the limit with a trade; Checking -50000, BTC held, an order_filled notification",
    );
    // A buy of $500 of BTC with a limit 1% above the price now.
    const { checking } = await setUp(request);
    const price = await currentPrice(request, "BTC");
    const limit = Math.ceil(price * 1.01);
    fact("price", price);
    fact("limit", limit);
    const placed = await placeOrder(request, {
      symbol: "BTC",
      side: "buy",
      accountId: checking.id,
      spendCents: 50_000,
      limitMicros: limit,
    });
    fact("orderId", placed.id);
    expect(placed.status).toBe("open");

    // The next request fills it, within the limit.
    const after = await orderById(request, placed.id);
    const list = await (await request.get("/api/bank/orders")).json();
    expectSchema("BankOrdersResponse", list);
    expect(after.status).toBe("filled");
    expect(after.fillPriceMicros).not.toBeNull();
    expect(after.fillPriceMicros!).toBeLessThanOrEqual(limit);
    expect(after.tradeId).not.toBeNull();

    // The money left, the coin arrived, and the customer was told.
    expect(await balanceOf(request, checking.id)).toBe(
      checking.balanceCents - 50_000,
    );
    const held = await (await request.get("/api/bank/portfolio")).json();
    expect(
      held.positions.some((p: { symbol: string }) => p.symbol === "BTC"),
    ).toBe(true);
    const { notifications } = await (
      await request.get("/api/bank/notifications")
    ).json();
    expect(
      notifications.some((n: { kind: string }) => n.kind === "order_filled"),
    ).toBe(true);
  });

  // A buy far below the price waits, takes no money, and can be cancelled once.
  test("an order out of reach stays open and can be cancelled", async ({
    request,
  }) => {
    expected(
      "open with the balance unchanged; cancel 200 cancelled; cancel again 404 ORDER_NOT_FOUND",
    );
    // A buy of ETH at half the price.
    const { checking } = await setUp(request);
    const price = await currentPrice(request, "ETH");
    fact("price", price);
    const placed = await placeOrder(request, {
      symbol: "ETH",
      side: "buy",
      accountId: checking.id,
      spendCents: 20_000,
      limitMicros: Math.max(1, Math.floor(price / 2)),
    });
    fact("orderId", placed.id);
    // Still open, and no money moved.
    expect((await orderById(request, placed.id)).status).toBe("open");
    expect(await balanceOf(request, checking.id)).toBe(checking.balanceCents);

    // Cancel it; a second cancel finds nothing.
    const cancelled = await request.delete(`/api/bank/orders/${placed.id}`);
    expect(cancelled.status()).toBe(200);
    expect((await cancelled.json()).order.status).toBe("cancelled");
    const again = await request.delete(`/api/bank/orders/${placed.id}`);
    expect(again.status()).toBe(404);
    expect((await again.json()).code).toBe("ORDER_NOT_FOUND");
  });

  // A sell far above the price waits; one just below it fills at or above its limit.
  test("a sell order fills at or above its limit", async ({ request }) => {
    expected(
      "a sell at twice the price stays open; a sell at 99% fills at or above its limit and the balance goes up",
    );
    // Buy some BTC first, so there is coin to sell.
    const { checking } = await setUp(request);
    const atoms = await buyNow(request, "BTC", 50_000, checking.id);
    const balanceAfterBuy = await balanceOf(request, checking.id);
    const price = await currentPrice(request, "BTC");
    fact("atoms", atoms);
    fact("price", price);

    // Far above: waits.
    const waiting = await placeOrder(request, {
      symbol: "BTC",
      side: "sell",
      accountId: checking.id,
      quantityAtoms: atoms,
      limitMicros: price * 2,
    });
    expect((await orderById(request, waiting.id)).status).toBe("open");

    // Reachable: fills, and respects the limit.
    const limit = Math.floor(price * 0.99);
    const placed = await placeOrder(request, {
      symbol: "BTC",
      side: "sell",
      accountId: checking.id,
      quantityAtoms: atoms,
      limitMicros: limit,
    });
    fact("orderId", placed.id);
    const after = await orderById(request, placed.id);
    expect(after.status).toBe("filled");
    expect(after.fillPriceMicros!).toBeGreaterThanOrEqual(limit);
    expect(await balanceOf(request, checking.id)).toBeGreaterThan(
      balanceAfterBuy,
    );
  });

  // Reading the orders "at" an earlier instant runs the fill check as of that
  // instant, so an order at the day's low fills there.
  test("time as an input: an order fills at a past instant where the price was lower", async ({
    request,
  }) => {
    expected(
      "a buy at the day's low stays open now, and fills at or below that low when read at its instant",
    );
    // The last 24 hours of BTC for this runKey, and its lowest point.
    const { checking } = await setUp(request);
    const runKey = uniqueRunKey("orders-at");
    fact("runKey", runKey);
    const detail = await (
      await request.get(`/api/bank/market/BTC?range=24h&runKey=${runKey}`)
    ).json();
    const points = detail.series as { at: string; priceMicros: number }[];
    const lowest = points.reduce((a, b) =>
      b.priceMicros < a.priceMicros ? b : a,
    );
    fact("lowest", `${lowest.priceMicros} at ${lowest.at}`);

    // A limit exactly at the day's low, nowhere near the price now.
    const placed = await placeOrder(request, {
      symbol: "BTC",
      side: "buy",
      accountId: checking.id,
      spendCents: 10_000,
      limitMicros: lowest.priceMicros,
    });
    fact("orderId", placed.id);
    expect((await orderById(request, placed.id)).status).toBe("open");

    // Looking at the orders "at" that instant runs the sweep at that instant.
    const at = Date.parse(lowest.at);
    const after = await orderById(
      request,
      placed.id,
      `?runKey=${runKey}&at=${at}`,
    );
    expect(after.status).toBe("filled");
    expect(after.fillPriceMicros!).toBeLessThanOrEqual(lowest.priceMicros);
  });

  // An alert the price already meets fires once and says so; one out of
  // reach stays armed until cancelled.
  test("a price alert fires once, with the price it saw", async ({
    request,
  }) => {
    expected(
      "a below-alert just over the price fires at or under its limit with a price_alert notification; a far above-alert stays armed, cancels, then 404",
    );
    // An ETH alert "below" a limit 1% over the price: already true.
    await setUp(request);
    const price = await currentPrice(request, "ETH");
    fact("price", price);

    const armed = await request.post("/api/bank/alerts", {
      data: {
        symbol: "ETH",
        direction: "below",
        limitMicros: Math.ceil(price * 1.01),
      },
    });
    expect(armed.status(), await armed.text()).toBe(201);
    const alert = (await armed.json()).alert;
    fact("alertId", alert.id);
    expect(alert.status).toBe("armed");

    // The next read shows it fired, at a price within its limit, and the
    // customer was told.
    const list = await (await request.get("/api/bank/alerts")).json();
    expectSchema("BankAlertsResponse", list);
    const fired = list.alerts.find((a: { id: string }) => a.id === alert.id);
    expect(fired.status).toBe("fired");
    expect(fired.firedMicros).toBeLessThanOrEqual(alert.limitMicros);
    const { notifications } = await (
      await request.get("/api/bank/notifications")
    ).json();
    expect(
      notifications.some((n: { kind: string }) => n.kind === "price_alert"),
    ).toBe(true);

    // Out of reach: keeps watching, until cancelled.
    const far = (
      await (
        await request.post("/api/bank/alerts", {
          data: { symbol: "ETH", direction: "above", limitMicros: price * 3 },
        })
      ).json()
    ).alert;
    fact("far alert", far.id);
    const again = await (await request.get("/api/bank/alerts")).json();
    expect(
      again.alerts.find((a: { id: string }) => a.id === far.id).status,
    ).toBe("armed");
    const cancelled = await request.delete(`/api/bank/alerts/${far.id}`);
    expect((await cancelled.json()).alert.status).toBe("cancelled");
    expect((await request.delete(`/api/bank/alerts/${far.id}`)).status()).toBe(
      404,
    );
  });

  // Bad orders are refused with the field named; an unknown coin and selling
  // coin you don't have are refused; demo and signed-out access are limited.
  test("validation and access", async ({ request, browser }) => {
    expected(
      "400 on side, limitMicros, spendCents, accountId; 404 COIN_NOT_FOUND; 409 NOT_ENOUGH_COIN; demo 403 to place, 200 to read; signed out 401",
    );
    // A good order to change one field at a time.
    const { checking } = await setUp(request);
    const price = await currentPrice(request, "BTC");
    fact("price", price);
    const good = {
      symbol: "BTC",
      side: "buy",
      accountId: checking.id,
      spendCents: 10_000,
      limitMicros: Math.floor(price / 2),
    };
    // Each bad field is named in the error.
    for (const [change, field] of [
      [{ side: "hold" }, "side"],
      [{ limitMicros: 0 }, "limitMicros"],
      [{ spendCents: 50 }, "spendCents"],
      [{ accountId: "" }, "accountId"],
    ] as [Record<string, unknown>, string][]) {
      const response = await request.post("/api/bank/orders", {
        data: { ...good, ...change },
      });
      expect(response.status(), field).toBe(400);
      expect(Object.keys((await response.json()).errors)).toContain(field);
    }
    // A coin that doesn't exist.
    const noCoin = await request.post("/api/bank/orders", {
      data: { ...good, symbol: "NOPE" },
    });
    expect(noCoin.status()).toBe(404);
    expect((await noCoin.json()).code).toBe("COIN_NOT_FOUND");
    // Selling coin the customer doesn't hold.
    const tooMuch = await request.post("/api/bank/orders", {
      data: {
        symbol: "BTC",
        side: "sell",
        accountId: checking.id,
        quantityAtoms: 1,
        limitMicros: price * 2,
      },
    });
    expect(tooMuch.status()).toBe(409);
    expect((await tooMuch.json()).code).toBe("NOT_ENOUGH_COIN");

    // The demo customer can read orders but not place one.
    const demo = await browser.newContext();
    await signIn(demo.request, DEMO.customer);
    expect(
      (await demo.request.post("/api/bank/orders", { data: good })).status(),
    ).toBe(403);
    expect((await demo.request.get("/api/bank/orders")).status()).toBe(200);
    await demo.close();

    // Someone signed out gets 401 for orders and alerts.
    const visitor = await browser.newContext();
    expect((await visitor.request.get("/api/bank/orders")).status()).toBe(401);
    expect((await visitor.request.get("/api/bank/alerts")).status()).toBe(401);
    await visitor.close();
  });
});
