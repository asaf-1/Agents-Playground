import { expect, test, type APIRequestContext } from "@playwright/test";
import { graphql, signUpCustomer, uniqueRunKey } from "./_bank";
import { armFlags } from "./_helpers";

// Wallets: sending coin to another customer, and swapping one coin for another
// (phase 3c). Neither touches a bank account -- this is coin moving between
// holdings.
//
// The address carries a checksum, so a mistyped one is catchable. That check is
// the point of the phase, and the planted bug removes it.

interface Wallet {
  symbol: string;
  name: string;
  address: string;
}

async function seed(request: APIRequestContext, name: string, symbol = "BTC") {
  await signUpCustomer(request, name);
  const accounts = await (await request.get("/api/bank/accounts")).json();
  const accountId = accounts.accounts[0].id;
  const quote = await (
    await request.post("/api/bank/trades/quote", {
      data: { symbol, side: "buy", spendCents: 500_000 },
    })
  ).json();
  const filled = await request.post("/api/bank/trades", {
    data: { quoteId: quote.id, accountId },
  });
  expect(filled.status(), await filled.text()).toBe(201);
  return { accountId };
}

async function wallets(request: APIRequestContext): Promise<Wallet[]> {
  const response = await request.get("/api/bank/wallet");
  expect(response.status(), await response.text()).toBe(200);
  return (await response.json()).wallets;
}

async function addressOf(request: APIRequestContext, symbol: string) {
  const all = await wallets(request);
  return all.find((entry) => entry.symbol === symbol)!.address;
}

async function held(request: APIRequestContext, symbol: string) {
  const portfolio = await (await request.get("/api/bank/portfolio")).json();
  const position = portfolio.positions.find(
    (entry: { symbol: string }) => entry.symbol === symbol,
  );
  return position ? position.quantityAtoms : 0;
}

test.describe("Playground Bank wallet API", () => {
  test("every coin gets an address, and it checks out", async ({ request }) => {
    await signUpCustomer(request, "Address Customer");
    const all = await wallets(request);

    expect(all).toHaveLength(8);
    for (const entry of all) {
      // pbx1 + the coin + ten characters + a three-character checksum.
      expect(entry.address).toMatch(
        new RegExp(`^pbx1${entry.symbol.toLowerCase()}[0-9A-HJKMNP-TV-Z]{13}$`),
      );
    }
    // Addresses are stable: asking twice gives the same ones.
    const again = await wallets(request);
    expect(again).toEqual(all);
  });

  test("two customers never share an address", async ({
    request,
    playwright,
    baseURL,
  }) => {
    await signUpCustomer(request, "Mine Customer");
    const other = await playwright.request.newContext({ baseURL });
    await signUpCustomer(other, "Theirs Customer");

    const mine = await wallets(request);
    const theirs = await wallets(other);
    for (let i = 0; i < mine.length; i += 1) {
      expect(mine[i].address).not.toBe(theirs[i].address);
    }
    await other.dispose();
  });

  test("sending moves coin from one customer to another, minus a fee", async ({
    request,
    playwright,
    baseURL,
  }) => {
    await seed(request, "Sender Customer");
    const other = await playwright.request.newContext({ baseURL });
    await signUpCustomer(other, "Receiver Customer");

    const theirAddress = await addressOf(other, "BTC");
    const beforeMine = await held(request, "BTC");
    const beforeTheirs = await held(other, "BTC");

    const preview = await (
      await request.post("/api/bank/wallet/send/preview", {
        data: { symbol: "BTC", quantity: "0.001" },
      })
    ).json();
    expect(preview.quantityAtoms).toBe(100_000);
    expect(preview.feeAtoms).toBeGreaterThan(0);
    expect(preview.totalAtoms).toBe(preview.quantityAtoms + preview.feeAtoms);

    const sent = await request.post("/api/bank/wallet/send", {
      data: {
        symbol: "BTC",
        toAddress: theirAddress,
        quantity: "0.001",
        memo: "here you go",
      },
    });
    expect(sent.status(), await sent.text()).toBe(201);
    const body = await sent.json();
    expect(body.delivered).toBe(true);
    expect(body.quantityAtoms).toBe(100_000);

    // The recipient gets the amount; the sender pays the amount AND the fee.
    expect(await held(other, "BTC")).toBe(beforeTheirs + 100_000);
    expect(await held(request, "BTC")).toBe(
      beforeMine - 100_000 - body.feeAtoms,
    );
    await other.dispose();
  });

  test("a mistyped address is refused before anything moves", async ({
    request,
    playwright,
    baseURL,
  }) => {
    await seed(request, "Careful Sender");
    const other = await playwright.request.newContext({ baseURL });
    await signUpCustomer(other, "Careful Receiver");
    const good = await addressOf(other, "BTC");
    const before = await held(request, "BTC");

    // One character different, so the checksum no longer matches.
    const typo =
      good.slice(0, -4) + (good.at(-4) === "X" ? "Y" : "X") + good.slice(-3);

    const refused = await request.post("/api/bank/wallet/send", {
      data: { symbol: "BTC", toAddress: typo, quantity: "0.001" },
    });
    expect(refused.status()).toBe(400);
    expect((await refused.json()).errors.toAddress).toContain("check");
    expect(await held(request, "BTC")).toBe(before);
    await other.dispose();
  });

  test("the wrong coin's address, and your own, are both refused", async ({
    request,
  }) => {
    await seed(request, "Mistaken Sender");
    const mineBtc = await addressOf(request, "BTC");
    const mineEth = await addressOf(request, "ETH");

    const ownAddress = await request.post("/api/bank/wallet/send", {
      data: { symbol: "BTC", toAddress: mineBtc, quantity: "0.001" },
    });
    expect(ownAddress.status()).toBe(400);
    expect((await ownAddress.json()).errors.toAddress).toContain("your own");

    const wrongCoin = await request.post("/api/bank/wallet/send", {
      data: { symbol: "BTC", toAddress: mineEth, quantity: "0.001" },
    });
    expect(wrongCoin.status()).toBe(400);
    expect((await wrongCoin.json()).errors.toAddress).toContain("ETH address");
  });

  test("you cannot send more coin than you hold", async ({
    request,
    playwright,
    baseURL,
  }) => {
    await seed(request, "Overreaching Sender");
    const other = await playwright.request.newContext({ baseURL });
    await signUpCustomer(other, "Waiting Receiver");
    const theirs = await addressOf(other, "BTC");

    const refused = await request.post("/api/bank/wallet/send", {
      data: { symbol: "BTC", toAddress: theirs, quantity: "99" },
    });
    expect(refused.status()).toBe(409);
    expect((await refused.json()).code).toBe("INSUFFICIENT_FUNDS");
    await other.dispose();
  });

  test("an amount is read digit by digit, not through a float", async ({
    request,
  }) => {
    await seed(request, "Exact Customer");
    // 0.29 is the classic: parsed as a float and multiplied it comes out at
    // 28999999.999999996, one atom short of what was typed.
    for (const [typed, atoms] of [
      ["0.29", 29_000_000],
      ["1.15", 115_000_000],
      ["0.1", 10_000_000],
      ["0.00000001", 1],
    ] as const) {
      const preview = await (
        await request.post("/api/bank/wallet/send/preview", {
          data: { symbol: "BTC", quantity: typed },
        })
      ).json();
      expect(preview.quantityAtoms, typed).toBe(atoms);
    }

    for (const bad of ["", ".", "abc", "-1", "0.123456789", "1,5"]) {
      const response = await request.post("/api/bank/wallet/send/preview", {
        data: { symbol: "BTC", quantity: bad },
      });
      expect(response.status(), JSON.stringify(bad)).toBe(400);
    }
  });

  test("swapping turns one coin into another and keeps the cost", async ({
    request,
  }) => {
    await seed(request, "Swapping Customer");
    const beforeBtc = await held(request, "BTC");

    const preview = await (
      await request.post("/api/bank/wallet/swap/preview", {
        data: { fromSymbol: "BTC", toSymbol: "ETH", quantity: "0.001" },
      })
    ).json();
    expect(preview.toAtoms).toBeGreaterThan(0);
    expect(preview.feeCents).toBe(
      Math.round((preview.valueCents * preview.feeBasisPoints) / 10_000),
    );

    const done = await request.post("/api/bank/wallet/swap", {
      data: { fromSymbol: "BTC", toSymbol: "ETH", quantity: "0.001" },
    });
    expect(done.status(), await done.text()).toBe(201);
    const swap = await done.json();

    expect(await held(request, "BTC")).toBe(beforeBtc - 100_000);
    expect(await held(request, "ETH")).toBe(swap.toAtoms);

    // No bank money moved: a swap is coin for coin.
    const activity = await (await request.get("/api/bank/activity")).json();
    expect(activity.transactions[0].kind).toBe("crypto_buy");
  });

  test("swapping a coin into itself is refused", async ({ request }) => {
    await seed(request, "Circular Customer");
    const refused = await request.post("/api/bank/wallet/swap", {
      data: { fromSymbol: "BTC", toSymbol: "BTC", quantity: "0.001" },
    });
    expect(refused.status()).toBe(400);
    expect((await refused.json()).errors.toSymbol).toContain("different");
  });

  test("sends and swaps show up in the wallet's history", async ({
    request,
    playwright,
    baseURL,
  }) => {
    await seed(request, "Historied Customer");
    const other = await playwright.request.newContext({ baseURL });
    await signUpCustomer(other, "Historied Receiver");

    await request.post("/api/bank/wallet/send", {
      data: {
        symbol: "BTC",
        toAddress: await addressOf(other, "BTC"),
        quantity: "0.0005",
      },
    });
    await request.post("/api/bank/wallet/swap", {
      data: { fromSymbol: "BTC", toSymbol: "SOL", quantity: "0.0005" },
    });

    const mine = await (await request.get("/api/bank/wallet")).json();
    expect(mine.sends).toHaveLength(1);
    expect(mine.sends[0].direction).toBe("out");
    expect(mine.swaps).toHaveLength(1);
    expect(mine.swaps[0].toSymbol).toBe("SOL");

    // The other side sees the same send, the other way round.
    const theirs = await (await other.get("/api/bank/wallet")).json();
    expect(theirs.sends).toHaveLength(1);
    expect(theirs.sends[0].direction).toBe("in");
    await other.dispose();
  });

  test("a signed-out visitor has no wallet", async ({ request }) => {
    for (const [path, method] of [
      ["/api/bank/wallet", "GET"],
      ["/api/bank/wallet/send", "POST"],
      ["/api/bank/wallet/swap", "POST"],
    ] as const) {
      const response =
        method === "GET"
          ? await request.get(path)
          : await request.post(path, { data: {} });
      expect(response.status(), path).toBe(401);
    }
  });

  test("GraphQL sends and swaps the same way", async ({
    request,
    playwright,
    baseURL,
  }) => {
    await seed(request, "GraphQL Sender");
    const other = await playwright.request.newContext({ baseURL });
    await signUpCustomer(other, "GraphQL Receiver");
    const theirs = await addressOf(other, "BTC");

    const sent = await graphql<{
      sendCoin: { delivered: boolean; quantity: string };
    }>(
      request,
      `
        mutation Send($a: String!) {
          sendCoin(
            symbol: "BTC"
            toAddress: $a
            quantity: "0.001"
            memo: "gql"
          ) {
            quantity
            delivered
            feeAtoms
          }
        }
      `,
      { a: theirs },
    );
    expect(sent.data?.sendCoin.delivered).toBe(true);
    expect(sent.data?.sendCoin.quantity).toBe("0.001");

    // A bad address is a readable error, not a server error.
    const bad = await graphql(
      request,
      `
        mutation {
          sendCoin(
            symbol: "BTC"
            toAddress: "pbx1btcZZZZZZZZZZZZZ"
            quantity: "0.001"
          ) {
            id
          }
        }
      `,
    );
    expect(bad.errors?.[0].extensions?.code).toBe("VALIDATION_FAILED");

    const swapped = await graphql<{ swapCoin: { toSymbol: string } }>(
      request,
      `
        mutation {
          swapCoin(fromSymbol: "BTC", toSymbol: "ETH", quantity: "0.0005") {
            fromQuantity
            toQuantity
            toSymbol
          }
        }
      `,
    );
    expect(swapped.data?.swapCoin.toSymbol).toBe("ETH");

    // REST sees both.
    const mine = await (await request.get("/api/bank/wallet")).json();
    expect(mine.sends).toHaveLength(1);
    expect(mine.swaps).toHaveLength(1);
    await other.dispose();
  });

  test("PLANTED BUG bankBadAddress: a mistyped address is accepted and the coin is lost", async ({
    request,
  }) => {
    const runKey = uniqueRunKey("bad-address");
    await armFlags(request, runKey, { bankBadAddress: true });
    await seed(request, "Losing Customer");
    const before = await held(request, "BTC");

    const nowhere = "pbx1btcZZZZZZZZZZZZZ";
    const sent = await request.post(`/api/bank/wallet/send?runKey=${runKey}`, {
      data: { symbol: "BTC", toAddress: nowhere, quantity: "0.001" },
    });
    expect(sent.status(), await sent.text()).toBe(201);
    const body = await sent.json();

    // It went through, nobody received it, and the sender is out of pocket.
    expect(body.delivered).toBe(false);
    expect(await held(request, "BTC")).toBe(before - 100_000 - body.feeAtoms);
  });

  test("PLANTED BUG bankCryptoFloat: a typed amount loses its last atom", async ({
    request,
  }) => {
    const runKey = uniqueRunKey("float-amount");
    await armFlags(request, runKey, { bankCryptoFloat: true });
    await seed(request, "Floating Customer");

    for (const [typed, exact, buggy] of [
      ["0.29", 29_000_000, 28_999_999],
      ["1.15", 115_000_000, 114_999_999],
    ] as const) {
      const clean = await (
        await request.post("/api/bank/wallet/send/preview", {
          data: { symbol: "BTC", quantity: typed },
        })
      ).json();
      expect(clean.quantityAtoms, typed).toBe(exact);

      const armed = await (
        await request.post(`/api/bank/wallet/send/preview?runKey=${runKey}`, {
          data: { symbol: "BTC", quantity: typed },
        })
      ).json();
      expect(armed.quantityAtoms, typed).toBe(buggy);
    }
  });
});
