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
// The bank helpers: sign up, sign in, accounts, balances, deposits, transfers, today.
import {
  addFunds,
  balanceOf,
  DEMO,
  moneyAccounts,
  sendMoney,
  signIn,
  signUpCustomer,
  todayUtc,
} from "../../../framework/helpers/bank";

// Playground Bank money (/api/bank/accounts, /transfers, ...): status codes,
// the rules that keep money from being created or lost, and the OpenAPI
// contract. Every test signs up its own customers, so nothing is shared and
// the demo accounts are never changed.

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

test.describe("Playground Bank money API", () => {
  // A new customer starts with funded Checking and Savings, in amounts of their own.
  test("a new customer opens funded, with their own amounts", async ({
    request,
  }) => {
    expected(
      "checking then savings; both funded, savings > checking, total = sum, between $60,000 and $160,000; numbers PB-0000-0000",
    );
    // A new customer's accounts match the contract.
    await signUpCustomer(request, "Starter Customer");
    const body = await moneyAccounts(request);
    expectSchema("BankMoneyAccountsResponse", body);
    expect(body.accounts.map((account) => account.kind)).toEqual([
      "checking",
      "savings",
    ]);

    // The amounts are drawn from the customer's own id, so there is no "the"
    // starting balance to assert. What must hold: both accounts are funded,
    // the total is really the sum, savings holds more than checking, and the
    // whole thing lands in the published band of $60,000 to $160,000.
    const [checking, savings] = body.accounts;
    fact("checking", `${checking.number} ${checking.balanceCents}`);
    fact("savings", `${savings.number} ${savings.balanceCents}`);
    expect(checking.balanceCents).toBeGreaterThan(0);
    expect(savings.balanceCents).toBeGreaterThan(checking.balanceCents);
    expect(body.totalCents).toBe(checking.balanceCents + savings.balanceCents);
    expect(body.totalCents).toBeGreaterThanOrEqual(6_000_000);
    expect(body.totalCents).toBeLessThanOrEqual(16_000_000);

    // Every account number has the bank's shape.
    for (const account of body.accounts) {
      expect(account.number).toMatch(/^PB-\d{4}-\d{4}$/);
    }
  });

  // Two new customers don't start with the same money.
  test("two new customers do not open on the same balance", async ({
    request,
    playwright,
  }) => {
    expected("the two opening totals differ");
    // Customer one's total.
    await signUpCustomer(request, "Opening One");
    const first = await moneyAccounts(request);

    // Customer two, in their own context.
    const second = await playwright.request.newContext();
    await signUpCustomer(second, "Opening Two");
    const other = await moneyAccounts(second);
    fact("first", first.totalCents);
    fact("second", other.totalCents);

    expect(other.totalCents).not.toBe(first.totalCents);
    await second.dispose();
  });

  // A deposit can be from one cent to a million dollars; anything else is refused.
  test("Add funds takes $0.01 to $1,000,000 at a time", async ({ request }) => {
    expected(
      "$1,000,000 added; over the cap, 0, -500, 12.5 and '100' each 400 on amountCents; balance up by exactly $1,000,000",
    );
    // A new customer's Checking.
    await signUpCustomer(request, "Funding Customer");
    const [checking] = (await moneyAccounts(request)).accounts;
    const path = `/api/bank/accounts/${checking.id}/deposits`;
    fact("checking", checking.id);
    fact("balance", checking.balanceCents);

    // The top amount is accepted.
    const added = await addFunds(request, checking.id, 100_000_000);
    expectSchema("BankMoneyAccountResponse", added);
    expect(added.account.balanceCents).toBe(
      checking.balanceCents + 100_000_000,
    );

    // A cent over the cap, nothing, less than nothing, a fraction, and a string.
    for (const amountCents of [100_000_001, 0, -500, 12.5, "100"]) {
      const response = await request.post(path, { data: { amountCents } });
      expect(response.status(), `amountCents ${amountCents}`).toBe(400);
      expect((await response.json()).errors.amountCents).toBeTruthy();
    }
    // Only the first deposit landed.
    expect(await balanceOf(request, checking.id)).toBe(
      checking.balanceCents + 100_000_000,
    );
  });

  // A customer can open a third account with a name and opening amount; bad
  // kinds, amounts and names are refused.
  test("open an account with its own name and starting amount", async ({
    request,
  }) => {
    expected(
      "201 savings 'Holiday fund' with 50000; 3 accounts; 400 for brokerage, over the cap, and a one-letter name",
    );
    // A new customer opens "Holiday fund" with $500.
    await signUpCustomer(request, "Opening Customer");
    const created = await request.post("/api/bank/accounts", {
      data: { kind: "savings", name: "Holiday fund", openingCents: 50_000 },
    });
    expect(created.status(), await created.text()).toBe(201);
    const body = await created.json();
    expectSchema("BankMoneyAccountResponse", body);
    fact("new account", body.account.id);
    expect(body.account).toMatchObject({
      kind: "savings",
      name: "Holiday fund",
      balanceCents: 50_000,
    });
    expect((await moneyAccounts(request)).accounts).toHaveLength(3);

    // A kind the bank doesn't offer, an opening over the cap, and a one-letter name.
    for (const data of [
      { kind: "brokerage" },
      { kind: "checking", openingCents: 100_000_001 },
      { kind: "checking", name: "X" },
    ]) {
      const response = await request.post("/api/bank/accounts", { data });
      expect(response.status(), JSON.stringify(data)).toBe(400);
    }
  });

  // Moving money between your own accounts writes a line on each side,
  // linked by the same transfer id.
  test("a transfer between your own accounts records both sides", async ({
    request,
  }) => {
    expected(
      "201 not replayed; Checking -12345, Savings +12345; transfer_out and transfer_in lines with the same transferId",
    );
    // A new customer moves $123.45 from Checking to Savings.
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
    fact("transferId", body.transfer.id);
    // Both balances moved by the amount.
    expect(body.replayed).toBe(false);
    expect(body.fromAccount.balanceCents).toBe(checking.balanceCents - 12_345);
    expect(await balanceOf(request, savings.id)).toBe(
      savings.balanceCents + 12_345,
    );

    // Each account's history has its side of the transfer.
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

  // Money can go to another customer by their account number, written with
  // or without dashes.
  test("send money to another customer by account number", async ({
    request,
    playwright,
    baseURL,
  }) => {
    expected(
      "201; the transfer names the number with dashes; the recipient is up by 50000",
    );
    // A sender, and a recipient in their own context.
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
      theirs.balanceCents + 50_000,
    );
    await recipient.dispose();
  });

  // One cent more than the balance is refused, and neither balance moves.
  test("a transfer can't spend more than the account holds", async ({
    request,
  }) => {
    expected("409 INSUFFICIENT_FUNDS; both balances unchanged");
    await signUpCustomer(request, "Careful Customer");
    const [checking, savings] = (await moneyAccounts(request)).accounts;
    const response = await sendMoney(request, {
      fromAccountId: checking.id,
      toAccountNumber: savings.number,
      amountCents: checking.balanceCents + 1,
    });
    expect(response.status()).toBe(409);
    expect((await response.json()).code).toBe("INSUFFICIENT_FUNDS");
    expect(await balanceOf(request, checking.id)).toBe(checking.balanceCents);
    expect(await balanceOf(request, savings.id)).toBe(savings.balanceCents);
  });

  // Zero, negative, fractional and string amounts are refused, and so is
  // sending to the same account.
  test("a transfer amount must be a whole number of cents above zero", async ({
    request,
  }) => {
    expected(
      "400 on amountCents for 0, -100, 10.5 and '500'; 400 on toAccountNumber to itself; balance unchanged",
    );
    // Each bad amount.
    await signUpCustomer(request, "Validating Customer");
    const [checking, savings] = (await moneyAccounts(request)).accounts;
    fact("checking", checking.id);
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
    // Checking to Checking.
    const self = await sendMoney(request, {
      fromAccountId: checking.id,
      toAccountNumber: checking.number,
      amountCents: 100,
    });
    expect(self.status()).toBe(400);
    expect((await self.json()).errors.toAccountNumber).toBeTruthy();
    expect(await balanceOf(request, checking.id)).toBe(checking.balanceCents);
  });

  // Sending twice with the same Idempotency-Key moves the money once.
  test("the same Idempotency-Key moves the money once", async ({ request }) => {
    expected(
      "201 then 200 replayed with the same transfer id; Checking down by 7500 once",
    );
    // The same $75 transfer, twice, with the key "retry-key-1".
    await signUpCustomer(request, "Retrying Customer");
    const [checking, savings] = (await moneyAccounts(request)).accounts;
    const data = {
      fromAccountId: checking.id,
      toAccountNumber: savings.number,
      amountCents: 7_500,
    };
    const first = await sendMoney(request, data, { key: "retry-key-1" });
    const second = await sendMoney(request, data, { key: "retry-key-1" });
    // The second is a replay of the first, not a new transfer.
    expect(first.status()).toBe(201);
    expect(second.status()).toBe(200);
    const replay = await second.json();
    expect(replay.replayed).toBe(true);
    expect(replay.transfer.id).toBe((await first.json()).transfer.id);
    expect(await balanceOf(request, checking.id)).toBe(
      checking.balanceCents - 7_500,
    );
  });

  // Two transfers fired at once can't both spend the same money.
  test("two transfers at the same moment can't overdraw the account", async ({
    request,
  }) => {
    expected("one 201 and one 409; Checking down by one amount only");
    await signUpCustomer(request, "Racing Customer");
    const [checking, savings] = (await moneyAccounts(request)).accounts;
    // Six tenths of what Checking holds, so two at once cannot both pass
    // whatever this customer happens to have opened with.
    const amountCents = Math.floor(checking.balanceCents * 0.6);
    fact("amount", amountCents);
    const send = () =>
      sendMoney(request, {
        fromAccountId: checking.id,
        toAccountNumber: savings.number,
        amountCents,
      });
    // Both at the same moment: one goes through, one is refused.
    const statuses = (await Promise.all([send(), send()]))
      .map((response) => response.status())
      .sort();
    expect(statuses).toEqual([201, 409]);
    expect(await balanceOf(request, checking.id)).toBe(
      checking.balanceCents - amountCents,
    );
  });

  // Another customer's account looks like it doesn't exist, and can't be sent from.
  test("another customer's account answers 404", async ({
    request,
    playwright,
    baseURL,
  }) => {
    expected(
      "404 ACCOUNT_NOT_FOUND for their account, history and CSV; 404 sending from theirs; 404 RECIPIENT_NOT_FOUND to an unknown number; their balance unchanged",
    );
    // Customer one, and customer two in their own context.
    await signUpCustomer(request, "Curious Customer");
    const [mine] = (await moneyAccounts(request)).accounts;
    const other = await playwright.request.newContext({ baseURL });
    await signUpCustomer(other, "Private Customer");
    const [theirs] = (await moneyAccounts(other)).accounts;
    fact("theirs", theirs.id);

    // Customer one can't read customer two's account, history or statement.
    for (const path of [
      `/api/bank/accounts/${theirs.id}`,
      `/api/bank/accounts/${theirs.id}/transactions`,
      `/api/bank/accounts/${theirs.id}/statement.csv`,
    ]) {
      const response = await request.get(path);
      expect(response.status(), path).toBe(404);
      expect((await response.json()).code).toBe("ACCOUNT_NOT_FOUND");
    }
    // Nor send from it.
    const steal = await sendMoney(request, {
      fromAccountId: theirs.id,
      toAccountNumber: mine.number,
      amountCents: 100,
    });
    expect(steal.status()).toBe(404);
    // A number nobody has is "recipient not found".
    const unknown = await sendMoney(request, {
      fromAccountId: mine.id,
      toAccountNumber: "PB-0000-0000",
      amountCents: 100,
    });
    expect(unknown.status()).toBe(404);
    expect((await unknown.json()).code).toBe("RECIPIENT_NOT_FOUND");
    expect(await balanceOf(other, theirs.id)).toBe(theirs.balanceCents);
    await other.dispose();
  });

  // The demo accounts can be read but not paid into, sent from, or sent to.
  test("demo accounts can be browsed but never send or receive money", async ({
    request,
    playwright,
    baseURL,
  }) => {
    expected(
      "demo accounts PB-1000-0001 and -0002 with over 10 history rows; deposit 403; send 403 DEMO_READ_ONLY; a customer sending to it 403 DEMO_ACCOUNT",
    );
    // The demo customer's two accounts and their long history.
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

    // The demo customer can't deposit or send.
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

    // A new customer can't send money to the demo account either.
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

  // History pages 20 at a time and filters by type, amount and date; bad
  // filters are refused.
  test("history filters by date, type and amount, 20 to a page", async ({
    request,
  }) => {
    expected(
      "22 rows, 2 pages of 20 and 2, newest 2100, oldest opening; deposit 22, out 0, $10-$15 is 6, today 22, Jan 2020 0; 400 for each bad filter",
    );
    // A new customer with 21 deposits on top of the opening one.
    await signUpCustomer(request, "Busy Customer");
    const [checking] = (await moneyAccounts(request)).accounts;
    fact("checking", checking.id);
    // The opening deposit plus 21 added funds of $1.00, $2.00 ... $21.00.
    for (let dollars = 1; dollars <= 21; dollars += 1) {
      await addFunds(request, checking.id, dollars * 100);
    }
    // Reads one filtered page of the history.
    const base = `/api/bank/accounts/${checking.id}/transactions`;
    const get = async (query: string) => {
      const response = await request.get(`${base}?${query}`);
      expect(response.status(), query).toBe(200);
      return response.json();
    };

    // Page one has 20 of 22 rows.
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
    // Page two has the last two, ending with the opening deposit.
    const second = await get("page=2");
    expect(second.transactions).toHaveLength(2);
    expect(second.transactions[1].kind).toBe("opening");

    // The filters: by type, by amount, and by date.
    expect((await get("type=deposit")).total).toBe(22);
    expect((await get("type=out")).total).toBe(0);
    expect((await get("minCents=1000&maxCents=1500")).total).toBe(6);
    const today = todayUtc();
    fact("today", today);
    expect((await get(`from=${today}&to=${today}`)).total).toBe(22);
    expect((await get("from=2020-01-01&to=2020-01-31")).total).toBe(0);

    // A date that doesn't exist, dates backwards, an unknown type, amounts
    // backwards, page zero, and a page too big.
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

  // The CSV statement's rows add up to its total, and a memo that looks like
  // a spreadsheet formula is made harmless.
  test("the CSV statement adds up and defuses formulas", async ({
    request,
  }) => {
    expected(
      "200 text/csv named after the account; the header row; 3 rows; the formula memo starts with '; the rows sum to the Total line",
    );
    // A transfer with a formula as its memo, then a $10 deposit.
    await signUpCustomer(request, "Statement Customer");
    const [checking, savings] = (await moneyAccounts(request)).accounts;
    fact("checking", checking.number);
    await sendMoney(request, {
      fromAccountId: checking.id,
      toAccountNumber: savings.number,
      amountCents: 4_321,
      memo: '=HYPERLINK("http://example.test")',
    });
    await addFunds(request, checking.id, 1_000);

    // The statement downloads as CSV, named after the account.
    const response = await request.get(
      `/api/bank/accounts/${checking.id}/statement.csv`,
    );
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("text/csv");
    expect(response.headers()["content-disposition"]).toContain(
      `statement-${checking.number}-`,
    );
    // The header, then three rows, then a total.
    const lines = (await response.text()).trim().split(/\r\n/);
    expect(lines[0]).toBe("Date (UTC),Description,Memo,Type,Amount,Balance");
    const rows = lines.slice(1, -1);
    expect(rows).toHaveLength(3);
    // Text from people can't run as a spreadsheet formula.
    expect(rows[1]).toContain("'=HYPERLINK");
    // Each row's amount, in cents.
    const amounts = rows.map((row) => {
      const cells = row.match(/(-?\d+\.\d{2}),(-?\d+\.\d{2})$/);
      return Math.round(Number(cells?.[1]) * 100);
    });
    // The Total line equals the sum of the rows.
    const total = lines[lines.length - 1].match(/^Total,,,,(-?\d+\.\d{2}),$/);
    expect(total, lines[lines.length - 1]).not.toBeNull();
    expect(Math.round(Number(total?.[1]) * 100)).toBe(
      amounts.reduce((sum, cents) => sum + cents, 0),
    );
  });

  // Support staff can see a customer's profile and accounts; a customer can't.
  test("staff see a customer's accounts; customers can't", async ({
    request,
    playwright,
    baseURL,
  }) => {
    expected(
      "customer 403 on their own staff view; Support 200 with the user and 2 accounts",
    );
    // The customer tries the staff view of themselves.
    const customer = await signUpCustomer(request, "Viewed Customer");
    const forbidden = await request.get(`/api/bank/admin/users/${customer.id}`);
    expect(forbidden.status()).toBe(403);

    // The demo Support person sees it.
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

  // Recent activity shows at most 8 moves, newest first.
  test("recent activity lists the latest moves, newest first", async ({
    request,
  }) => {
    expected("200; at most 8 rows; the first is the 999-cent deposit");
    // A new customer deposits $9.99.
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
