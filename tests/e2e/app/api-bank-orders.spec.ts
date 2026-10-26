import { readFileSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { expect, test, type APIRequestContext } from "@playwright/test";
import {
  DEMO,
  balanceOf,
  moneyAccounts,
  signIn,
  signUpCustomer,
  uniqueRunKey,
} from "./_bank";

// Limit orders and price alerts (phase A4). An order fills when the
// customer's own price reaches its limit; an alert fires once. Neither runs in
// the background: both are checked at the start of every request the customer
// makes, so "the next request" is when things happen.
//
// Prices are personal and moving, so every limit here is set relative to the
// price the server reports a moment before, with room for the second or two
// in between. Nothing asserts an exact price; what is asserted is that the
// fill respected the limit.

const openApiSpec = JSON.parse(readFileSync("openapi.json", "utf8"));
const ajv = new Ajv2020({
  strict: false,
  allErrors: true,
  validateSchema: false,
});
addFormats(ajv);
ajv.addSchema(openApiSpec, "openapi.json");

function expectSchema(schemaName: string, body: unknown) {
  const validate = ajv.compile({
    $ref: `openapi.json#/components/schemas/${schemaName}`,
  });
  expect(validate(body), JSON.stringify(validate.errors, null, 2)).toBe(true);
}

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

async function currentPrice(
  request: APIRequestContext,
  symbol: string,
  query = "",
): Promise<number> {
  const response = await request.get(`/api/bank/market/${symbol}${query}`);
  expect(response.status(), await response.text()).toBe(200);
  return (await response.json()).priceMicros;
}

async function placeOrder(
  request: APIRequestContext,
  body: Record<string, unknown>,
  query = "",
): Promise<Order> {
  const response = await request.post(`/api/bank/orders${query}`, {
    data: body,
  });
  expect(response.status(), await response.text()).toBe(201);
  return (await response.json()).order;
}

async function orders(
  request: APIRequestContext,
  query = "",
): Promise<Order[]> {
  const response = await request.get(`/api/bank/orders${query}`);
  expect(response.status(), await response.text()).toBe(200);
  return (await response.json()).orders;
}

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

async function setUp(request: APIRequestContext) {
  await signUpCustomer(request, "Order Customer");
  const [checking] = (await moneyAccounts(request)).accounts;
  return { checking };
}

test.describe("Limit orders (/api/bank/orders)", () => {
  test("a buy order whose limit the price already meets fills on the next request", async ({
    request,
  }) => {
    const { checking } = await setUp(request);
    const price = await currentPrice(request, "BTC");
    const limit = Math.ceil(price * 1.01);
    const placed = await placeOrder(request, {
      symbol: "BTC",
      side: "buy",
      accountId: checking.id,
      spendCents: 50_000,
      limitMicros: limit,
    });
    expect(placed.status).toBe("open");

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

  test("an order out of reach stays open and can be cancelled", async ({
    request,
  }) => {
    const { checking } = await setUp(request);
    const price = await currentPrice(request, "ETH");
    const placed = await placeOrder(request, {
      symbol: "ETH",
      side: "buy",
      accountId: checking.id,
      spendCents: 20_000,
      limitMicros: Math.max(1, Math.floor(price / 2)),
    });
    expect((await orderById(request, placed.id)).status).toBe("open");
    expect(await balanceOf(request, checking.id)).toBe(checking.balanceCents);

    const cancelled = await request.delete(`/api/bank/orders/${placed.id}`);
    expect(cancelled.status()).toBe(200);
    expect((await cancelled.json()).order.status).toBe("cancelled");
    const again = await request.delete(`/api/bank/orders/${placed.id}`);
    expect(again.status()).toBe(404);
    expect((await again.json()).code).toBe("ORDER_NOT_FOUND");
  });

  test("a sell order fills at or above its limit", async ({ request }) => {
    const { checking } = await setUp(request);
    const atoms = await buyNow(request, "BTC", 50_000, checking.id);
    const balanceAfterBuy = await balanceOf(request, checking.id);
    const price = await currentPrice(request, "BTC");

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
    const after = await orderById(request, placed.id);
    expect(after.status).toBe("filled");
    expect(after.fillPriceMicros!).toBeGreaterThanOrEqual(limit);
    expect(await balanceOf(request, checking.id)).toBeGreaterThan(
      balanceAfterBuy,
    );
  });

  test("time as an input: an order fills at a past instant where the price was lower", async ({
    request,
  }) => {
    const { checking } = await setUp(request);
    const runKey = uniqueRunKey("orders-at");
    const detail = await (
      await request.get(`/api/bank/market/BTC?range=24h&runKey=${runKey}`)
    ).json();
    const points = detail.series as { at: string; priceMicros: number }[];
    const lowest = points.reduce((a, b) =>
      b.priceMicros < a.priceMicros ? b : a,
    );

    // A limit exactly at the day's low, nowhere near the price now.
    const placed = await placeOrder(request, {
      symbol: "BTC",
      side: "buy",
      accountId: checking.id,
      spendCents: 10_000,
      limitMicros: lowest.priceMicros,
    });
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

  test("a price alert fires once, with the price it saw", async ({
    request,
  }) => {
    await setUp(request);
    const price = await currentPrice(request, "ETH");

    const armed = await request.post("/api/bank/alerts", {
      data: {
        symbol: "ETH",
        direction: "below",
        limitMicros: Math.ceil(price * 1.01),
      },
    });
    expect(armed.status(), await armed.text()).toBe(201);
    const alert = (await armed.json()).alert;
    expect(alert.status).toBe("armed");

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

  test("validation and access", async ({ request, browser }) => {
    const { checking } = await setUp(request);
    const price = await currentPrice(request, "BTC");
    const good = {
      symbol: "BTC",
      side: "buy",
      accountId: checking.id,
      spendCents: 10_000,
      limitMicros: Math.floor(price / 2),
    };
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
    const noCoin = await request.post("/api/bank/orders", {
      data: { ...good, symbol: "NOPE" },
    });
    expect(noCoin.status()).toBe(404);
    expect((await noCoin.json()).code).toBe("COIN_NOT_FOUND");
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

    const demo = await browser.newContext();
    await signIn(demo.request, DEMO.customer);
    expect(
      (await demo.request.post("/api/bank/orders", { data: good })).status(),
    ).toBe(403);
    expect((await demo.request.get("/api/bank/orders")).status()).toBe(200);
    await demo.close();

    const visitor = await browser.newContext();
    expect((await visitor.request.get("/api/bank/orders")).status()).toBe(401);
    expect((await visitor.request.get("/api/bank/alerts")).status()).toBe(401);
    await visitor.close();
  });
});
