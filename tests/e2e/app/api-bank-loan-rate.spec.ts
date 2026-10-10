import { expect, test } from "@playwright/test";
import { balanceOf, moneyAccounts, signUpCustomer } from "./_bank";

// How a loan is priced (phase 3b).
//
// Playground Bank publishes no rate card. An APR belongs to the customer
// asking, worked out from what the bank can see of them: what they hold, how
// long they have banked here, how their earlier loans went, how much they use
// the account, and how big this ask is next to their own money.
//
// So nothing here asserts a rate. It asserts the rules the rate has to follow.

const QUERY = "amountCents=500000&termMonths=24";

async function quote(
  request: import("@playwright/test").APIRequestContext,
  query = QUERY,
) {
  const response = await request.get(`/api/bank/loans/quote?${query}`);
  expect(response.status(), await response.text()).toBe(200);
  return response.json();
}

test.describe("Playground Bank loan pricing", () => {
  test("the offer explains itself, and the reasons add up to the rate", async ({
    request,
  }) => {
    await signUpCustomer(request, "Explained Customer");
    const offered = await quote(request);

    expect(offered.rate).toBeTruthy();
    expect(
      offered.rate.termBp - offered.rate.discountBp + offered.rate.exposureBp,
    ).toBe(offered.aprBasisPoints);

    // The reasons are the customer's real standing, not placeholders.
    const [checking, savings] = (await moneyAccounts(request)).accounts;
    expect(offered.rate.balanceCents).toBe(
      checking.balanceCents + savings.balanceCents,
    );
    expect(offered.rate.score).toBeGreaterThan(0);
    expect(offered.rate.score).toBeLessThanOrEqual(1);
    expect(offered.rate.exposure).toBeGreaterThan(0);
  });

  test("two customers asking the same thing get different offers", async ({
    request,
    playwright,
    baseURL,
  }) => {
    await signUpCustomer(request, "Richer Customer");
    const other = await playwright.request.newContext({ baseURL });
    await signUpCustomer(other, "Poorer Customer");

    const mine = await quote(request);
    const theirs = await quote(other);

    // They opened with different money, so their standing differs, so the
    // offer differs. The rate card is gone.
    expect(mine.rate.balanceCents).not.toBe(theirs.rate.balanceCents);
    expect(mine.aprBasisPoints).not.toBe(theirs.aprBasisPoints);
    await other.dispose();
  });

  test("spending money makes the next offer dearer, and receiving makes it cheaper", async ({
    request,
    playwright,
    baseURL,
  }) => {
    await signUpCustomer(request, "Spending Customer");
    const [mine] = (await moneyAccounts(request)).accounts;
    const other = await playwright.request.newContext({ baseURL });
    await signUpCustomer(other, "Receiving Customer");
    const [theirs] = (await moneyAccounts(other)).accounts;

    const beforeMine = await quote(request);
    const beforeTheirs = await quote(other);

    // Move most of one balance to the other.
    const amountCents = Math.floor(mine.balanceCents * 0.8);
    const sent = await request.post("/api/bank/transfers", {
      data: {
        fromAccountId: mine.id,
        toAccountNumber: theirs.number,
        amountCents,
      },
    });
    expect(sent.status(), await sent.text()).toBe(201);
    expect(await balanceOf(request, mine.id)).toBe(
      mine.balanceCents - amountCents,
    );

    const afterMine = await quote(request);
    const afterTheirs = await quote(other);

    expect(afterMine.aprBasisPoints).toBeGreaterThan(beforeMine.aprBasisPoints);
    expect(afterTheirs.aprBasisPoints).toBeLessThan(
      beforeTheirs.aprBasisPoints,
    );
    await other.dispose();
  });

  test("buying crypto also makes the next offer dearer", async ({
    request,
  }) => {
    await signUpCustomer(request, "Trading Borrower");
    const [checking] = (await moneyAccounts(request)).accounts;
    const before = await quote(request);

    const priced = await request.post("/api/bank/trades/quote", {
      data: {
        symbol: "BTC",
        side: "buy",
        spendCents: Math.floor(checking.balanceCents * 0.8),
      },
    });
    const { id } = await priced.json();
    const filled = await request.post("/api/bank/trades", {
      data: { quoteId: id, accountId: checking.id },
    });
    expect(filled.status(), await filled.text()).toBe(201);

    // The money left the bank for coin, so the bank sees less of it.
    const after = await quote(request);
    expect(after.rate.balanceCents).toBeLessThan(before.rate.balanceCents);
    expect(after.aprBasisPoints).toBeGreaterThan(before.aprBasisPoints);
  });

  test("a bigger ask against the same money costs more", async ({
    request,
  }) => {
    await signUpCustomer(request, "Stretching Customer");
    const small = await quote(request, "amountCents=100000&termMonths=24");
    const large = await quote(request, "amountCents=100000000&termMonths=24");

    expect(large.rate.exposure).toBeGreaterThan(small.rate.exposure);
    expect(large.rate.exposureBp).toBeGreaterThan(small.rate.exposureBp);
    expect(large.aprBasisPoints).toBeGreaterThan(small.aprBasisPoints);
  });

  test("longer money costs more, for everyone", async ({ request }) => {
    await signUpCustomer(request, "Patient Customer");
    let previous = 0;
    for (const term of [12, 24, 36, 60]) {
      const offered = await quote(
        request,
        `amountCents=500000&termMonths=${term}`,
      );
      expect(offered.aprBasisPoints, `${term} months`).toBeGreaterThan(
        previous,
      );
      previous = offered.aprBasisPoints;
    }
  });

  test("the rate is fixed on the loan when it is asked for", async ({
    request,
  }) => {
    await signUpCustomer(request, "Fixing Customer");
    const [checking] = (await moneyAccounts(request)).accounts;
    const offered = await quote(request);

    const created = await request.post("/api/bank/loans", {
      data: {
        accountId: checking.id,
        amountCents: 500_000,
        termMonths: 24,
        purpose: "Car",
      },
    });
    expect(created.status(), await created.text()).toBe(201);
    const { loan } = await created.json();
    expect(loan.aprBasisPoints).toBe(offered.aprBasisPoints);

    // Spending afterwards moves the NEXT offer, never this loan.
    const spend = await request.post("/api/bank/transfers", {
      data: {
        fromAccountId: checking.id,
        toAccountNumber: (await moneyAccounts(request)).accounts[1].number,
        amountCents: Math.floor(checking.balanceCents * 0.5),
      },
    });
    expect(spend.status()).toBe(201);

    const detail = await (
      await request.get(`/api/bank/loans/${loan.id}`)
    ).json();
    expect(detail.loan.aprBasisPoints).toBe(loan.aprBasisPoints);
    expect(detail.loan.monthlyPaymentCents).toBe(loan.monthlyPaymentCents);
  });
});
