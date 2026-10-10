import { readFileSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { expect, test } from "@playwright/test";
import {
  addFunds,
  balanceOf,
  DEMO,
  moneyAccounts,
  sendMoney,
  signIn,
  signUpCustomer,
  STARTER_CENTS,
  todayUtc,
} from "./_bank";

// Playground Bank money (/api/bank/accounts, /transfers, ...): status codes,
// the rules that keep money from being created or lost, and the OpenAPI
// contract. Every test signs up its own customers, so nothing is shared and
// the demo accounts are never changed.
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

test.describe("Playground Bank money API", () => {
  test("a new customer starts with $100,000 in Checking and Savings", async ({
    request,
  }) => {
    await signUpCustomer(request, "Starter Customer");
    const body = await moneyAccounts(request);
    expectSchema("BankMoneyAccountsResponse", body);
    expect(body.accounts.map((account) => account.kind)).toEqual([
      "checking",
      "savings",
    ]);
    expect(body.accounts.map((account) => account.balanceCents)).toEqual([
      STARTER_CENTS.checking,
      STARTER_CENTS.savings,
    ]);
    expect(body.totalCents).toBe(10_000_000);
    for (const account of body.accounts) {
      expect(account.number).toMatch(/^PB-\d{4}-\d{4}$/);
    }
  });

  test("Add funds takes $0.01 to $1,000,000 at a time", async ({ request }) => {
    await signUpCustomer(request, "Funding Customer");
    const [checking] = (await moneyAccounts(request)).accounts;
    const path = `/api/bank/accounts/${checking.id}/deposits`;

    const added = await addFunds(request, checking.id, 100_000_000);
    expectSchema("BankMoneyAccountResponse", added);
    expect(added.account.balanceCents).toBe(
      STARTER_CENTS.checking + 100_000_000,
    );

    for (const amountCents of [100_000_001, 0, -500, 12.5, "100"]) {
      const response = await request.post(path, { data: { amountCents } });
      expect(response.status(), `amountCents ${amountCents}`).toBe(400);
      expect((await response.json()).errors.amountCents).toBeTruthy();
    }
    expect(await balanceOf(request, checking.id)).toBe(
      STARTER_CENTS.checking + 100_000_000,
    );
  });

  test("open an account with its own name and starting amount", async ({
    request,
  }) => {
    await signUpCustomer(request, "Opening Customer");
    const created = await request.post("/api/bank/accounts", {
      data: { kind: "savings", name: "Holiday fund", openingCents: 50_000 },
    });
    expect(created.status(), await created.text()).toBe(201);
    const body = await created.json();
    expectSchema("BankMoneyAccountResponse", body);
    expect(body.account).toMatchObject({
      kind: "savings",
      name: "Holiday fund",
      balanceCents: 50_000,
    });
    expect((await moneyAccounts(request)).accounts).toHaveLength(3);

    for (const data of [
      { kind: "brokerage" },
      { kind: "checking", openingCents: 100_000_001 },
      { kind: "checking", name: "X" },
    ]) {
      const response = await request.post("/api/bank/accounts", { data });
      expect(response.status(), JSON.stringify(data)).toBe(400);
    }
  });

  test("a transfer between your own accounts records both sides", async ({
    request,
  }) => {
    await signUpCustomer(request, "Mover Customer");
    const [checking, savings] = (await moneyAccounts(request)).accounts;

    const response = await sendMoney(request, {
      fromAccountId: checking.id,
      toAccountNumber: savings.number,
      amountCents: 12_345,
      memo: "Monthly savings",
    });
    expect(response.status(), await response.text()).toBe(201);
    const body = await response.json();
    expectSchema("BankTransferResponse", body);
    expect(body.replayed).toBe(false);
    expect(body.fromAccount.balanceCents).toBe(STARTER_CENTS.checking - 12_345);
    expect(await balanceOf(request, savings.id)).toBe(
      STARTER_CENTS.savings + 12_345,
    );

    const out = await (
      await request.get(`/api/bank/accounts/${checking.id}/transactions`)
    ).json();
    const inbound = await (
      await request.get(`/api/bank/accounts/${savings.id}/transactions`)
    ).json();
    expectSchema("BankTransactionsPage", out);
    expect(out.transactions[0]).toMatchObject({
      kind: "transfer_out",
      amountCents: -12_345,
      memo: "Monthly savings",
      counterparty: savings.number,
      transferId: body.transfer.id,
    });
    expect(inbound.transactions[0]).toMatchObject({
      kind: "transfer_in",
      amountCents: 12_345,
      counterparty: checking.number,
      transferId: body.transfer.id,
    });
  });

  test("send money to another customer by account number", async ({
    request,
    playwright,
    baseURL,
  }) => {
    await signUpCustomer(request, "Sender Customer");
    const [checking] = (await moneyAccounts(request)).accounts;
    const recipient = await playwright.request.newContext({ baseURL });
    await signUpCustomer(recipient, "Recipient Customer");
    const [theirs] = (await moneyAccounts(recipient)).accounts;

    // The dashes are optional.
    const response = await sendMoney(request, {
      fromAccountId: checking.id,
      toAccountNumber: theirs.number.replace(/-/g, "").toLowerCase(),
      amountCents: 50_000,
    });
    expect(response.status(), await response.text()).toBe(201);
    expect((await response.json()).transfer.toAccountNumber).toBe(
      theirs.number,
    );
    expect(await balanceOf(recipient, theirs.id)).toBe(
      STARTER_CENTS.checking + 50_000,
    );
    await recipient.dispose();
  });

  test("a transfer can't spend more than the account holds", async ({
    request,
  }) => {
    await signUpCustomer(request, "Careful Customer");
    const [checking, savings] = (await moneyAccounts(request)).accounts;
    const response = await sendMoney(request, {
      fromAccountId: checking.id,
      toAccountNumber: savings.number,
      amountCents: STARTER_CENTS.checking + 1,
    });
    expect(response.status()).toBe(409);
    expect((await response.json()).code).toBe("INSUFFICIENT_FUNDS");
    expect(await balanceOf(request, checking.id)).toBe(STARTER_CENTS.checking);
    expect(await balanceOf(request, savings.id)).toBe(STARTER_CENTS.savings);
  });

  test("a transfer amount must be a whole number of cents above zero", async ({
    request,
  }) => {
    await signUpCustomer(request, "Validating Customer");
    const [checking, savings] = (await moneyAccounts(request)).accounts;
    for (const amountCents of [0, -100, 10.5, "500"]) {
      const response = await request.post("/api/bank/transfers", {
        data: {
          fromAccountId: checking.id,
          toAccountNumber: savings.number,
          amountCents,
        },
      });
      expect(response.status(), `amountCents ${amountCents}`).toBe(400);
      expect((await response.json()).errors.amountCents).toBeTruthy();
    }
    const self = await sendMoney(request, {
      fromAccountId: checking.id,
      toAccountNumber: checking.number,
      amountCents: 100,
    });
    expect(self.status()).toBe(400);
    expect((await self.json()).errors.toAccountNumber).toBeTruthy();
    expect(await balanceOf(request, checking.id)).toBe(STARTER_CENTS.checking);
  });

  test("the same Idempotency-Key moves the money once", async ({ request }) => {
    await signUpCustomer(request, "Retrying Customer");
    const [checking, savings] = (await moneyAccounts(request)).accounts;
    const data = {
      fromAccountId: checking.id,
      toAccountNumber: savings.number,
      amountCents: 7_500,
    };
    const first = await sendMoney(request, data, { key: "retry-key-1" });
    const second = await sendMoney(request, data, { key: "retry-key-1" });
    expect(first.status()).toBe(201);
    expect(second.status()).toBe(200);
    const replay = await second.json();
    expect(replay.replayed).toBe(true);
    expect(replay.transfer.id).toBe((await first.json()).transfer.id);
    expect(await balanceOf(request, checking.id)).toBe(
      STARTER_CENTS.checking - 7_500,
    );
  });

  test("two transfers at the same moment can't overdraw the account", async ({
    request,
  }) => {
    await signUpCustomer(request, "Racing Customer");
    const [checking, savings] = (await moneyAccounts(request)).accounts;
    const send = () =>
      sendMoney(request, {
        fromAccountId: checking.id,
        toAccountNumber: savings.number,
        amountCents: 2_000_000,
      });
    const statuses = (await Promise.all([send(), send()]))
      .map((response) => response.status())
      .sort();
    expect(statuses).toEqual([201, 409]);
    expect(await balanceOf(request, checking.id)).toBe(500_000);
  });

  test("another customer's account answers 404", async ({
    request,
    playwright,
    baseURL,
  }) => {
    await signUpCustomer(request, "Curious Customer");
    const [mine] = (await moneyAccounts(request)).accounts;
    const other = await playwright.request.newContext({ baseURL });
    await signUpCustomer(other, "Private Customer");
    const [theirs] = (await moneyAccounts(other)).accounts;

    for (const path of [
      `/api/bank/accounts/${theirs.id}`,
      `/api/bank/accounts/${theirs.id}/transactions`,
      `/api/bank/accounts/${theirs.id}/statement.csv`,
    ]) {
      const response = await request.get(path);
      expect(response.status(), path).toBe(404);
      expect((await response.json()).code).toBe("ACCOUNT_NOT_FOUND");
    }
    const steal = await sendMoney(request, {
      fromAccountId: theirs.id,
      toAccountNumber: mine.number,
      amountCents: 100,
    });
    expect(steal.status()).toBe(404);
    const unknown = await sendMoney(request, {
      fromAccountId: mine.id,
      toAccountNumber: "PB-0000-0000",
      amountCents: 100,
    });
    expect(unknown.status()).toBe(404);
    expect((await unknown.json()).code).toBe("RECIPIENT_NOT_FOUND");
    expect(await balanceOf(other, theirs.id)).toBe(STARTER_CENTS.checking);
    await other.dispose();
  });

  test("demo accounts can be browsed but never send or receive money", async ({
    request,
    playwright,
    baseURL,
  }) => {
    await signIn(request, DEMO.customer);
    const demo = await moneyAccounts(request);
    expect(demo.accounts.map((account) => account.number)).toEqual([
      "PB-1000-0001",
      "PB-1000-0002",
    ]);
    const history = await (
      await request.get(
        `/api/bank/accounts/${demo.accounts[0].id}/transactions`,
      )
    ).json();
    expect(history.total).toBeGreaterThan(10);

    const deposit = await request.post(
      `/api/bank/accounts/${demo.accounts[0].id}/deposits`,
      { data: { amountCents: 100 } },
    );
    expect(deposit.status()).toBe(403);
    const send = await sendMoney(request, {
      fromAccountId: demo.accounts[0].id,
      toAccountNumber: "PB-1000-0002",
      amountCents: 100,
    });
    expect(send.status()).toBe(403);
    expect((await send.json()).code).toBe("DEMO_READ_ONLY");

    const customer = await playwright.request.newContext({ baseURL });
    await signUpCustomer(customer, "Generous Customer");
    const [checking] = (await moneyAccounts(customer)).accounts;
    const gift = await sendMoney(customer, {
      fromAccountId: checking.id,
      toAccountNumber: "PB-1000-0001",
      amountCents: 100,
    });
    expect(gift.status()).toBe(403);
    expect((await gift.json()).code).toBe("DEMO_ACCOUNT");
    await customer.dispose();
  });

  test("history filters by date, type and amount, 20 to a page", async ({
    request,
  }) => {
    await signUpCustomer(request, "Busy Customer");
    const [checking] = (await moneyAccounts(request)).accounts;
    // The opening deposit plus 21 added funds of $1.00, $2.00 ... $21.00.
    for (let dollars = 1; dollars <= 21; dollars += 1) {
      await addFunds(request, checking.id, dollars * 100);
    }
    const base = `/api/bank/accounts/${checking.id}/transactions`;
    const get = async (query: string) => {
      const response = await request.get(`${base}?${query}`);
      expect(response.status(), query).toBe(200);
      return response.json();
    };

    const first = await get("");
    expect(first).toMatchObject({
      page: 1,
      pageSize: 20,
      total: 22,
      totalPages: 2,
    });
    expect(first.transactions).toHaveLength(20);
    // Newest first.
    expect(first.transactions[0].amountCents).toBe(2_100);
    const second = await get("page=2");
    expect(second.transactions).toHaveLength(2);
    expect(second.transactions[1].kind).toBe("opening");

    expect((await get("type=deposit")).total).toBe(22);
    expect((await get("type=out")).total).toBe(0);
    expect((await get("minCents=1000&maxCents=1500")).total).toBe(6);
    const today = todayUtc();
    expect((await get(`from=${today}&to=${today}`)).total).toBe(22);
    expect((await get("from=2020-01-01&to=2020-01-31")).total).toBe(0);

    for (const query of [
      "from=2026-02-30",
      "from=2026-10-10&to=2026-10-01",
      "type=refund",
      "minCents=5&maxCents=1",
      "page=0",
      "pageSize=101",
    ]) {
      const response = await request.get(`${base}?${query}`);
      expect(response.status(), query).toBe(400);
    }
  });

  test("the CSV statement adds up and defuses formulas", async ({
    request,
  }) => {
    await signUpCustomer(request, "Statement Customer");
    const [checking, savings] = (await moneyAccounts(request)).accounts;
    await sendMoney(request, {
      fromAccountId: checking.id,
      toAccountNumber: savings.number,
      amountCents: 4_321,
      memo: '=HYPERLINK("http://example.test")',
    });
    await addFunds(request, checking.id, 1_000);

    const response = await request.get(
      `/api/bank/accounts/${checking.id}/statement.csv`,
    );
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("text/csv");
    expect(response.headers()["content-disposition"]).toContain(
      `statement-${checking.number}-`,
    );
    const lines = (await response.text()).trim().split(/\r\n/);
    expect(lines[0]).toBe("Date (UTC),Description,Memo,Type,Amount,Balance");
    const rows = lines.slice(1, -1);
    expect(rows).toHaveLength(3);
    // Text from people can't run as a spreadsheet formula.
    expect(rows[1]).toContain("'=HYPERLINK");
    const amounts = rows.map((row) => {
      const cells = row.match(/(-?\d+\.\d{2}),(-?\d+\.\d{2})$/);
      return Math.round(Number(cells?.[1]) * 100);
    });
    const total = lines[lines.length - 1].match(/^Total,,,,(-?\d+\.\d{2}),$/);
    expect(total, lines[lines.length - 1]).not.toBeNull();
    expect(Math.round(Number(total?.[1]) * 100)).toBe(
      amounts.reduce((sum, cents) => sum + cents, 0),
    );
  });

  test("staff see a customer's accounts; customers can't", async ({
    request,
    playwright,
    baseURL,
  }) => {
    const customer = await signUpCustomer(request, "Viewed Customer");
    const forbidden = await request.get(`/api/bank/admin/users/${customer.id}`);
    expect(forbidden.status()).toBe(403);

    const support = await playwright.request.newContext({ baseURL });
    await signIn(support, DEMO.support);
    const response = await support.get(`/api/bank/admin/users/${customer.id}`);
    expect(response.status()).toBe(200);
    const body = await response.json();
    expectSchema("BankUserDetailResponse", body);
    expect(body.user.id).toBe(customer.id);
    expect(body.accounts).toHaveLength(2);
    await support.dispose();
  });

  test("recent activity lists the latest moves, newest first", async ({
    request,
  }) => {
    await signUpCustomer(request, "Active Customer");
    const [checking] = (await moneyAccounts(request)).accounts;
    await addFunds(request, checking.id, 999);
    const response = await request.get("/api/bank/activity");
    expect(response.status()).toBe(200);
    const body = await response.json();
    expectSchema("BankActivityResponse", body);
    expect(body.transactions.length).toBeLessThanOrEqual(8);
    expect(body.transactions[0]).toMatchObject({
      kind: "deposit",
      amountCents: 999,
    });
  });
});
