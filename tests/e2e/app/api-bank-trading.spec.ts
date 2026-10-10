import { expect, test, type APIRequestContext } from "@playwright/test";
import {
  addFunds,
  balanceOf,
  graphql,
  moneyAccounts,
  signUpCustomer,
  uniqueRunKey,
} from "./_bank";
import { armFlags } from "./_helpers";

// Buying and selling coin with bank money (phase 3b).
//
// This is the join between the exchange and the bank, so most of these tests
// are about money arriving where it should: a buy really leaves the account, a
// sell really arrives, and the same trade shows in the bank's own history.
//
// Prices are personal and moving, so nothing asserts an exact price. What is
// asserted is that the numbers agree with each other.

const ATOMS = 100_000_000;

interface Quote {
  id: string;
  symbol: string;
  side: "buy" | "sell";
  priceMicros: number;
  grossCents: number;
  feeCents: number;
  feeBasisPoints: number;
  netCents: number;
  filledAtoms: number;
  expiresAt: string;
  expiresInSeconds: number;
}

// runKey and at go on as separate parameters: encoding them into one string
// escapes the `&`, and the clock pin is then silently ignored.
function query(runKey?: string, at?: string): string {
  if (!runKey) {
    return "";
  }
  return `?${new URLSearchParams({ runKey, ...(at ? { at } : {}) })}`;
}

async function priceTrade(
  request: APIRequestContext,
  body: Record<string, unknown>,
  runKey?: string,
  at?: string,
): Promise<Quote> {
  const response = await request.post(
    `/api/bank/trades/quote${query(runKey, at)}`,
    { data: body },
  );
  expect(response.status(), await response.text()).toBe(200);
  return response.json();
}

async function fill(
  request: APIRequestContext,
  quoteId: string,
  accountId: string,
  runKey?: string,
  at?: string,
) {
  return request.post(`/api/bank/trades${query(runKey, at)}`, {
    data: { quoteId, accountId },
  });
}

async function portfolio(request: APIRequestContext, runKey?: string) {
  const path = runKey
    ? `/api/bank/portfolio?runKey=${encodeURIComponent(runKey)}`
    : "/api/bank/portfolio";
  const response = await request.get(path);
  expect(response.status(), await response.text()).toBe(200);
  return response.json();
}

test.describe("Playground Bank trading API", () => {
  test("a buy takes money out of the account and gives back coin", async ({
    request,
  }) => {
    await signUpCustomer(request, "Buying Customer");
    const [checking] = (await moneyAccounts(request)).accounts;

    const quote = await priceTrade(request, {
      symbol: "BTC",
      side: "buy",
      spendCents: 50_000,
    });

    // The quote agrees with itself: the fee comes out of what is spent, and
    // the rest buys coin at the quoted price.
    expect(quote.netCents).toBe(50_000);
    expect(quote.feeCents).toBe(
      Math.round((quote.netCents * quote.feeBasisPoints) / 10_000),
    );
    expect(quote.grossCents).toBe(quote.netCents - quote.feeCents);
    expect(quote.filledAtoms).toBeGreaterThan(0);
    expect(quote.expiresInSeconds).toBe(15);

    const filled = await fill(request, quote.id, checking.id);
    expect(filled.status(), await filled.text()).toBe(201);
    const { trade, balanceAfterCents } = await filled.json();

    // The money really left the account.
    expect(balanceAfterCents).toBe(checking.balanceCents - 50_000);
    expect(await balanceOf(request, checking.id)).toBe(balanceAfterCents);
    expect(trade.quantityAtoms).toBe(quote.filledAtoms);
    expect(trade.side).toBe("buy");
    expect(trade.realisedCents).toBe(0);

    // And the coin really arrived.
    const held = await portfolio(request);
    expect(held.positions).toHaveLength(1);
    expect(held.positions[0].symbol).toBe("BTC");
    expect(held.positions[0].quantityAtoms).toBe(quote.filledAtoms);
    expect(held.positions[0].costCents).toBe(50_000);
  });

  test("the buy shows in the bank's own history, not a separate one", async ({
    request,
  }) => {
    await signUpCustomer(request, "History Customer");
    const [checking] = (await moneyAccounts(request)).accounts;
    const quote = await priceTrade(request, {
      symbol: "ETH",
      side: "buy",
      spendCents: 20_000,
    });
    await fill(request, quote.id, checking.id);

    const activity = await (await request.get("/api/bank/activity")).json();
    const entry = activity.transactions[0];
    expect(entry.kind).toBe("crypto_buy");
    expect(entry.description).toBe("Bought ETH");
    expect(entry.amountCents).toBe(-20_000);
    expect(entry.balanceAfterCents).toBe(checking.balanceCents - 20_000);
  });

  test("selling returns money and books the profit or loss", async ({
    request,
  }) => {
    await signUpCustomer(request, "Selling Customer");
    const [checking] = (await moneyAccounts(request)).accounts;

    const bought = await priceTrade(request, {
      symbol: "SOL",
      side: "buy",
      spendCents: 100_000,
    });
    await fill(request, bought.id, checking.id);

    const half = Math.floor(bought.filledAtoms / 2);
    const sold = await priceTrade(request, {
      symbol: "SOL",
      side: "sell",
      quantityAtoms: half,
    });
    expect(sold.feeCents).toBe(
      Math.round((sold.grossCents * sold.feeBasisPoints) / 10_000),
    );
    expect(sold.netCents).toBe(sold.grossCents - sold.feeCents);

    const filled = await fill(request, sold.id, checking.id);
    expect(filled.status(), await filled.text()).toBe(201);
    const { trade, balanceAfterCents } = await filled.json();

    expect(balanceAfterCents).toBe(
      checking.balanceCents - 100_000 + sold.netCents,
    );
    expect(trade.side).toBe("sell");

    // Half the coin is left, and half the cost went with the half sold.
    const held = await portfolio(request);
    expect(held.positions[0].quantityAtoms).toBe(bought.filledAtoms - half);
    expect(held.positions[0].costCents).toBe(100_000 - 50_000);

    // Selling booked a realised result, and the portfolio agrees with it.
    expect(held.realisedCents).toBe(trade.realisedCents);
  });

  test("a price expires after fifteen seconds and cannot be used twice", async ({
    request,
  }) => {
    const runKey = uniqueRunKey("expiry");
    await signUpCustomer(request, "Expiry Customer");
    const [checking] = (await moneyAccounts(request)).accounts;

    // Priced at an instant long past, so it is already expired when used. The
    // clock pin only works for a caller with its own runKey.
    const stale = await priceTrade(
      request,
      { symbol: "BTC", side: "buy", spendCents: 10_000 },
      runKey,
      "2020-01-01T00:00:00.000Z",
    );
    expect(new Date(stale.expiresAt).getUTCFullYear()).toBe(2020);
    const refused = await fill(request, stale.id, checking.id, runKey);
    expect(refused.status()).toBe(409);
    expect((await refused.json()).code).toBe("QUOTE_EXPIRED");
    // Nothing moved.
    expect(await balanceOf(request, checking.id)).toBe(checking.balanceCents);

    // A live quote works once, and only once.
    const live = await priceTrade(request, {
      symbol: "BTC",
      side: "buy",
      spendCents: 10_000,
    });
    expect((await fill(request, live.id, checking.id)).status()).toBe(201);
    const again = await fill(request, live.id, checking.id);
    expect(again.status()).toBe(409);
    expect((await again.json()).code).toBe("QUOTE_USED");
  });

  test("the same quote sent twice at once fills exactly once", async ({
    request,
  }) => {
    await signUpCustomer(request, "Racing Trader");
    const [checking] = (await moneyAccounts(request)).accounts;
    const quote = await priceTrade(request, {
      symbol: "BTC",
      side: "buy",
      spendCents: 40_000,
    });

    // A quote is claimed in one statement, not read and then marked used, so
    // two fills arriving together cannot both go through.
    const both = await Promise.all([
      fill(request, quote.id, checking.id),
      fill(request, quote.id, checking.id),
    ]);
    const statuses = both.map((response) => response.status()).sort();
    expect(statuses).toEqual([201, 409]);

    // Charged once, and the coin arrived once.
    expect(await balanceOf(request, checking.id)).toBe(
      checking.balanceCents - 40_000,
    );
    const portfolio = await (await request.get("/api/bank/portfolio")).json();
    expect(portfolio.positions[0].quantityAtoms).toBe(quote.filledAtoms);
  });

  test("you cannot spend money you don't have, or sell coin you don't hold", async ({
    request,
  }) => {
    await signUpCustomer(request, "Broke Customer");
    const [checking] = (await moneyAccounts(request)).accounts;

    const tooBig = await priceTrade(request, {
      symbol: "BTC",
      side: "buy",
      spendCents: checking.balanceCents + 100,
    });
    const refused = await fill(request, tooBig.id, checking.id);
    expect(refused.status()).toBe(409);
    expect((await refused.json()).code).toBe("INSUFFICIENT_FUNDS");
    expect(await balanceOf(request, checking.id)).toBe(checking.balanceCents);

    const selling = await request.post("/api/bank/trades/quote", {
      data: { symbol: "BTC", side: "sell", quantityAtoms: ATOMS },
    });
    expect(selling.status()).toBe(409);
    expect((await selling.json()).code).toBe("INSUFFICIENT_FUNDS");
  });

  test("the fee falls as a customer trades more", async ({ request }) => {
    await signUpCustomer(request, "Frequent Customer");
    const [checking] = (await moneyAccounts(request)).accounts;

    const first = await priceTrade(request, {
      symbol: "PLAY",
      side: "buy",
      spendCents: 1_000,
    });
    // A customer who has never traded pays the top rate.
    expect(first.feeBasisPoints).toBe(30);
    await fill(request, first.id, checking.id);

    // Trade a lot, then ask again. The account is topped up first: a customer
    // opens with their own amounts, so what Checking holds is not something
    // this test can assume.
    await addFunds(request, checking.id, 10_000_000);
    for (let i = 0; i < 3; i += 1) {
      const more = await priceTrade(request, {
        symbol: "PLAY",
        side: "buy",
        spendCents: 2_000_000,
      });
      const done = await fill(request, more.id, checking.id);
      expect(done.status(), await done.text()).toBe(201);
    }
    const later = await priceTrade(request, {
      symbol: "PLAY",
      side: "buy",
      spendCents: 1_000,
    });
    expect(later.feeBasisPoints).toBeLessThan(first.feeBasisPoints);
  });

  test("the amount is checked before anything is priced", async ({
    request,
  }) => {
    await signUpCustomer(request, "Careful Trader");
    for (const body of [
      { symbol: "BTC", side: "buy", spendCents: 0 },
      { symbol: "BTC", side: "buy", spendCents: -100 },
      { symbol: "BTC", side: "buy", spendCents: 100_000_001 },
      { symbol: "BTC", side: "buy", spendCents: 10.5 },
      { symbol: "BTC", side: "sideways", spendCents: 1_000 },
      { symbol: "BTC", side: "sell", quantityAtoms: 0 },
    ]) {
      const response = await request.post("/api/bank/trades/quote", {
        data: body,
      });
      expect(response.status(), JSON.stringify(body)).toBe(400);
    }

    const unknown = await request.post("/api/bank/trades/quote", {
      data: { symbol: "NOPE", side: "buy", spendCents: 1_000 },
    });
    expect(unknown.status()).toBe(404);
  });

  test("a signed-out visitor cannot trade", async ({ request }) => {
    for (const path of [
      "/api/bank/trades/quote",
      "/api/bank/trades",
      "/api/bank/portfolio",
    ]) {
      const response =
        path === "/api/bank/portfolio"
          ? await request.get(path)
          : await request.post(path, { data: {} });
      expect(response.status(), path).toBe(401);
    }
  });

  test("buying and selling through GraphQL moves the same money", async ({
    request,
  }) => {
    await signUpCustomer(request, "GraphQL Trader");
    const [checking] = (await moneyAccounts(request)).accounts;

    const quoted = await graphql<{
      quoteTrade: { id: string; side: string; netCents: number };
    }>(
      request,
      `
        mutation {
          quoteTrade(symbol: "ETH", side: BUY, spendCents: 30000) {
            id
            side
            netCents
            feeBasisPoints
            filledAtoms
          }
        }
      `,
    );
    expect(quoted.data?.quoteTrade.side).toBe("BUY");
    expect(quoted.data?.quoteTrade.netCents).toBe(30_000);

    const done = await graphql<{
      trade: {
        trade: { side: string; quantity: string };
        balanceAfterCents: number;
      };
    }>(
      request,
      `
        mutation Fill($q: ID!, $a: ID!) {
          trade(quoteId: $q, accountId: $a) {
            trade {
              symbol
              side
              quantity
              netCents
            }
            balanceAfterCents
          }
        }
      `,
      { q: quoted.data!.quoteTrade.id, a: checking.id },
    );
    expect(done.data?.trade.balanceAfterCents).toBe(
      checking.balanceCents - 30_000,
    );

    // REST sees exactly the same holding.
    const held = await portfolio(request);
    expect(held.positions[0].symbol).toBe("ETH");
    expect(held.positions[0].quantity).toBe(done.data!.trade.trade.quantity);
  });

  test("PLANTED BUG bankQuoteExpired: a stale price still fills", async ({
    request,
  }) => {
    const runKey = uniqueRunKey("stale-quote");
    await armFlags(request, runKey, { bankQuoteExpired: true });
    await signUpCustomer(request, "Stale Quote Customer");
    const [checking] = (await moneyAccounts(request)).accounts;

    const stale = await priceTrade(
      request,
      { symbol: "BTC", side: "buy", spendCents: 10_000 },
      runKey,
      "2020-01-01T00:00:00.000Z",
    );
    expect(new Date(stale.expiresAt).getUTCFullYear()).toBe(2020);
    // Filled on the live clock: years after that price stopped being offered.
    const filled = await fill(request, stale.id, checking.id, runKey);
    expect(filled.status(), await filled.text()).toBe(201);
    // It went through at a price from years ago.
    expect(await balanceOf(request, checking.id)).toBe(
      checking.balanceCents - 10_000,
    );
  });

  test("PLANTED BUG bankProfitSign: a gain is shown as a loss", async ({
    request,
  }) => {
    const runKey = uniqueRunKey("profit-sign");
    await armFlags(request, runKey, { bankProfitSign: true });
    await signUpCustomer(request, "Sign Customer");
    const [checking] = (await moneyAccounts(request)).accounts;

    const quote = await priceTrade(request, {
      symbol: "BTC",
      side: "buy",
      spendCents: 50_000,
    });
    await fill(request, quote.id, checking.id);

    const clean = await portfolio(request);
    const armed = await portfolio(request, runKey);

    // Same size, opposite sign, on the position and on the total.
    expect(armed.unrealisedCents).toBe(-clean.unrealisedCents);
    expect(armed.positions[0].unrealisedCents).toBe(
      -clean.positions[0].unrealisedCents,
    );
  });

  test("PLANTED BUG bankFeeHidden: the total leaves the fee out", async ({
    request,
  }) => {
    const runKey = uniqueRunKey("fee-hidden");
    await armFlags(request, runKey, { bankFeeHidden: true });
    await signUpCustomer(request, "Fee Customer");
    const [checking] = (await moneyAccounts(request)).accounts;

    const bought = await priceTrade(request, {
      symbol: "BTC",
      side: "buy",
      spendCents: 200_000,
    });
    await fill(request, bought.id, checking.id);

    const clean = await priceTrade(request, {
      symbol: "BTC",
      side: "sell",
      quantityAtoms: Math.floor(bought.filledAtoms / 2),
    });
    const armed = await priceTrade(
      request,
      {
        symbol: "BTC",
        side: "sell",
        quantityAtoms: Math.floor(bought.filledAtoms / 2),
      },
      runKey,
    );

    expect(clean.feeCents).toBeGreaterThan(0);
    // Clean: the total is the value minus the fee. Armed: the fee is left out,
    // so the customer is told they will get more than they really will.
    expect(clean.netCents).toBe(clean.grossCents - clean.feeCents);
    expect(armed.netCents).toBe(armed.grossCents);
    expect(armed.netCents).toBeGreaterThan(armed.grossCents - armed.feeCents);
  });
});
