import { expect, test, type APIRequestContext } from "@playwright/test";
import { graphql, uniqueRunKey } from "./_bank";
import { armFlags } from "./_helpers";

// The crypto exchange's market (phase 3a): GET /api/bank/market and
// /api/bank/market/:symbol.
//
// The market is deliberately NOT a fixed price list. A price belongs to one
// viewer at one instant, so these tests never assert an exact number out of
// thin air. They assert the properties that must hold: every viewer gets their
// own prices, the same viewer at the same instant always gets the same price
// (which is what makes a live market testable at all), and the numbers are
// internally consistent.
//
// `at` pins the instant, and only works for a caller that brought its own
// runKey, so a real visitor is always on the live clock.

const SYMBOLS = ["BTC", "ETH", "SOL", "ADA", "AVAX", "LINK", "DOT", "PLAY"];

interface MarketCoin {
  symbol: string;
  name: string;
  priceMicros: number;
  changeMicros: number;
  changeBasisPoints: number;
  at: string;
  spark: number[];
}

interface CoinDetail extends MarketCoin {
  range: string;
  rangeChangeMicros: number;
  rangeChangeBasisPoints: number;
  highMicros: number;
  lowMicros: number;
  series: { at: string; priceMicros: number }[];
}

async function market(
  request: APIRequestContext,
  runKey: string,
  at?: string,
): Promise<{ coins: MarketCoin[]; total: number; at: string }> {
  const query = new URLSearchParams({ runKey, ...(at ? { at } : {}) });
  const response = await request.get(`/api/bank/market?${query}`);
  expect(response.status(), await response.text()).toBe(200);
  return response.json();
}

async function coin(
  request: APIRequestContext,
  symbol: string,
  runKey: string,
  options: { range?: string; at?: string } = {},
): Promise<CoinDetail> {
  const query = new URLSearchParams({
    runKey,
    ...(options.range ? { range: options.range } : {}),
    ...(options.at ? { at: options.at } : {}),
  });
  const response = await request.get(
    `/api/bank/market/${symbol}?${query.toString()}`,
  );
  expect(response.status(), await response.text()).toBe(200);
  return response.json();
}

test.describe("Playground Bank market API", () => {
  test("the market lists every coin, open to a visitor who is not signed in", async ({
    request,
  }) => {
    const body = await market(request, uniqueRunKey("market-list"));

    expect(body.total).toBe(SYMBOLS.length);
    expect(body.coins.map((entry) => entry.symbol)).toEqual(SYMBOLS);
    expect(new Date(body.at).getTime()).toBeGreaterThan(0);

    for (const entry of body.coins) {
      expect(entry.name.length).toBeGreaterThan(0);
      // A price is a whole number of micro-dollars and never reaches zero.
      expect(Number.isInteger(entry.priceMicros)).toBe(true);
      expect(entry.priceMicros).toBeGreaterThan(0);
      expect(Number.isInteger(entry.changeBasisPoints)).toBe(true);
      expect(entry.spark).toHaveLength(24);
      expect(entry.spark.every((price) => Number.isInteger(price))).toBe(true);
    }
  });

  test("two viewers get different prices for the same coin at the same instant", async ({
    request,
  }) => {
    const at = "2026-10-10T12:00:00.000Z";
    const first = await market(request, uniqueRunKey("market-a"), at);
    const second = await market(request, uniqueRunKey("market-b"), at);

    // Nobody shares a price line. One coin could coincide; all eight could not.
    const shared = first.coins.filter(
      (entry, index) => entry.priceMicros === second.coins[index].priceMicros,
    );
    expect(shared).toHaveLength(0);
  });

  test("one viewer at one pinned instant always gets the same price", async ({
    request,
  }) => {
    const runKey = uniqueRunKey("market-stable");
    const at = "2026-10-10T12:00:00.000Z";

    const first = await market(request, runKey, at);
    const second = await market(request, runKey, at);

    expect(second.coins).toEqual(first.coins);
    expect(second.at).toBe(at);
  });

  test("the price moves on its own as the instant moves", async ({
    request,
  }) => {
    const runKey = uniqueRunKey("market-moves");
    const before = await market(request, runKey, "2026-10-10T12:00:00.000Z");
    const after = await market(request, runKey, "2026-10-10T12:05:00.000Z");

    const moved = before.coins.filter(
      (entry, index) => entry.priceMicros !== after.coins[index].priceMicros,
    );
    expect(moved).toHaveLength(SYMBOLS.length);
  });

  test("a visitor on the live clock cannot pin the instant", async ({
    request,
  }) => {
    // No runKey, so this is an ordinary visitor: `at` must be ignored and the
    // answer must be stamped now, not in 2026.
    const response = await request.get(
      "/api/bank/market?at=2020-01-01T00:00:00.000Z",
    );
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(new Date(body.at).getUTCFullYear()).toBeGreaterThan(2020);
  });

  test("a coin page answers with a chart, and its high and low bound the series", async ({
    request,
  }) => {
    const runKey = uniqueRunKey("coin-detail");
    const detail = await coin(request, "BTC", runKey, {
      at: "2026-10-10T12:00:00.000Z",
    });

    expect(detail.symbol).toBe("BTC");
    expect(detail.name).toBe("Bitcoin");
    expect(detail.range).toBe("24h");
    expect(detail.series.length).toBeGreaterThan(1);

    const prices = detail.series.map((point) => point.priceMicros);
    expect(detail.highMicros).toBe(Math.max(...prices));
    expect(detail.lowMicros).toBe(Math.min(...prices));
    expect(detail.highMicros).toBeGreaterThanOrEqual(detail.lowMicros);

    // The series runs oldest to newest and ends at the instant asked for.
    const times = detail.series.map((point) => new Date(point.at).getTime());
    expect([...times].sort((a, b) => a - b)).toEqual(times);
    expect(detail.series.at(-1)?.at).toBe("2026-10-10T12:00:00.000Z");
  });

  test("each range draws its own window", async ({ request }) => {
    const runKey = uniqueRunKey("coin-ranges");
    const at = "2026-10-10T12:00:00.000Z";

    const hour = await coin(request, "BTC", runKey, { range: "1h", at });
    const month = await coin(request, "BTC", runKey, { range: "30d", at });

    expect(hour.range).toBe("1h");
    expect(month.range).toBe("30d");
    expect(hour.series).toHaveLength(60);
    expect(month.series).toHaveLength(90);

    // Both windows end on the same price: it is the same line, read back
    // different distances.
    expect(hour.priceMicros).toBe(month.priceMicros);

    // A month reaches further, so it cannot be a narrower band than an hour.
    const hourBand = hour.highMicros - hour.lowMicros;
    const monthBand = month.highMicros - month.lowMicros;
    expect(monthBand).toBeGreaterThan(hourBand);
  });

  test("the symbol is not case sensitive", async ({ request }) => {
    const runKey = uniqueRunKey("coin-case");
    const at = "2026-10-10T12:00:00.000Z";
    const lower = await coin(request, "btc", runKey, { at });
    const upper = await coin(request, "BTC", runKey, { at });
    expect(lower.symbol).toBe("BTC");
    expect(lower.priceMicros).toBe(upper.priceMicros);
  });

  test("an unknown coin is 404 and a bad range is 400", async ({ request }) => {
    const missing = await request.get("/api/bank/market/NOPE");
    expect(missing.status()).toBe(404);
    expect((await missing.json()).code).toBe("NOT_FOUND");

    const badRange = await request.get("/api/bank/market/BTC?range=99y");
    expect(badRange.status()).toBe(400);
    const body = await badRange.json();
    expect(body.code).toBe("VALIDATION");
    expect(body.errors.range).toContain("1h");
  });

  test("GraphQL and REST answer with the same price at the same instant", async ({
    request,
  }) => {
    const runKey = uniqueRunKey("market-parity");
    const at = "2026-10-10T12:00:00.000Z";

    const rest = await coin(request, "BTC", runKey, { range: "7d", at });
    // Posted directly rather than through the shared graphql() helper: that
    // helper encodes the runKey, which would escape the `at` pin away.
    const query = new URLSearchParams({ runKey, at });
    const response = await request.post(`/api/bank/graphql?${query}`, {
      data: {
        query: `{
          coin(symbol: "BTC", range: D7) {
            symbol
            name
            priceMicros
            changeBasisPoints
            range
            highMicros
            lowMicros
            series { at priceMicros }
          }
        }`,
      },
    });
    expect(response.status(), await response.text()).toBe(200);
    const answer = (await response.json()) as { data?: { coin: CoinDetail } };

    const viaGraphql = answer.data?.coin;
    expect(viaGraphql?.priceMicros).toBe(rest.priceMicros);
    expect(viaGraphql?.highMicros).toBe(rest.highMicros);
    expect(viaGraphql?.lowMicros).toBe(rest.lowMicros);
    expect(viaGraphql?.series).toEqual(rest.series);
    // The REST range reads "7d"; GraphQL spells the same window as an enum.
    expect(viaGraphql?.range).toBe("D7");
  });

  test("a price stays an exact integer past the 32-bit ceiling", async ({
    request,
  }) => {
    // One bitcoin at $67,420 is 67,420,000,000 micros, far past the 2,147,483,647
    // a 32-bit Int stops at. This is why prices use the Micros scalar, not Int.
    const answer = await graphql<{ market: MarketCoin[] }>(
      request,
      "{ market { symbol priceMicros } }",
      undefined,
      uniqueRunKey("market-big"),
    );
    const btc = answer.data?.market.find((entry) => entry.symbol === "BTC");
    expect(btc?.priceMicros).toBeGreaterThan(2_147_483_647);
    expect(Number.isSafeInteger(btc?.priceMicros)).toBe(true);
  });

  test("PLANTED BUG bankCryptoPriceType: the price comes back as a string", async ({
    request,
  }) => {
    const runKey = uniqueRunKey("market-type-bug");
    const clean = await market(request, uniqueRunKey("market-type-clean"));
    expect(typeof clean.coins[0].priceMicros).toBe("number");

    await armFlags(request, runKey, { bankCryptoPriceType: true });

    const armed = await market(request, runKey);
    expect(typeof armed.coins[0].priceMicros).toBe("string");

    const detail = await coin(request, "BTC", runKey);
    expect(typeof detail.priceMicros).toBe("string");

    // The bug is armed for this runKey only; everybody else is unaffected.
    const other = await market(request, uniqueRunKey("market-type-other"));
    expect(typeof other.coins[0].priceMicros).toBe("number");
  });
});
