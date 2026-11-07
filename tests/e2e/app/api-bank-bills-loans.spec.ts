// Reads openapi.json from disk, so answers can be checked against the contract.
import { readFileSync } from "node:fs";
// Ajv checks a JSON value against a JSON Schema; ajv-formats adds formats like date-time.
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
// Playwright's test tools, with the [RESULT] block printed after every test.
import {
  expect,
  expected,
  fact,
  test,
} from "../../../framework/fixtures/resultBlock";
// The bank helpers: sign up, sign in, read accounts and balances, add a payee, ask for a loan.
import {
  addPayee,
  balanceOf,
  DEMO,
  moneyAccounts,
  requestLoan,
  signIn,
  signUpCustomer,
} from "../../../framework/helpers/bank";

// Playground Bank bill pay and loans (phase 2b-2): status codes, the money
// rules and the OpenAPI contract. Every test signs up its own customers; staff
// actions use the demo Support and Admin in their own request contexts.

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

// Payees and bill payments.
test.describe("Playground Bank bill pay API", () => {
  // A payee can be saved, listed and deleted, and bad payees are refused.
  test("save, list and delete payees", async ({ request }) => {
    expected(
      "201 on save, the payee listed, 400 for bad payees, 200 on delete, then 404",
    );
    // A new customer saves one payee; the answer matches the contract.
    await signUpCustomer(request, "Payee Customer");
    const created = await request.post("/api/bank/payees", {
      data: { name: "City Power", reference: "ACC-100234" },
    });
    expect(created.status()).toBe(201);
    const { payee } = await created.json();
    expectSchema("BankPayeeResponse", { payee });
    fact("payeeId", payee.id);

    // The list holds exactly that payee.
    const list = await (await request.get("/api/bank/payees")).json();
    expectSchema("BankPayeesResponse", list);
    expect(list.payees.map((item: { id: string }) => item.id)).toEqual([
      payee.id,
    ]);

    // A name too short, a reference with markup, and a missing reference are
    // each refused (400).
    for (const data of [
      { name: "X", reference: "ACC-1" },
      { name: "Gas Co", reference: "<script>" },
      { name: "Gas Co" },
    ]) {
      const response = await request.post("/api/bank/payees", { data });
      expect(response.status(), JSON.stringify(data)).toBe(400);
    }

    // Delete it: the list is empty, and deleting again is 404.
    const deleted = await request.delete(`/api/bank/payees/${payee.id}`, {
      data: {},
    });
    expect(deleted.status()).toBe(200);
    expect(
      (await (await request.get("/api/bank/payees")).json()).payees,
    ).toEqual([]);
    const again = await request.delete(`/api/bank/payees/${payee.id}`, {
      data: {},
    });
    expect(again.status()).toBe(404);
  });

  // Paying a bill takes the money out of Checking, and the history names the payee.
  test("pay a bill: the money leaves and the history says to whom", async ({
    request,
  }) => {
    expected(
      "201, Checking down by 12050 cents, one bill_payment in the history",
    );
    // A new customer with a payee.
    await signUpCustomer(request, "Paying Customer");
    const [checking] = (await moneyAccounts(request)).accounts;
    const payee = await addPayee(request, "City Power", "ACC-100234");
    fact("checking", checking.id);
    fact("balance", checking.balanceCents);
    fact("payeeId", payee.id);

    // Pay $120.50 from Checking; the answer matches the contract.
    const response = await request.post("/api/bank/bill-payments", {
      data: {
        fromAccountId: checking.id,
        payeeId: payee.id,
        amountCents: 12_050,
        memo: "October",
      },
    });
    expect(response.status(), await response.text()).toBe(201);
    const body = await response.json();
    expectSchema("BankBillPaymentResponse", body);
    // The balance dropped by exactly that, and the payment names the payee.
    expect(body.fromAccount.balanceCents).toBe(checking.balanceCents - 12_050);
    expect(body.payment).toMatchObject({
      payeeName: "City Power",
      payeeReference: "ACC-100234",
      amountCents: 12_050,
      memo: "October",
    });

    // The account's bill history has one line, with the payee's reference.
    const history = await (
      await request.get(
        `/api/bank/accounts/${checking.id}/transactions?type=bill`,
      )
    ).json();
    expect(history.total).toBe(1);
    expect(history.transactions[0]).toMatchObject({
      kind: "bill_payment",
      amountCents: -12_050,
      counterparty: "ACC-100234",
      memo: "October",
    });
    // And the list of bill payments has it too.
    const payments = await (
      await request.get("/api/bank/bill-payments")
    ).json();
    expectSchema("BankBillPaymentsResponse", payments);
    expect(payments.payments).toHaveLength(1);
  });

  // Sending the same payment twice with one Idempotency-Key pays once.
  test("the same Idempotency-Key pays a bill once", async ({ request }) => {
    expected(
      "201 first, 200 replayed second, Checking down by 5000 cents only once",
    );
    // A new customer with a payee.
    await signUpCustomer(request, "Retrying Payer");
    const [checking] = (await moneyAccounts(request)).accounts;
    const payee = await addPayee(request);
    fact("checking", checking.id);
    fact("balance", checking.balanceCents);
    fact("payeeId", payee.id);
    // The same $50 payment, always with the key "bill-key-1".
    const send = () =>
      request.post("/api/bank/bill-payments", {
        data: {
          fromAccountId: checking.id,
          payeeId: payee.id,
          amountCents: 5_000,
        },
        headers: { "Idempotency-Key": "bill-key-1" },
      });
    // The first is paid (201); the second is a replay (200), not a new payment.
    expect((await send()).status()).toBe(201);
    const second = await send();
    expect(second.status()).toBe(200);
    expect((await second.json()).replayed).toBe(true);
    // The money left once.
    expect(await balanceOf(request, checking.id)).toBe(
      checking.balanceCents - 5_000,
    );
  });

  // A payment of nothing, less than nothing, a fraction, a string, or more
  // than the balance is refused, and the balance does not move.
  test("a bill payment needs a real amount and enough money", async ({
    request,
  }) => {
    expected(
      "400 for 0, -500, 10.5 and '100'; 409 INSUFFICIENT_FUNDS for balance + 1; balance unchanged",
    );
    // A new customer with a payee.
    await signUpCustomer(request, "Short Payer");
    const [checking] = (await moneyAccounts(request)).accounts;
    const payee = await addPayee(request);
    fact("checking", checking.id);
    fact("balance", checking.balanceCents);
    fact("payeeId", payee.id);
    // Each bad amount is refused (400).
    for (const amountCents of [0, -500, 10.5, "100"]) {
      const response = await request.post("/api/bank/bill-payments", {
        data: { fromAccountId: checking.id, payeeId: payee.id, amountCents },
      });
      expect(response.status(), `amountCents ${amountCents}`).toBe(400);
    }
    // One cent more than the balance is refused as not enough money (409).
    const tooMuch = await request.post("/api/bank/bill-payments", {
      data: {
        fromAccountId: checking.id,
        payeeId: payee.id,
        amountCents: checking.balanceCents + 1,
      },
    });
    expect(tooMuch.status()).toBe(409);
    expect((await tooMuch.json()).code).toBe("INSUFFICIENT_FUNDS");
    // Nothing left the account.
    expect(await balanceOf(request, checking.id)).toBe(checking.balanceCents);
  });

  // One customer can't pay or delete another customer's payee.
  test("another customer's payee can't be paid or deleted", async ({
    request,
    playwright,
    baseURL,
  }) => {
    expected(
      "404 PAYEE_NOT_FOUND on pay, 404 on delete, the other customer still has the payee",
    );
    // Customer one, and customer two in their own request context with a payee.
    await signUpCustomer(request, "Nosy Payer");
    const [checking] = (await moneyAccounts(request)).accounts;
    const other = await playwright.request.newContext({ baseURL });
    await signUpCustomer(other, "Private Payer");
    const theirs = await addPayee(other, "Their Gas", "GAS-77");
    fact("checking", checking.id);
    fact("theirPayee", theirs.id);

    // Customer one tries to pay it: not found, as if it did not exist.
    const pay = await request.post("/api/bank/bill-payments", {
      data: {
        fromAccountId: checking.id,
        payeeId: theirs.id,
        amountCents: 100,
      },
    });
    expect(pay.status()).toBe(404);
    expect((await pay.json()).code).toBe("PAYEE_NOT_FOUND");
    // And to delete it: not found either.
    const remove = await request.delete(`/api/bank/payees/${theirs.id}`, {
      data: {},
    });
    expect(remove.status()).toBe(404);
    // Customer two still has their payee.
    expect(
      (await (await other.get("/api/bank/payees")).json()).payees,
    ).toHaveLength(1);
    await other.dispose();
  });

  // The demo customer sees their three payees but can't add one or pay.
  test("demo accounts can see their payees but not pay or add", async ({
    request,
  }) => {
    expected("three demo payees listed; 403 on add and on pay");
    // Sign in as the demo customer and read the payees.
    await signIn(request, DEMO.customer);
    const { payees } = await (await request.get("/api/bank/payees")).json();
    expect(payees.map((payee: { name: string }) => payee.name)).toEqual([
      "Bay Homes Rent",
      "City Power",
      "Telco Mobile",
    ]);
    // Adding a payee is refused: demo data is read-only.
    const add = await request.post("/api/bank/payees", {
      data: { name: "New Co", reference: "N-1" },
    });
    expect(add.status()).toBe(403);
    // Paying one is refused too.
    const [checking] = (await moneyAccounts(request)).accounts;
    fact("checking", checking.id);
    const pay = await request.post("/api/bank/bill-payments", {
      data: {
        fromAccountId: checking.id,
        payeeId: payees[0].id,
        amountCents: 100,
      },
    });
    expect(pay.status()).toBe(403);
  });
});

// Loan quotes, loan requests, and the staff who decide them.
test.describe("Playground Bank loans API", () => {
  // A quote's monthly payments add up to the amount plus the interest, and
  // longer loans cost more per year.
  test("a quote's payments pay the loan off exactly", async ({ request }) => {
    expected(
      "200, APR 350-1600 bp, 12 payments ending at 0, longer terms cost more, 400 for bad asks",
    );
    // A new customer asks for a quote: $12,000 over 12 months.
    await signUpCustomer(request, "Quoting Customer");
    const response = await request.get(
      "/api/bank/loans/quote?amountCents=1200000&termMonths=12",
    );
    expect(response.status()).toBe(200);
    const quote = await response.json();
    expectSchema("BankLoanQuote", quote);
    fact("apr bp", quote.aprBasisPoints);
    fact("monthly", quote.monthlyPaymentCents);
    // There is no rate card to assert: the APR is worked out for this customer
    // from their balances, how long they have banked here and how big the ask
    // is. What must hold is that the number is sane and that the payment the
    // quote gives really follows from the APR it shows.
    expect(quote.aprBasisPoints).toBeGreaterThanOrEqual(350);
    expect(quote.aprBasisPoints).toBeLessThanOrEqual(1600);
    const monthly = quote.aprBasisPoints / 10_000 / 12;
    expect(quote.monthlyPaymentCents).toBe(
      Math.round((1_200_000 * monthly) / (1 - Math.pow(1 + monthly, -12))),
    );
    // And the reasons add up to the rate the customer was given.
    expect(
      quote.rate.termBp - quote.rate.discountBp + quote.rate.exposureBp,
    ).toBe(quote.aprBasisPoints);
    // Twelve payments, the last one leaves nothing owed, and they sum to the total.
    expect(quote.schedule).toHaveLength(12);
    expect(quote.schedule[11].balanceCents).toBe(0);
    const paid = quote.schedule.reduce(
      (sum: number, row: { paymentCents: number }) => sum + row.paymentCents,
      0,
    );
    expect(paid).toBe(quote.totalRepaidCents);
    expect(quote.totalRepaidCents).toBe(1_200_000 + quote.totalInterestCents);

    // Longer money costs more. The exact rates are this customer's, but the
    // order of them is a rule for everyone.
    let previous = quote.aprBasisPoints;
    for (const term of [24, 36, 60]) {
      const other = await (
        await request.get(
          `/api/bank/loans/quote?amountCents=1200000&termMonths=${term}`,
        )
      ).json();
      expect(other.aprBasisPoints, `${term} months`).toBeGreaterThan(previous);
      previous = other.aprBasisPoints;
    }
    // Too small, too big, an odd term, and no amount are each refused (400).
    for (const query of [
      "amountCents=99999&termMonths=12",
      "amountCents=100000001&termMonths=12",
      "amountCents=1200000&termMonths=18",
      "termMonths=12",
    ]) {
      const bad = await request.get(`/api/bank/loans/quote?${query}`);
      expect(bad.status(), query).toBe(400);
    }
  });

  // Asking for a loan makes a pending loan with its schedule; no money moves yet.
  test("ask for a loan: it waits, with its schedule", async ({
    request,
    playwright,
    baseURL,
  }) => {
    expected(
      "201 pending with 36 payments, balance unchanged, 404 for another customer, 400 for bad asks",
    );
    // A new customer asks for $25,000 over 36 months into Savings.
    await signUpCustomer(request, "Borrowing Customer");
    const [, savings] = (await moneyAccounts(request)).accounts;
    fact("savings", savings.id);
    fact("balance", savings.balanceCents);
    const created = await request.post("/api/bank/loans", {
      data: {
        accountId: savings.id,
        amountCents: 2_500_000,
        termMonths: 36,
        purpose: "Kitchen",
      },
    });
    expect(created.status(), await created.text()).toBe(201);
    const { loan } = await created.json();
    expectSchema("BankLoanResponse", { loan });
    fact("loanId", loan.id);
    fact("apr bp", loan.aprBasisPoints);
    // It waits for a decision, on the right account.
    expect(loan).toMatchObject({
      status: "pending",
      accountNumber: savings.number,
    });
    // The rate is fixed on the row at the moment of asking, and the payment
    // follows from it.
    const rate = loan.aprBasisPoints / 10_000 / 12;
    expect(loan.monthlyPaymentCents).toBe(
      Math.round((2_500_000 * rate) / (1 - Math.pow(1 + rate, -36))),
    );
    // A customer's own view never names the customer.
    expect(loan).not.toHaveProperty("customer");

    // It is first in the customer's list, and its detail has 36 payments
    // ending at zero. No money has moved yet.
    const list = await (await request.get("/api/bank/loans")).json();
    expectSchema("BankLoansResponse", list);
    expect(list.loans[0].id).toBe(loan.id);
    const detail = await (
      await request.get(`/api/bank/loans/${loan.id}`)
    ).json();
    expectSchema("BankLoanDetailResponse", detail);
    expect(detail.schedule).toHaveLength(36);
    expect(detail.schedule[35].balanceCents).toBe(0);
    expect(await balanceOf(request, savings.id)).toBe(savings.balanceCents);

    // Another customer can't see it (404).
    const other = await playwright.request.newContext({ baseURL });
    await signUpCustomer(other, "Snooping Customer");
    expect((await other.get(`/api/bank/loans/${loan.id}`)).status()).toBe(404);
    await other.dispose();

    // Too small, an odd term, and no account are each refused (400).
    for (const data of [
      { accountId: savings.id, amountCents: 99_999, termMonths: 12 },
      { accountId: savings.id, amountCents: 500_000, termMonths: 18 },
      { amountCents: 500_000, termMonths: 12 },
    ]) {
      const bad = await request.post("/api/bank/loans", { data });
      expect(bad.status(), JSON.stringify(data)).toBe(400);
    }
  });

  // A customer can have three loan requests waiting, not four.
  test("at most three loan requests wait at once", async ({ request }) => {
    expected("three loans asked, the fourth 409 TOO_MANY_PENDING");
    // A new customer asks for three loans.
    await signUpCustomer(request, "Eager Customer");
    const [checking] = (await moneyAccounts(request)).accounts;
    fact("checking", checking.id);
    for (let index = 0; index < 3; index += 1) {
      await requestLoan(request, checking.id, 100_000 + index);
    }
    // The fourth is refused.
    const fourth = await request.post("/api/bank/loans", {
      data: { accountId: checking.id, amountCents: 100_000, termMonths: 12 },
    });
    expect(fourth.status()).toBe(409);
    expect((await fourth.json()).code).toBe("TOO_MANY_PENDING");
  });

  // An Admin approves a loan: the money arrives once, and a second approval is refused.
  test("an Admin approves a loan and the money is paid out once", async ({
    request,
    playwright,
    baseURL,
  }) => {
    expected(
      "200 approved, Checking up by 1000000 cents, a loan_disbursement line, 409 ALREADY_DECIDED on a second approve",
    );
    // A new customer asks for $10,000 over 24 months.
    await signUpCustomer(request, "Approved Customer");
    const [checking] = (await moneyAccounts(request)).accounts;
    const loan = await requestLoan(request, checking.id, 1_000_000, 24, "Car");
    fact("checking", checking.id);
    fact("balance", checking.balanceCents);
    fact("loanId", loan.id);

    // The demo Admin, in their own context, approves it with a note.
    const admin = await playwright.request.newContext({ baseURL });
    await signIn(admin, DEMO.admin);
    const approved = await admin.patch(`/api/bank/admin/loans/${loan.id}`, {
      data: { decision: "approve", note: "Looks fine." },
    });
    expect(approved.status(), await approved.text()).toBe(200);
    const body = await approved.json();
    expectSchema("BankLoanResponse", body);
    expect(body.loan).toMatchObject({
      status: "approved",
      decisionNote: "Looks fine.",
    });
    // Staff see who the customer is.
    expect(body.loan.customer.email).toContain("@example.test");

    // The money arrived in Checking, with a disbursement line in the history.
    expect(await balanceOf(request, checking.id)).toBe(
      checking.balanceCents + 1_000_000,
    );
    const history = await (
      await request.get(
        `/api/bank/accounts/${checking.id}/transactions?type=loan`,
      )
    ).json();
    expect(history.transactions[0]).toMatchObject({
      kind: "loan_disbursement",
      amountCents: 1_000_000,
      memo: "Car",
    });

    // Approving again is refused, and no second payout happens.
    const twice = await admin.patch(`/api/bank/admin/loans/${loan.id}`, {
      data: { decision: "approve" },
    });
    expect(twice.status()).toBe(409);
    expect((await twice.json()).code).toBe("ALREADY_DECIDED");
    expect(await balanceOf(request, checking.id)).toBe(
      checking.balanceCents + 1_000_000,
    );
    await admin.dispose();
  });

  // A rejection must say why, and pays nothing.
  test("rejecting needs a reason, and pays nothing", async ({
    request,
    playwright,
    baseURL,
  }) => {
    expected(
      "400 without a note, 200 with one, the loan shows rejected with the note, balance unchanged",
    );
    // A new customer asks for a loan; the demo Admin signs in to decide it.
    await signUpCustomer(request, "Rejected Customer");
    const [checking] = (await moneyAccounts(request)).accounts;
    const loan = await requestLoan(request, checking.id);
    fact("checking", checking.id);
    fact("loanId", loan.id);
    const admin = await playwright.request.newContext({ baseURL });
    await signIn(admin, DEMO.admin);

    // No reason: refused, with an error on "note".
    const noReason = await admin.patch(`/api/bank/admin/loans/${loan.id}`, {
      data: { decision: "reject" },
    });
    expect(noReason.status()).toBe(400);
    expect((await noReason.json()).errors.note).toBeTruthy();
    // With a reason: rejected.
    const rejected = await admin.patch(`/api/bank/admin/loans/${loan.id}`, {
      data: { decision: "reject", note: "Income too low." },
    });
    expect(rejected.status()).toBe(200);

    // The customer sees the rejection and the reason; no money arrived.
    const mine = await (await request.get("/api/bank/loans")).json();
    expect(mine.loans[0]).toMatchObject({
      status: "rejected",
      decisionNote: "Income too low.",
    });
    expect(await balanceOf(request, checking.id)).toBe(checking.balanceCents);
    await admin.dispose();
  });

  // Support can read the queue but not decide; a customer can do neither.
  test("Support sees the queue but can't decide; customers can't see it", async ({
    request,
    playwright,
    baseURL,
  }) => {
    expected(
      "customer 403 on the queue and on deciding; Support 200 on the queue with the loan, 403 on deciding",
    );
    // A new customer asks for a loan, then tries the staff queue and a decision.
    await signUpCustomer(request, "Queued Customer");
    const [checking] = (await moneyAccounts(request)).accounts;
    const loan = await requestLoan(request, checking.id);
    fact("loanId", loan.id);
    expect((await request.get("/api/bank/admin/loans")).status()).toBe(403);
    expect(
      (
        await request.patch(`/api/bank/admin/loans/${loan.id}`, {
          data: { decision: "approve" },
        })
      ).status(),
    ).toBe(403);

    // The demo Support person sees the loan in the pending queue.
    const support = await playwright.request.newContext({ baseURL });
    await signIn(support, DEMO.support);
    const queue = await support.get("/api/bank/admin/loans?status=pending");
    expect(queue.status()).toBe(200);
    const body = await queue.json();
    expectSchema("BankLoansResponse", body);
    expect(body.loans.some((item: { id: string }) => item.id === loan.id)).toBe(
      true,
    );
    // But Support can't approve it.
    const decide = await support.patch(`/api/bank/admin/loans/${loan.id}`, {
      data: { decision: "approve" },
    });
    expect(decide.status()).toBe(403);
    await support.dispose();
  });

  // An Admin can't decide their own loan, and the demo loans can't be changed.
  test("nobody decides their own loan, and demo loans can't change", async ({
    request,
    playwright,
    baseURL,
  }) => {
    expected(
      "409 CANNOT_DECIDE_OWN for the promoted customer; 403 DEMO_READ_ONLY on a demo loan",
    );
    // A new customer asks for a loan.
    const customer = await signUpCustomer(request, "Self Approver");
    const [checking] = (await moneyAccounts(request)).accounts;
    const loan = await requestLoan(request, checking.id);
    fact("loanId", loan.id);

    // The demo Admin makes that customer an Admin too.
    const admin = await playwright.request.newContext({ baseURL });
    await signIn(admin, DEMO.admin);
    const promoted = await admin.patch(`/api/bank/admin/users/${customer.id}`, {
      data: { role: "admin" },
    });
    expect(promoted.status()).toBe(200);
    // The new Admin tries to approve their own loan: refused.
    const own = await request.patch(`/api/bank/admin/loans/${loan.id}`, {
      data: { decision: "approve" },
    });
    expect(own.status()).toBe(409);
    expect((await own.json()).code).toBe("CANNOT_DECIDE_OWN");

    // The demo customer's loan can't be decided by anyone.
    const demoLoans = await (await admin.get("/api/bank/admin/loans")).json();
    const mayas = demoLoans.loans.find(
      (item: { customer: { email: string } }) =>
        item.customer.email === DEMO.customer,
    );
    fact("demoLoan", mayas.id);
    const demo = await admin.patch(`/api/bank/admin/loans/${mayas.id}`, {
      data: { decision: "reject", note: "No." },
    });
    expect(demo.status()).toBe(403);
    expect((await demo.json()).code).toBe("DEMO_READ_ONLY");
    await admin.dispose();
  });
});
