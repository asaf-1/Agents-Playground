// Playwright's test tools, with the [RESULT] block printed after every test.
import {
  expect,
  expected,
  fact,
  test,
} from "../../../framework/fixtures/resultBlock";
// The bank helpers: sign up, accounts, balances, deposits.
import {
  addFunds,
  balanceOf,
  moneyAccounts,
  signUpCustomer,
} from "../../../framework/helpers/bank";

// How a loan is priced (phase 3b).
//
// Playground Bank publishes no rate card. An APR belongs to the customer
// asking, worked out from what the bank can see of them: what they hold, how
// long they have banked here, how their earlier loans went, how much they use
// the account, and how big this ask is next to their own money.
//
// So nothing here asserts a rate. It asserts the rules the rate has to follow.

// The ask most tests quote: $5,000 over 24 months.
const QUERY = "amountCents=500000&termMonths=24";

// Gets a loan quote for the signed-in customer, and checks it came back (200).
async function quote(
  request: import("@playwright/test").APIRequestContext,
  query = QUERY,
) {
  fact("quote for", query);
  const response = await request.get(`/api/bank/loans/quote?${query}`);
  expect(response.status(), await response.text()).toBe(200);
  return response.json();
}

test.describe("Playground Bank loan pricing", () => {
  // The quote lists its reasons, they add up to the APR, and they describe
  // this customer's real money.
  test("the offer explains itself, and the reasons add up to the rate", async ({
    request,
  }) => {
    expected(
      "term - discount + exposure = APR; balance = Checking + Savings; score in (0, 1]; exposure > 0",
    );
    // A new customer gets a quote.
    await signUpCustomer(request, "Explained Customer");
    const offered = await quote(request);
    fact("apr bp", offered.aprBasisPoints);

    // The reasons are there and add up to the rate.
    expect(offered.rate).toBeTruthy();
    expect(
      offered.rate.termBp - offered.rate.discountBp + offered.rate.exposureBp,
    ).toBe(offered.aprBasisPoints);

    // The reasons are the customer's real standing, not placeholders.
    const [checking, savings] = (await moneyAccounts(request)).accounts;
    fact("balances", checking.balanceCents + savings.balanceCents);
    expect(offered.rate.balanceCents).toBe(
      checking.balanceCents + savings.balanceCents,
    );
    expect(offered.rate.score).toBeGreaterThan(0);
    expect(offered.rate.score).toBeLessThanOrEqual(1);
    expect(offered.rate.exposure).toBeGreaterThan(0);
  });

  // Two customers asking for the same loan get different rates, because
  // their money differs: there is no rate card.
  test("two customers asking the same thing get different offers", async ({
    request,
    playwright,
    baseURL,
  }) => {
    expected(
      "the richer customer's quoted balance is higher, and the two APRs differ",
    );
    // Two new customers, the second in their own context.
    await signUpCustomer(request, "Richer Customer");
    const other = await playwright.request.newContext({ baseURL });
    await signUpCustomer(other, "Poorer Customer");

    // Opening balances are drawn per customer, so two fresh customers USUALLY
    // differ - but "usually" is not a test. Two draws can land close enough
    // that the rate, which is rounded to basis points, comes out identical,
    // and the failure then reads as "the bank has a rate card" when it does
    // not.
    //
    // So the gap is made on purpose. Not by a fixed top-up either: the draw
    // spans a wide range (bank/money.js), so any fixed amount is sometimes
    // smaller than the gap it is meant to create. The two standings are read
    // first and the top-up is whatever actually puts one clearly ahead, which
    // keeps working if those constants ever change.
    const total = (accounts: { balanceCents: number }[]) =>
      accounts.reduce((sum, account) => sum + account.balanceCents, 0);

    const mineAccounts = (await moneyAccounts(request)).accounts;
    const theirsTotal = total((await moneyAccounts(other)).accounts);
    const topUpCents =
      Math.max(0, theirsTotal - total(mineAccounts)) + 1_000_000;
    fact("top-up", topUpCents);

    await addFunds(request, mineAccounts[0].id, topUpCents);

    // Both ask for the same loan.
    const mine = await quote(request);
    const theirs = await quote(other);
    fact("mine apr", mine.aprBasisPoints);
    fact("their apr", theirs.aprBasisPoints);

    // What the bank saw of each of them really is their own standing...
    expect(mine.rate.balanceCents).toBeGreaterThan(theirs.rate.balanceCents);

    // ...and the offer follows it. There is no rate card.
    expect(mine.aprBasisPoints).not.toBe(theirs.aprBasisPoints);
    await other.dispose();
  });

  // Sending most of your money away raises your next rate; receiving it
  // lowers the receiver's.
  test("spending money makes the next offer dearer, and receiving makes it cheaper", async ({
    request,
    playwright,
    baseURL,
  }) => {
    expected(
      "after an 80% transfer: the sender's APR goes up, the receiver's goes down",
    );
    // Two new customers, and a quote for each before anything moves.
    await signUpCustomer(request, "Spending Customer");
    const [mine] = (await moneyAccounts(request)).accounts;
    const other = await playwright.request.newContext({ baseURL });
    await signUpCustomer(other, "Receiving Customer");
    const [theirs] = (await moneyAccounts(other)).accounts;
    fact("mine", mine.id);
    fact("theirs", theirs.number);

    const beforeMine = await quote(request);
    const beforeTheirs = await quote(other);

    // Move most of one balance to the other.
    const amountCents = Math.floor(mine.balanceCents * 0.8);
    fact("sent", amountCents);
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

    // New quotes: dearer for the sender, cheaper for the receiver.
    const afterMine = await quote(request);
    const afterTheirs = await quote(other);

    expect(afterMine.aprBasisPoints).toBeGreaterThan(beforeMine.aprBasisPoints);
    expect(afterTheirs.aprBasisPoints).toBeLessThan(
      beforeTheirs.aprBasisPoints,
    );
    await other.dispose();
  });

  // Turning most of the balance into Bitcoin leaves less money at the bank,
  // so the next loan costs more.
  test("buying crypto also makes the next offer dearer", async ({
    request,
  }) => {
    expected(
      "after buying BTC with 80% of Checking: quoted balance lower, APR higher",
    );
    // A new customer and a quote before buying.
    await signUpCustomer(request, "Trading Borrower");
    const [checking] = (await moneyAccounts(request)).accounts;
    fact("checking", checking.id);
    const before = await quote(request);

    // Price a BTC buy with 80% of Checking, then fill it.
    const priced = await request.post("/api/bank/trades/quote", {
      data: {
        symbol: "BTC",
        side: "buy",
        spendCents: Math.floor(checking.balanceCents * 0.8),
      },
    });
    const { id } = await priced.json();
    fact("trade quote", id);
    const filled = await request.post("/api/bank/trades", {
      data: { quoteId: id, accountId: checking.id },
    });
    expect(filled.status(), await filled.text()).toBe(201);

    // The money left the bank for coin, so the bank sees less of it.
    const after = await quote(request);
    expect(after.rate.balanceCents).toBeLessThan(before.rate.balanceCents);
    expect(after.aprBasisPoints).toBeGreaterThan(before.aprBasisPoints);
  });

  // Asking for much more than you hold costs more than a small ask.
  test("a bigger ask against the same money costs more", async ({
    request,
  }) => {
    expected(
      "the $1,000,000 ask has a higher exposure, exposure bp and APR than the $1,000 ask",
    );
    // One customer, a $1,000 ask and a $1,000,000 ask.
    await signUpCustomer(request, "Stretching Customer");
    const small = await quote(request, "amountCents=100000&termMonths=24");
    const large = await quote(request, "amountCents=100000000&termMonths=24");
    fact("small apr", small.aprBasisPoints);
    fact("large apr", large.aprBasisPoints);

    expect(large.rate.exposure).toBeGreaterThan(small.rate.exposure);
    expect(large.rate.exposureBp).toBeGreaterThan(small.rate.exposureBp);
    expect(large.aprBasisPoints).toBeGreaterThan(small.aprBasisPoints);
  });

  // 12, 24, 36 and 60 months each cost more than the one before.
  test("longer money costs more, for everyone", async ({ request }) => {
    expected("APR rises at each of 12, 24, 36 and 60 months");
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

  // The loan keeps the rate it was asked at, even if the customer's money changes later.
  test("the rate is fixed on the loan when it is asked for", async ({
    request,
  }) => {
    expected(
      "loan APR = the quote's APR; after spending half of Checking, the loan's APR and payment are unchanged",
    );
    // A new customer gets a quote, then asks for that loan.
    await signUpCustomer(request, "Fixing Customer");
    const [checking] = (await moneyAccounts(request)).accounts;
    fact("checking", checking.id);
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
    fact("loanId", loan.id);
    fact("apr bp", loan.aprBasisPoints);
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

    // The loan still has its rate and its payment.
    const detail = await (
      await request.get(`/api/bank/loans/${loan.id}`)
    ).json();
    expect(detail.loan.aprBasisPoints).toBe(loan.aprBasisPoints);
    expect(detail.loan.monthlyPaymentCents).toBe(loan.monthlyPaymentCents);
  });
});
