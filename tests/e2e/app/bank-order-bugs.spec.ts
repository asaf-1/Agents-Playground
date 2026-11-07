// Playwright's test tools, with the [RESULT] block printed after every test.
import {
  expect,
  expected,
  fact,
  test,
} from "../../../framework/fixtures/resultBlock";
// Arms a planted bug for one runKey.
import { armFlags } from "../../../framework/helpers/flags";
// The bank helpers: accounts, sign up, a unique runKey.
import {
  moneyAccounts,
  signUpCustomer,
  uniqueRunKey,
} from "../../../framework/helpers/bank";

// The limit orders' planted bug, armed for one run key only. The sweep reads
// the flag from the request that triggers it, so the orders are listed with
// the run key in the query. Without the flag the same order waits, which
// api-bank-orders.spec.ts checks.

// With the bug armed, a sell order fills although the price is far below its
// limit.
test("bankSellLimitInverted: a sell order fills below the limit the customer set", async ({
  request,
}) => {
  expected(
    "with bankSellLimitInverted armed: a sell at twice the price fills, below its limit",
  );
  // Arm the bug for this runKey.
  const runKey = uniqueRunKey("sell-limit-inverted");
  await armFlags(request, runKey, { bankSellLimitInverted: true });

  // A new customer buys $500 of BTC, so there is coin to sell.
  await signUpCustomer(request, "Inverted Customer");
  const [checking] = (await moneyAccounts(request)).accounts;
  fact("checking", checking.id);
  const quote = await (
    await request.post("/api/bank/trades/quote", {
      data: { symbol: "BTC", side: "buy", spendCents: 50_000 },
    })
  ).json();
  expect(
    (
      await request.post("/api/bank/trades", {
        data: { quoteId: quote.id, accountId: checking.id },
      })
    ).status(),
  ).toBe(201);

  // The price now.
  const price = (await (await request.get("/api/bank/market/BTC")).json())
    .priceMicros as number;
  // A limit far above today's price: a sell that should wait.
  const limit = price * 2;
  fact("price", price);
  fact("limit", limit);
  const placed = await request.post("/api/bank/orders", {
    data: {
      symbol: "BTC",
      side: "sell",
      accountId: checking.id,
      quantityAtoms: quote.filledAtoms,
      limitMicros: limit,
    },
  });
  expect(placed.status()).toBe(201);
  const order = (await placed.json()).order as { id: string };
  fact("orderId", order.id);

  // Read the orders with the runKey, which runs the armed sweep.
  const list = await (
    await request.get(`/api/bank/orders?runKey=${runKey}`)
  ).json();
  const after = list.orders.find((o: { id: string }) => o.id === order.id);
  // Filled, although the price never reached the limit, and below it.
  expect(after.status).toBe("filled");
  expect(after.fillPriceMicros).toBeLessThan(limit);
});
