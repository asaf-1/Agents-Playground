// The type of a request context.
import { type APIRequestContext } from "@playwright/test";
// Playwright's test tools, with the [RESULT] block printed after every test.
import {
  expect,
  expected,
  fact,
  test,
} from "../../../framework/fixtures/resultBlock";
// The bank helpers: sign up, accounts, balances, deposits, GraphQL, a unique runKey.
import {
  addFunds,
  balanceOf,
  graphql,
  moneyAccounts,
  signUpCustomer,
  uniqueRunKey,
} from "../../../framework/helpers/bank";
// Arms a planted bug for one runKey.
import { armFlags } from "../../../framework/helpers/flags";

// Buying and selling coin with bank money (phase 3b).
//
// This is the join between the exchange and the bank, so most of these tests
// are about money arriving where it should: a buy really leaves the account, a
// sell really arrives, and the same trade shows in the bank's own history.
//
// Prices are personal and moving, so nothing asserts an exact price. What is
// asserted is that the numbers agree with each other.

// One whole coin, in atoms (the smallest unit).
const ATOMS = 100_000_000;

// A price offered for one trade, valid for a few seconds.
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

// Asks for a price for one trade, and checks one came back (200).
async function priceTrade(
  request: APIRequestContext,
  body: Record<string, unknown>,
  runKey?: string,
  at?: string,
): Promise<Quote> {
  fact("quote ask", body);
  const response = await request.post(
    `/api/bank/trades/quote${query(runKey, at)}`,
    { data: body },
  );
  expect(response.status(), await response.text()).toBe(200);
  return response.json();
}

// Uses a quote to make the trade from one account. It returns the answer
// without checking it, so a test can expect a refusal too.
async function fill(
  request: APIRequestContext,
  quoteId: string,
  accountId: string,
  runKey?: string,
  at?: string,
) {
  fact("fill", `quote ${quoteId} on ${accountId}`);
  return request.post(`/api/bank/trades${query(runKey, at)}`, {
    data: { quoteId, accountId },
  });
}

// The customer's coin holdings, optionally for a runKey at a pinned instant.
async function portfolio(
  request: APIRequestContext,
  runKey?: string,
  atMs?: number,
) {
  // atMs pins the test clock, which the server only honours alongside a run
  // key. Two readings taken at the same instant can be compared; two taken a
  // moment apart cannot, because the price moves.
  const params = new URLSearchParams();
  if (runKey) params.set("runKey", runKey);
  if (atMs !== undefined) params.set("at", String(atMs));
  const path = params.toString()
    ? `/api/bank/portfolio?${params}`
    : "/api/bank/portfolio";
  const response = await request.get(path);
  expect(response.status(), await response.text()).toBe(200);
  return response.json();
}

test.describe("Playground Bank trading API", () => {
  // A buy prices itself consistently, takes the money out of Checking, and
  // the coin shows in the portfolio.
  test("a buy takes money out of the account and gives back coin", async ({
    request,
  }) => {
    expected(
      "net 50000, fee = net x feeBp, gross = net - fee, atoms > 0, 15 s to expire; filled 201; Checking -50000; one BTC position at cost 50000",
    );
    // A new customer asks to buy $500 of BTC.
    await signUpCustomer(request, "Buying Customer");
    const [checking] = (await moneyAccounts(request)).accounts;
    fact("checking", checking.id);
    fact("balance", checking.balanceCents);

    const quote = await priceTrade(request, {
      symbol: "BTC",
      side: "buy",
      spendCents: 50_000,
    });
    fact("quoteId", quote.id);
    fact("fee bp", quote.feeBasisPoints);

    // The quote agrees with itself: the fee comes out of what is spent, and
    // the rest buys coin at the quoted price.
    expect(quote.netCents).toBe(50_000);
    expect(quote.feeCents).toBe(
      Math.round((quote.netCents * quote.feeBasisPoints) / 10_000),
    );
    expect(quote.grossCents).toBe(quote.netCents - quote.feeCents);
    expect(quote.filledAtoms).toBeGreaterThan(0);
    expect(quote.expiresInSeconds).toBe(15);

    // Fill it.
    const filled = await fill(request, quote.id, checking.id);
    expect(filled.status(), await filled.text()).toBe(201);
    const { trade, balanceAfterCents } = await filled.json();
    fact("tradeId", trade.id);

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

  // The buy is a line in the bank's own activity list.
  test("the buy shows in the bank's own history, not a separate one", async ({
    request,
  }) => {
    expected(
      "newest activity: crypto_buy 'Bought ETH' for -20000, balance after = start - 20000",
    );
    // A new customer buys $200 of ETH.
    await signUpCustomer(request, "History Customer");
    const [checking] = (await moneyAccounts(request)).accounts;
    fact("checking", checking.id);
    const quote = await priceTrade(request, {
      symbol: "ETH",
      side: "buy",
      spendCents: 20_000,
    });
    await fill(request, quote.id, checking.id);

    // The newest line in the activity is that buy.
    const activity = await (await request.get("/api/bank/activity")).json();
    const entry = activity.transactions[0];
    expect(entry.kind).toBe("crypto_buy");
    expect(entry.description).toBe("Bought ETH");
    expect(entry.amountCents).toBe(-20_000);
    expect(entry.balanceAfterCents).toBe(checking.balanceCents - 20_000);
  });

  // Selling half returns money, keeps half the cost on the rest, and books
  // the profit or loss.
  test("selling returns money and books the profit or loss", async ({
    request,
  }) => {
    expected(
      "sell fee = gross x feeBp, net = gross - fee; balance = start - 100000 + net; half the SOL left at cost 50000; realised matches the trade",
    );
    // A new customer buys $1,000 of SOL.
    await signUpCustomer(request, "Selling Customer");
    const [checking] = (await moneyAccounts(request)).accounts;
    fact("checking", checking.id);

    const bought = await priceTrade(request, {
      symbol: "SOL",
      side: "buy",
      spendCents: 100_000,
    });
    await fill(request, bought.id, checking.id);

    // Price a sale of half of it; the fee comes off what the sale is worth.
    const half = Math.floor(bought.filledAtoms / 2);
    fact("half", half);
    const sold = await priceTrade(request, {
      symbol: "SOL",
      side: "sell",
      quantityAtoms: half,
    });
    expect(sold.feeCents).toBe(
      Math.round((sold.grossCents * sold.feeBasisPoints) / 10_000),
    );
    expect(sold.netCents).toBe(sold.grossCents - sold.feeCents);

    // Sell it; the money arrives.
    const filled = await fill(request, sold.id, checking.id);
    expect(filled.status(), await filled.text()).toBe(201);
    const { trade, balanceAfterCents } = await filled.json();
    fact("tradeId", trade.id);

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

  // A quote can't be used after it expires, nor used twice.
  test("a price expires after fifteen seconds and cannot be used twice", async ({
    request,
  }) => {
    expected(
      "a 2020 quote 409 QUOTE_EXPIRED with no money moved; a live quote fills once, then 409 QUOTE_USED",
    );
    const runKey = uniqueRunKey("expiry");
    fact("runKey", runKey);
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

  // Two fills of one quote sent at the same moment: only one goes through.
  test("the same quote sent twice at once fills exactly once", async ({
    request,
  }) => {
    expected(
      "one 201 and one 409; Checking -40000 once; the position holds the quote's atoms once",
    );
    // A new customer prices a $400 BTC buy.
    await signUpCustomer(request, "Racing Trader");
    const [checking] = (await moneyAccounts(request)).accounts;
    fact("checking", checking.id);
    const quote = await priceTrade(request, {
      symbol: "BTC",
      side: "buy",
      spendCents: 40_000,
    });
    fact("quoteId", quote.id);

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

  // A buy bigger than the balance, and a sale of coin not held, are both refused.
  test("you cannot spend money you don't have, or sell coin you don't hold", async ({
    request,
  }) => {
    expected(
      "a buy over the balance fills 409 INSUFFICIENT_FUNDS, balance unchanged; quoting a sale of 1 BTC not held 409 INSUFFICIENT_FUNDS",
    );
    // A buy priced at a dollar more than Checking holds.
    await signUpCustomer(request, "Broke Customer");
    const [checking] = (await moneyAccounts(request)).accounts;
    fact("checking", checking.id);
    fact("balance", checking.balanceCents);

    const tooBig = await priceTrade(request, {
      symbol: "BTC",
      side: "buy",
      spendCents: checking.balanceCents + 100,
    });
    const refused = await fill(request, tooBig.id, checking.id);
    expect(refused.status()).toBe(409);
    expect((await refused.json()).code).toBe("INSUFFICIENT_FUNDS");
    expect(await balanceOf(request, checking.id)).toBe(checking.balanceCents);

    // A sale of one whole BTC the customer doesn't have.
    const selling = await request.post("/api/bank/trades/quote", {
      data: { symbol: "BTC", side: "sell", quantityAtoms: ATOMS },
    });
    expect(selling.status()).toBe(409);
    expect((await selling.json()).code).toBe("INSUFFICIENT_FUNDS");
  });

  // The fee rate drops once the customer has traded a lot.
  test("the fee falls as a customer trades more", async ({ request }) => {
    expected("first quote 30 bp; after three $20,000 buys, a lower fee rate");
    // A new customer's first trade pays the top rate.
    await signUpCustomer(request, "Frequent Customer");
    const [checking] = (await moneyAccounts(request)).accounts;
    fact("checking", checking.id);

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
    // The next quote has a lower rate.
    const later = await priceTrade(request, {
      symbol: "PLAY",
      side: "buy",
      spendCents: 1_000,
    });
    fact("later bp", later.feeBasisPoints);
    expect(later.feeBasisPoints).toBeLessThan(first.feeBasisPoints);
  });

  // A bad amount or side is refused before any price is made; an unknown coin is not found.
  test("the amount is checked before anything is priced", async ({
    request,
  }) => {
    expected(
      "400 for spend 0, -100, over the cap, 10.5, side 'sideways', sell 0 atoms; 404 for coin NOPE",
    );
    // Each bad quote request.
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

    // A coin that doesn't exist.
    const unknown = await request.post("/api/bank/trades/quote", {
      data: { symbol: "NOPE", side: "buy", spendCents: 1_000 },
    });
    expect(unknown.status()).toBe(404);
  });

  // Quoting, trading and the portfolio all need a signed-in customer.
  test("a signed-out visitor cannot trade", async ({ request }) => {
    expected("401 on quote, trade and portfolio");
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

  // A buy through GraphQL moves the same money, and REST sees the same holding.
  test("buying and selling through GraphQL moves the same money", async ({
    request,
  }) => {
    expected(
      "GraphQL quote BUY net 30000; trade leaves balance - 30000; REST portfolio shows ETH with the same quantity",
    );
    // A new customer prices a $300 ETH buy through GraphQL.
    await signUpCustomer(request, "GraphQL Trader");
    const [checking] = (await moneyAccounts(request)).accounts;
    fact("checking", checking.id);

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

    // Make the trade through GraphQL.
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

  // With the planted bug armed, a quote from years ago still fills.
  test("PLANTED BUG bankQuoteExpired: a stale price still fills", async ({
    request,
  }) => {
    expected(
      "with bankQuoteExpired armed: a 2020 quote fills 201 and Checking -10000",
    );
    // Arm the bug for this runKey, then price a buy back in 2020.
    const runKey = uniqueRunKey("stale-quote");
    await armFlags(request, runKey, { bankQuoteExpired: true });
    await signUpCustomer(request, "Stale Quote Customer");
    const [checking] = (await moneyAccounts(request)).accounts;
    fact("checking", checking.id);

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

  // With the planted bug armed, a gain on the position shows as a loss of the same size.
  test("PLANTED BUG bankProfitSign: a gain is shown as a loss", async ({
    request,
  }) => {
    expected(
      "at the same instant, the armed (bankProfitSign) unrealised result is minus the clean one, on the total and on the position",
    );
    // Arm the bug, then buy $500 of BTC.
    const runKey = uniqueRunKey("profit-sign");
    await armFlags(request, runKey, { bankProfitSign: true });
    await signUpCustomer(request, "Sign Customer");
    const [checking] = (await moneyAccounts(request)).accounts;
    fact("checking", checking.id);

    const quote = await priceTrade(request, {
      symbol: "BTC",
      side: "buy",
      spendCents: 50_000,
    });
    await fill(request, quote.id, checking.id);

    // Both readings are pinned to the same instant. A coin's price is a
    // function of time (market.priceMicrosAt), so without this the two calls
    // see different prices and the "same size, opposite sign" comparison is
    // off by a cent. On a laptop the calls are milliseconds apart and it
    // passes; against a database across the network they are far enough apart
    // that it does not. Pinning the clock needs a run key, so the clean
    // reading gets one with nothing armed.
    const cleanKey = uniqueRunKey("profit-sign-clean");
    await armFlags(request, cleanKey, {});
    const atMs = Date.now();
    fact("at", atMs);

    const clean = await portfolio(request, cleanKey, atMs);
    const armed = await portfolio(request, runKey, atMs);
    fact("clean", clean.unrealisedCents);
    fact("armed", armed.unrealisedCents);

    // Same size, opposite sign, on the position and on the total.
    expect(armed.unrealisedCents).toBe(-clean.unrealisedCents);
    expect(armed.positions[0].unrealisedCents).toBe(
      -clean.positions[0].unrealisedCents,
    );
  });

  // With the planted bug armed, a sale's total leaves the fee out.
  test("PLANTED BUG bankFeeHidden: the total leaves the fee out", async ({
    request,
  }) => {
    expected(
      "clean: fee > 0 and net = gross - fee; armed (bankFeeHidden): net = gross, more than gross - fee",
    );
    // Arm the bug, then buy $2,000 of BTC.
    const runKey = uniqueRunKey("fee-hidden");
    await armFlags(request, runKey, { bankFeeHidden: true });
    await signUpCustomer(request, "Fee Customer");
    const [checking] = (await moneyAccounts(request)).accounts;
    fact("checking", checking.id);

    const bought = await priceTrade(request, {
      symbol: "BTC",
      side: "buy",
      spendCents: 200_000,
    });
    await fill(request, bought.id, checking.id);

    // Price the sale of half of it, once clean and once with the bug armed.
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
