import { readFileSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { expect, test } from "@playwright/test";
import {
  addPayee,
  balanceOf,
  DEMO,
  moneyAccounts,
  requestLoan,
  signIn,
  signUpCustomer,
} from "./_bank";

// Playground Bank bill pay and loans (phase 2b-2): status codes, the money
// rules and the OpenAPI contract. Every test signs up its own customers; staff
// actions use the demo Support and Admin in their own request contexts.
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

test.describe("Playground Bank bill pay API", () => {
  test("save, list and delete payees", async ({ request }) => {
    await signUpCustomer(request, "Payee Customer");
    const created = await request.post("/api/bank/payees", {
      data: { name: "City Power", reference: "ACC-100234" },
    });
    expect(created.status()).toBe(201);
    const { payee } = await created.json();
    expectSchema("BankPayeeResponse", { payee });

    const list = await (await request.get("/api/bank/payees")).json();
    expectSchema("BankPayeesResponse", list);
    expect(list.payees.map((item: { id: string }) => item.id)).toEqual([
      payee.id,
    ]);

    for (const data of [
      { name: "X", reference: "ACC-1" },
      { name: "Gas Co", reference: "<script>" },
      { name: "Gas Co" },
    ]) {
      const response = await request.post("/api/bank/payees", { data });
      expect(response.status(), JSON.stringify(data)).toBe(400);
    }

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

  test("pay a bill: the money leaves and the history says to whom", async ({
    request,
  }) => {
    await signUpCustomer(request, "Paying Customer");
    const [checking] = (await moneyAccounts(request)).accounts;
    const payee = await addPayee(request, "City Power", "ACC-100234");

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
    expect(body.fromAccount.balanceCents).toBe(checking.balanceCents - 12_050);
    expect(body.payment).toMatchObject({
      payeeName: "City Power",
      payeeReference: "ACC-100234",
      amountCents: 12_050,
      memo: "October",
    });

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
    const payments = await (
      await request.get("/api/bank/bill-payments")
    ).json();
    expectSchema("BankBillPaymentsResponse", payments);
    expect(payments.payments).toHaveLength(1);
  });

  test("the same Idempotency-Key pays a bill once", async ({ request }) => {
    await signUpCustomer(request, "Retrying Payer");
    const [checking] = (await moneyAccounts(request)).accounts;
    const payee = await addPayee(request);
    const send = () =>
      request.post("/api/bank/bill-payments", {
        data: {
          fromAccountId: checking.id,
          payeeId: payee.id,
          amountCents: 5_000,
        },
        headers: { "Idempotency-Key": "bill-key-1" },
      });
    expect((await send()).status()).toBe(201);
    const second = await send();
    expect(second.status()).toBe(200);
    expect((await second.json()).replayed).toBe(true);
    expect(await balanceOf(request, checking.id)).toBe(
      checking.balanceCents - 5_000,
    );
  });

  test("a bill payment needs a real amount and enough money", async ({
    request,
  }) => {
    await signUpCustomer(request, "Short Payer");
    const [checking] = (await moneyAccounts(request)).accounts;
    const payee = await addPayee(request);
    for (const amountCents of [0, -500, 10.5, "100"]) {
      const response = await request.post("/api/bank/bill-payments", {
        data: { fromAccountId: checking.id, payeeId: payee.id, amountCents },
      });
      expect(response.status(), `amountCents ${amountCents}`).toBe(400);
    }
    const tooMuch = await request.post("/api/bank/bill-payments", {
      data: {
        fromAccountId: checking.id,
        payeeId: payee.id,
        amountCents: checking.balanceCents + 1,
      },
    });
    expect(tooMuch.status()).toBe(409);
    expect((await tooMuch.json()).code).toBe("INSUFFICIENT_FUNDS");
    expect(await balanceOf(request, checking.id)).toBe(checking.balanceCents);
  });

  test("another customer's payee can't be paid or deleted", async ({
    request,
    playwright,
    baseURL,
  }) => {
    await signUpCustomer(request, "Nosy Payer");
    const [checking] = (await moneyAccounts(request)).accounts;
    const other = await playwright.request.newContext({ baseURL });
    await signUpCustomer(other, "Private Payer");
    const theirs = await addPayee(other, "Their Gas", "GAS-77");

    const pay = await request.post("/api/bank/bill-payments", {
      data: {
        fromAccountId: checking.id,
        payeeId: theirs.id,
        amountCents: 100,
      },
    });
    expect(pay.status()).toBe(404);
    expect((await pay.json()).code).toBe("PAYEE_NOT_FOUND");
    const remove = await request.delete(`/api/bank/payees/${theirs.id}`, {
      data: {},
    });
    expect(remove.status()).toBe(404);
    expect(
      (await (await other.get("/api/bank/payees")).json()).payees,
    ).toHaveLength(1);
    await other.dispose();
  });

  test("demo accounts can see their payees but not pay or add", async ({
    request,
  }) => {
    await signIn(request, DEMO.customer);
    const { payees } = await (await request.get("/api/bank/payees")).json();
    expect(payees.map((payee: { name: string }) => payee.name)).toEqual([
      "Bay Homes Rent",
      "City Power",
      "Telco Mobile",
    ]);
    const add = await request.post("/api/bank/payees", {
      data: { name: "New Co", reference: "N-1" },
    });
    expect(add.status()).toBe(403);
    const [checking] = (await moneyAccounts(request)).accounts;
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

test.describe("Playground Bank loans API", () => {
  test("a quote's payments pay the loan off exactly", async ({ request }) => {
    await signUpCustomer(request, "Quoting Customer");
    const response = await request.get(
      "/api/bank/loans/quote?amountCents=1200000&termMonths=12",
    );
    expect(response.status()).toBe(200);
    const quote = await response.json();
    expectSchema("BankLoanQuote", quote);
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

  test("ask for a loan: it waits, with its schedule", async ({
    request,
    playwright,
    baseURL,
  }) => {
    await signUpCustomer(request, "Borrowing Customer");
    const [, savings] = (await moneyAccounts(request)).accounts;
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
    expect(loan).not.toHaveProperty("customer");

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

    const other = await playwright.request.newContext({ baseURL });
    await signUpCustomer(other, "Snooping Customer");
    expect((await other.get(`/api/bank/loans/${loan.id}`)).status()).toBe(404);
    await other.dispose();

    for (const data of [
      { accountId: savings.id, amountCents: 99_999, termMonths: 12 },
      { accountId: savings.id, amountCents: 500_000, termMonths: 18 },
      { amountCents: 500_000, termMonths: 12 },
    ]) {
      const bad = await request.post("/api/bank/loans", { data });
      expect(bad.status(), JSON.stringify(data)).toBe(400);
    }
  });

  test("at most three loan requests wait at once", async ({ request }) => {
    await signUpCustomer(request, "Eager Customer");
    const [checking] = (await moneyAccounts(request)).accounts;
    for (let index = 0; index < 3; index += 1) {
      await requestLoan(request, checking.id, 100_000 + index);
    }
    const fourth = await request.post("/api/bank/loans", {
      data: { accountId: checking.id, amountCents: 100_000, termMonths: 12 },
    });
    expect(fourth.status()).toBe(409);
    expect((await fourth.json()).code).toBe("TOO_MANY_PENDING");
  });

  test("an Admin approves a loan and the money is paid out once", async ({
    request,
    playwright,
    baseURL,
  }) => {
    await signUpCustomer(request, "Approved Customer");
    const [checking] = (await moneyAccounts(request)).accounts;
    const loan = await requestLoan(request, checking.id, 1_000_000, 24, "Car");

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
    expect(body.loan.customer.email).toContain("@example.test");

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

  test("rejecting needs a reason, and pays nothing", async ({
    request,
    playwright,
    baseURL,
  }) => {
    await signUpCustomer(request, "Rejected Customer");
    const [checking] = (await moneyAccounts(request)).accounts;
    const loan = await requestLoan(request, checking.id);
    const admin = await playwright.request.newContext({ baseURL });
    await signIn(admin, DEMO.admin);

    const noReason = await admin.patch(`/api/bank/admin/loans/${loan.id}`, {
      data: { decision: "reject" },
    });
    expect(noReason.status()).toBe(400);
    expect((await noReason.json()).errors.note).toBeTruthy();
    const rejected = await admin.patch(`/api/bank/admin/loans/${loan.id}`, {
      data: { decision: "reject", note: "Income too low." },
    });
    expect(rejected.status()).toBe(200);

    const mine = await (await request.get("/api/bank/loans")).json();
    expect(mine.loans[0]).toMatchObject({
      status: "rejected",
      decisionNote: "Income too low.",
    });
    expect(await balanceOf(request, checking.id)).toBe(checking.balanceCents);
    await admin.dispose();
  });

  test("Support sees the queue but can't decide; customers can't see it", async ({
    request,
    playwright,
    baseURL,
  }) => {
    await signUpCustomer(request, "Queued Customer");
    const [checking] = (await moneyAccounts(request)).accounts;
    const loan = await requestLoan(request, checking.id);
    expect((await request.get("/api/bank/admin/loans")).status()).toBe(403);
    expect(
      (
        await request.patch(`/api/bank/admin/loans/${loan.id}`, {
          data: { decision: "approve" },
        })
      ).status(),
    ).toBe(403);

    const support = await playwright.request.newContext({ baseURL });
    await signIn(support, DEMO.support);
    const queue = await support.get("/api/bank/admin/loans?status=pending");
    expect(queue.status()).toBe(200);
    const body = await queue.json();
    expectSchema("BankLoansResponse", body);
    expect(body.loans.some((item: { id: string }) => item.id === loan.id)).toBe(
      true,
    );
    const decide = await support.patch(`/api/bank/admin/loans/${loan.id}`, {
      data: { decision: "approve" },
    });
    expect(decide.status()).toBe(403);
    await support.dispose();
  });

  test("nobody decides their own loan, and demo loans can't change", async ({
    request,
    playwright,
    baseURL,
  }) => {
    const customer = await signUpCustomer(request, "Self Approver");
    const [checking] = (await moneyAccounts(request)).accounts;
    const loan = await requestLoan(request, checking.id);

    const admin = await playwright.request.newContext({ baseURL });
    await signIn(admin, DEMO.admin);
    const promoted = await admin.patch(`/api/bank/admin/users/${customer.id}`, {
      data: { role: "admin" },
    });
    expect(promoted.status()).toBe(200);
    const own = await request.patch(`/api/bank/admin/loans/${loan.id}`, {
      data: { decision: "approve" },
    });
    expect(own.status()).toBe(409);
    expect((await own.json()).code).toBe("CANNOT_DECIDE_OWN");

    const demoLoans = await (await admin.get("/api/bank/admin/loans")).json();
    const mayas = demoLoans.loans.find(
      (item: { customer: { email: string } }) =>
        item.customer.email === DEMO.customer,
    );
    const demo = await admin.patch(`/api/bank/admin/loans/${mayas.id}`, {
      data: { decision: "reject", note: "No." },
    });
    expect(demo.status()).toBe(403);
    expect((await demo.json()).code).toBe("DEMO_READ_ONLY");
    await admin.dispose();
  });
});
