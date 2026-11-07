// The type of a browser page.
import { type Page } from "@playwright/test";
// Playwright's test tools, with the [RESULT] block printed after every test.
import {
  expect,
  expected,
  fact,
  test,
} from "../../../framework/fixtures/resultBlock";
// Arms a planted bug for one runKey.
import { armFlags } from "../../../framework/helpers/flags";
// The bank helpers: the demo people, accounts, money moves, GraphQL, sign-in.
import {
  addFunds,
  addPayee,
  DEMO,
  errorCode,
  graphql,
  signIn,
  balanceOf,
  moneyAccounts,
  sendMoney,
  signUpCustomer,
  todayUtc,
  uniqueRunKey,
  usd,
} from "../../../framework/helpers/bank";

// The shape the two owner-leak queries below read back.
interface GraphqlCounterparty {
  account: {
    transactions: {
      transactions: {
        counterpartyDetails: {
          accountNumber: string;
          fullName: string | null;
          email: string | null;
        };
      }[];
    };
  };
}

// Playground Bank's planted money bugs (REPORT: by design, never "fixed").
// Each test arms one flag for its own runKey, so the rest of the parallel suite
// keeps the correct behavior. Without the flag, the same steps behave
// correctly: api-bank-money.spec.ts and react-bank-money.spec.ts cover that.

// On the transfer page: pick the "to" account, type the amount, press
// Review, and wait for the summary.
async function reviewOwnTransfer(page: Page, toId: string, amount: string) {
  fact("transfer", `${amount} to ${toId}`);
  await page.getByTestId("transfer-to-account").selectOption(toId);
  await page.getByTestId("transfer-amount").fill(amount);
  await page.getByTestId("transfer-review").click();
  await expect(page.getByTestId("transfer-summary")).toBeVisible();
}

// How many outgoing transfers an account's history holds.
async function transfersOut(page: Page, accountId: string) {
  const response = await page.request.get(
    `/api/bank/accounts/${accountId}/transactions?type=out`,
  );
  return (await response.json()).total as number;
}

test.describe("Playground Bank planted money bugs", () => {
  // With the bug armed, the transfer page accepts a minus sign and the money
  // moves backwards.
  test("bankNegativeTransfer: a negative amount pulls money the wrong way", async ({
    page,
  }) => {
    expected(
      "with bankNegativeTransfer armed: the summary reads -$500.00, a receipt shows, Checking +50000 and Savings -50000",
    );
    // Arm the bug; a new customer signed in on the page.
    const runKey = uniqueRunKey("negative");
    await armFlags(page.request, runKey, { bankNegativeTransfer: true });
    await signUpCustomer(page.request, "Negative Customer");
    const [checking, savings] = (await moneyAccounts(page.request)).accounts;
    fact("checking", checking.id);
    fact("savings", savings.id);

    // The form lets the minus sign through...
    await page.goto(`/app/bank/transfer?runKey=${runKey}`);
    await reviewOwnTransfer(page, savings.id, "-500");
    await expect(page.getByTestId("summary-amount")).toHaveText("-$500.00");
    await page.getByTestId("transfer-confirm").click();
    await expect(page.getByTestId("transfer-receipt")).toBeVisible();

    // ...and the server takes it: the sender gains, the recipient loses.
    expect(await balanceOf(page.request, checking.id)).toBe(
      checking.balanceCents + 50_000,
    );
    expect(await balanceOf(page.request, savings.id)).toBe(
      savings.balanceCents - 50_000,
    );
  });

  // With the bug armed, a double-click on Confirm sends two transfers.
  test("bankDoubleSubmit: a double-click sends the transfer twice", async ({
    page,
  }) => {
    expected(
      "with bankDoubleSubmit armed: a double-click makes 2 outgoing transfers and Checking -20000",
    );
    // Arm the bug; a new customer signed in on the page.
    const runKey = uniqueRunKey("double");
    await armFlags(page.request, runKey, { bankDoubleSubmit: true });
    await signUpCustomer(page.request, "Double Customer");
    const [checking, savings] = (await moneyAccounts(page.request)).accounts;
    fact("checking", checking.id);

    // Review $100, then double-click Confirm.
    await page.goto(`/app/bank/transfer?runKey=${runKey}`);
    await reviewOwnTransfer(page, savings.id, "100");
    await page.getByTestId("transfer-confirm").dblclick();
    await expect(page.getByTestId("transfer-receipt")).toBeVisible();

    // Two transfers went out.
    await expect.poll(() => transfersOut(page, checking.id)).toBe(2);
    expect(await balanceOf(page.request, checking.id)).toBe(
      checking.balanceCents - 20_000,
    );
  });

  // Without the bug, the same double-click sends one transfer.
  test("without bankDoubleSubmit, a double-click sends one transfer", async ({
    page,
  }) => {
    expected("a double-click makes 1 outgoing transfer and Checking -10000");
    // A new customer signed in on the page.
    await signUpCustomer(page.request, "Single Customer");
    const [checking, savings] = (await moneyAccounts(page.request)).accounts;
    fact("checking", checking.id);

    // Review $100, then double-click Confirm.
    await page.goto("/app/bank/transfer");
    await reviewOwnTransfer(page, savings.id, "100");
    await page.getByTestId("transfer-confirm").dblclick();
    await expect(page.getByTestId("transfer-receipt")).toBeVisible();

    // One transfer went out.
    expect(await transfersOut(page, checking.id)).toBe(1);
    expect(await balanceOf(page.request, checking.id)).toBe(
      checking.balanceCents - 10_000,
    );
  });

  // With the bug armed, two transfers at once both pass the balance check.
  test("bankTransferRace: two transfers at once overdraw the account", async ({
    request,
  }) => {
    expected(
      "with bankTransferRace armed: two 80% transfers at once both 201, Checking down by both",
    );
    // Arm the bug; a new customer.
    const runKey = uniqueRunKey("race");
    await armFlags(request, runKey, { bankTransferRace: true });
    await signUpCustomer(request, "Race Customer");
    const [checking, savings] = (await moneyAccounts(request)).accounts;

    // Each one is 80% of whatever this customer opened with: either alone is
    // fine, both are not.
    const amountCents = Math.floor(checking.balanceCents * 0.8);
    fact("amount", amountCents);
    const send = () =>
      sendMoney(
        request,
        {
          fromAccountId: checking.id,
          toAccountNumber: savings.number,
          amountCents,
        },
        { runKey },
      );
    const statuses = (await Promise.all([send(), send()])).map((response) =>
      response.status(),
    );
    expect(statuses).toEqual([201, 201]);
    // Both went through, so the account is overdrawn by the overlap.
    expect(await balanceOf(request, checking.id)).toBe(
      checking.balanceCents - amountCents * 2,
    );
  });

  // With the bug armed, the Bank page keeps showing the balance from before
  // a transfer until it is reloaded.
  test("bankStaleBalance: the Bank page keeps the old balance after a transfer", async ({
    page,
  }) => {
    expected(
      "with bankStaleBalance armed: the receipt shows the new balance, the overview still the old one, the reload the new one",
    );
    // Arm the bug; a new customer signed in on the page.
    const runKey = uniqueRunKey("stale");
    await armFlags(page.request, runKey, { bankStaleBalance: true });
    await signUpCustomer(page.request, "Stale Customer");
    const [checking, savings] = (await moneyAccounts(page.request)).accounts;
    fact("checking", checking.id);
    fact("balance", checking.balanceCents);

    // The Bank page shows Checking's balance.
    await page.goto(`/app/bank?runKey=${runKey}`);
    await expect(page.getByTestId(`account-balance-${checking.id}`)).toHaveText(
      usd(checking.balanceCents),
    );
    // Clicking through keeps the page's data in memory, like a real visit.
    await page.getByTestId("bank-transfer-link").click();
    await reviewOwnTransfer(page, savings.id, "1000");
    await page.getByTestId("transfer-confirm").click();
    await expect(page.getByTestId("receipt-from-balance")).toHaveText(
      usd(checking.balanceCents - 100_000),
    );
    await page.getByTestId("transfer-done").click();

    // The receipt shows the new balance; the overview still shows the old one.
    await expect(page.getByTestId("bank-page")).toBeVisible();
    await expect(page.getByTestId(`account-balance-${checking.id}`)).toHaveText(
      usd(checking.balanceCents),
    );
    // A reload throws the stale copy away, so the real balance shows.
    await page.reload();
    await expect(page.getByTestId(`account-balance-${checking.id}`)).toHaveText(
      usd(checking.balanceCents - 100_000),
    );
  });

  // With the bug armed, a date range that ends today leaves today out.
  test("bankDateFilterOffByOne: the date filter leaves out the last day", async ({
    request,
  }) => {
    expected(
      "today-to-today: 2 rows clean; 0 with bankDateFilterOffByOne armed",
    );
    // Arm the bug; a new customer with one deposit today.
    const runKey = uniqueRunKey("dates");
    await armFlags(request, runKey, { bankDateFilterOffByOne: true });
    await signUpCustomer(request, "Dated Customer");
    const [checking] = (await moneyAccounts(request)).accounts;
    await addFunds(request, checking.id, 1_000);
    const today = todayUtc();
    const query = `from=${today}&to=${today}`;
    fact("today", today);

    // Clean: the opening deposit and today's one.
    const correct = await request.get(
      `/api/bank/accounts/${checking.id}/transactions?${query}`,
    );
    expect((await correct.json()).total).toBe(2);
    // Armed: none.
    const buggy = await request.get(
      `/api/bank/accounts/${checking.id}/transactions?${query}&runKey=${runKey}`,
    );
    expect((await buggy.json()).total).toBe(0);
  });

  // With the bug armed, the statement's total leaves out the last row.
  test("bankStatementTotal: the statement's total leaves out the last row", async ({
    request,
  }) => {
    expected(
      "with bankStatementTotal armed: the $42 deposit row is there, but the Total equals the opening amount only",
    );
    // Arm the bug; a new customer with a $42 deposit.
    const runKey = uniqueRunKey("total");
    await armFlags(request, runKey, { bankStatementTotal: true });
    await signUpCustomer(request, "Totalled Customer");
    const [checking] = (await moneyAccounts(request)).accounts;
    fact("checking", checking.id);
    await addFunds(request, checking.id, 4_200);

    // The statement with the bug armed.
    const response = await request.get(
      `/api/bank/accounts/${checking.id}/statement.csv?runKey=${runKey}`,
    );
    const text = await response.text();
    // Two rows -- the opening deposit and the $42 -- but the total only
    // counts the first, whatever the opening amount happens to be.
    const opening = (checking.balanceCents / 100).toFixed(2);
    const after = ((checking.balanceCents + 4_200) / 100).toFixed(2);
    fact("opening", opening);
    expect(text).toContain(`deposit,42.00,${after}`);
    expect(text).toMatch(new RegExp(`Total,,,,${opening},\r\n$`));
  });

  // With the bug armed, the monthly payment is cut down instead of rounded,
  // so the schedule never pays the loan off.
  test("bankLoanRounding: the payments don't pay the loan off", async ({
    request,
  }) => {
    expected(
      "for the first amount where the armed payment is lower: same APR; clean schedule ends at 0; armed schedule ends above 0",
    );
    // Arm the bug; a new customer.
    const runKey = uniqueRunKey("rounding");
    await armFlags(request, runKey, { bankLoanRounding: true });
    await signUpCustomer(request, "Rounding Customer");

    // The bug floors the exact payment instead of rounding it. The two differ
    // only when the fraction of a cent is half or more, so for any one amount
    // the bug has something to show about every second time - and which times
    // depends on this customer's own rate, drawn per customer. On an amount
    // whose fraction is below half a cent the buggy quote equals the correct
    // one and the loan settles normally. That is not the bug disappearing, it
    // is this amount having nothing to show.
    //
    // Five fixed amounts were tried before, and all five landed below half a
    // cent about once in six full runs, failing the test and the pre-push hook.
    // Forty amounts across the four terms are tried now, and the first that
    // actually moves the payment is the one asserted on. For all forty to miss
    // is one chance in about a million million; if it ever happens the failure
    // below says so instead of blaming the bug. Usually the first or second
    // amount is enough, so the extra cost is nil.
    // Terms must be one of bank/loans.js TERM_MONTHS, and amounts between
    // MIN_LOAN_CENTS and MAX_LOAN_CENTS; anything else is a 400 rather than a
    // quote. The odd amounts are deliberate: a round number is the most likely
    // to divide into whole cents and show nothing.
    const terms = [12, 24, 36, 60];
    const candidates = Array.from({ length: 40 }, (_, i) => ({
      amountCents: 1_234_567 + i * 100_003,
      termMonths: terms[i % terms.length],
    }));

    // A quote for one amount and term, clean or for a runKey.
    const quote = async (
      amountCents: number,
      termMonths: number,
      key?: string,
    ) => {
      const query = `amountCents=${amountCents}&termMonths=${termMonths}`;
      const response = await request.get(
        `/api/bank/loans/quote?${query}${key ? `&runKey=${key}` : ""}`,
      );
      expect(
        response.ok(),
        `Quote for ${amountCents} over ${termMonths} months was rejected (${response.status()}): ${await response.text()}`,
      ).toBeTruthy();
      return response.json();
    };

    // The first amount that shows the bug, and every payment pair tried.
    let picked: {
      amountCents: number;
      termMonths: number;
      correct: Record<string, any>;
      buggy: Record<string, any>;
    } | null = null;
    const payments: string[] = [];

    // Try each amount clean and armed until the armed payment is lower.
    for (const { amountCents, termMonths } of candidates) {
      const correct = await quote(amountCents, termMonths);
      const buggy = await quote(amountCents, termMonths, runKey);

      // True of every amount, fraction or not: the rate is untouched and
      // cutting can only ever lower the payment, never raise it.
      expect(buggy.aprBasisPoints).toBe(correct.aprBasisPoints);
      expect(buggy.monthlyPaymentCents).toBeLessThanOrEqual(
        correct.monthlyPaymentCents,
      );

      payments.push(
        `${amountCents}/${termMonths}: ${correct.monthlyPaymentCents} -> ${buggy.monthlyPaymentCents}`,
      );

      if (buggy.monthlyPaymentCents < correct.monthlyPaymentCents) {
        picked = { amountCents, termMonths, correct, buggy };
        break;
      }
    }
    fact("tried", payments);

    expect(
      picked,
      `Every amount tried produced a payment whose fraction was below half a cent, so the bug had nothing to show. Not a failure of the bug itself. Tried: ${payments.join("; ")}`,
    ).not.toBeNull();

    const { amountCents, termMonths, correct, buggy } = picked!;
    const last = termMonths - 1;

    // The correct quote always settles exactly.
    expect(correct.schedule[last].balanceCents).toBe(0);
    expect(correct.totalRepaidCents).toBe(
      amountCents + correct.totalInterestCents,
    );

    // The buggy one underpays every month, so the final month never settles.
    expect(buggy.schedule[last].balanceCents).toBeGreaterThan(0);
    expect(buggy.totalRepaidCents).not.toBe(
      amountCents + buggy.totalInterestCents,
    );
  });

  // With the bug armed, any customer can delete another customer's payee.
  test("bankPayeeIdor: any customer can delete someone else's payee", async ({
    request,
    playwright,
    baseURL,
  }) => {
    expected(
      "clean delete of the victim's payee 404; armed (bankPayeeIdor) 200 and the victim has no payees",
    );
    // Arm the bug; an attacker, and a victim with a payee.
    const runKey = uniqueRunKey("idor");
    await armFlags(request, runKey, { bankPayeeIdor: true });
    await signUpCustomer(request, "Attacking Customer");
    const victim = await playwright.request.newContext({ baseURL });
    await signUpCustomer(victim, "Victim Customer");
    const payee = await addPayee(victim, "Victim Power", "VP-1");
    fact("payeeId", payee.id);

    // Clean: not found.
    const blocked = await request.delete(`/api/bank/payees/${payee.id}`, {
      data: {},
    });
    expect(blocked.status()).toBe(404);

    // Armed: deleted, and gone from the victim's list.
    const deleted = await request.delete(
      `/api/bank/payees/${payee.id}?runKey=${runKey}`,
      { data: {} },
    );
    expect(deleted.status()).toBe(200);
    expect(
      (await (await victim.get("/api/bank/payees")).json()).payees,
    ).toEqual([]);
    await victim.dispose();
  });

  // With the bug armed, marking everything read leaves the unread count as it was.
  test("bankNotificationCount: reading notifications never lowers the count", async ({
    request,
    playwright,
    baseURL,
  }) => {
    expected(
      "after read-all: unread 0 clean; 1 with bankNotificationCount armed",
    );
    // Arm the bug; a customer gets one payment from a sender, then reads all.
    const runKey = uniqueRunKey("count");
    await armFlags(request, runKey, { bankNotificationCount: true });
    await signUpCustomer(request, "Counted Customer");
    const [checking] = (await moneyAccounts(request)).accounts;
    const sender = await playwright.request.newContext({ baseURL });
    await signUpCustomer(sender, "Counting Sender");
    const [theirs] = (await moneyAccounts(sender)).accounts;
    await sendMoney(sender, {
      fromAccountId: theirs.id,
      toAccountNumber: checking.number,
      amountCents: 100,
    });
    await request.post("/api/bank/notifications/read-all", { data: {} });

    // Clean: nothing unread. Armed: still one.
    const correct = await (await request.get("/api/bank/notifications")).json();
    expect(correct.unread).toBe(0);
    const buggy = await (
      await request.get(`/api/bank/notifications?runKey=${runKey}`)
    ).json();
    expect(buggy.unread).toBe(1);
    await sender.dispose();
  });

  // With the bug armed, a money request can be paid twice.
  test("bankRequestDoublePay: a paid request can be paid again", async ({
    request,
    playwright,
    baseURL,
  }) => {
    expected(
      "with bankRequestDoublePay armed: paying the $50 request twice is 200 both times, the asker +10000",
    );
    // Arm the bug; the asker asks this customer for $50.
    const runKey = uniqueRunKey("doublepay");
    await armFlags(request, runKey, { bankRequestDoublePay: true });
    await signUpCustomer(request, "Double Paying Customer");
    const [mine] = (await moneyAccounts(request)).accounts;
    const asker = await playwright.request.newContext({ baseURL });
    await signUpCustomer(asker, "Double Asking Customer");
    const [theirs] = (await moneyAccounts(asker)).accounts;
    const { request: asked } = await (
      await asker.post("/api/bank/requests", {
        data: {
          toAccountId: theirs.id,
          fromAccountNumber: mine.number,
          amountCents: 5_000,
        },
      })
    ).json();
    fact("requestId", asked.id);

    // Pay it twice with the runKey: both go through.
    const pay = () =>
      request.post(`/api/bank/requests/${asked.id}/pay?runKey=${runKey}`, {
        data: { fromAccountId: mine.id },
      });
    expect((await pay()).status()).toBe(200);
    expect((await pay()).status()).toBe(200);
    expect(await balanceOf(asker, theirs.id)).toBe(
      theirs.balanceCents + 10_000,
    );
    await asker.dispose();
  });

  // With the bug armed, a customer's reply leaves the ticket on Answered
  // instead of opening it again.
  test("bankSupportStatus: the customer's reply leaves the ticket on Answered", async ({
    request,
    playwright,
    baseURL,
  }) => {
    expected(
      "clean: the customer's reply reopens the ticket (open); armed (bankSupportStatus): it stays answered",
    );
    // Arm the bug; a short way for the customer to open a ticket; staff signed in.
    const runKey = uniqueRunKey("ticket");
    await armFlags(request, runKey, { bankSupportStatus: true });
    await signUpCustomer(request, "Status Customer");
    const ask = async () =>
      (
        await (
          await request.post("/api/bank/support", {
            data: { subject: "A question", body: "Hello support" },
          })
        ).json()
      ).ticket;
    const staff = await playwright.request.newContext({ baseURL });
    await signIn(staff, DEMO.support);

    // Clean: staff answer, the customer replies, it is open again.
    const correct = await ask();
    fact("clean ticket", correct.id);
    await staff.post(`/api/bank/support/${correct.id}/messages`, {
      data: { body: "Hi!" },
    });
    const back = await request.post(
      `/api/bank/support/${correct.id}/messages`,
      {
        data: { body: "One more thing" },
      },
    );
    expect((await back.json()).ticket.status).toBe("open");

    // Armed: the same steps leave it answered.
    const buggy = await ask();
    fact("armed ticket", buggy.id);
    await staff.post(`/api/bank/support/${buggy.id}/messages`, {
      data: { body: "Hi!" },
    });
    const stuck = await request.post(
      `/api/bank/support/${buggy.id}/messages?runKey=${runKey}`,
      { data: { body: "One more thing" } },
    );
    expect((await stuck.json()).ticket.status).toBe("answered");
    await staff.dispose();
  });

  // --- GraphQL (phase 2d) ------------------------------------------------------

  // The same bugs through the GraphQL door. Practice mode turns every bug on at
  // once, so a surface that stayed correct would read as a GraphQL fault rather
  // than the planted bug. The matching REST tests are above.

  // With the bug armed, a negative GraphQL transfer moves money backwards.
  test("bankNegativeTransfer: a negative amount pulls money the wrong way in GraphQL too", async ({
    request,
  }) => {
    expected(
      "clean: VALIDATION_FAILED, balance unchanged; armed: no errors, Checking +50000, Savings -50000",
    );
    // Arm the bug; a new customer and a -$500 transfer mutation.
    const runKey = uniqueRunKey("gqlnegative");
    await armFlags(request, runKey, { bankNegativeTransfer: true });
    await signUpCustomer(request, "Negative GraphQL Customer");
    const [checking, savings] = (await moneyAccounts(request)).accounts;
    fact("checking", checking.id);
    const send = `mutation Send($from: ID!, $to: String!, $cents: Cents!) {
        transfer(fromAccountId: $from, toAccountNumber: $to, amountCents: $cents) {
          transfer { amountCents }
        }
      }`;
    const variables = {
      from: checking.id,
      to: savings.number,
      cents: -50_000,
    };

    // Without the flag GraphQL refuses it...
    const refused = await graphql(request, send, variables);
    expect(errorCode(refused)).toBe("VALIDATION_FAILED");
    expect(await balanceOf(request, checking.id)).toBe(checking.balanceCents);

    // ...and with it the money moves backwards, as it does through REST.
    const taken = await graphql(request, send, variables, runKey);
    expect(taken.errors).toBeUndefined();
    expect(await balanceOf(request, checking.id)).toBe(
      checking.balanceCents + 50_000,
    );
    expect(await balanceOf(request, savings.id)).toBe(
      savings.balanceCents - 50_000,
    );
  });

  // With the bug armed, two GraphQL transfers of the whole balance both go through.
  test("bankTransferRace: two GraphQL transfers at once overdraw the account", async ({
    request,
  }) => {
    expected(
      "with bankTransferRace armed: two full-balance transfers at once, no errors, Checking at minus the balance",
    );
    // Arm the bug; a new customer and a transfer of everything in Checking.
    const runKey = uniqueRunKey("gqlrace");
    await armFlags(request, runKey, { bankTransferRace: true });
    await signUpCustomer(request, "Racing GraphQL Customer");
    const [checking, savings] = (await moneyAccounts(request)).accounts;
    const most = checking.balanceCents;
    fact("amount", most);
    const send = `mutation Send($from: ID!, $to: String!, $cents: Cents!) {
        transfer(fromAccountId: $from, toAccountNumber: $to, amountCents: $cents) {
          transfer { id }
        }
      }`;
    const variables = { from: checking.id, to: savings.number, cents: most };

    // Both read the old balance, both pass the check, both take the money.
    const [first, second] = await Promise.all([
      graphql(request, send, variables, runKey),
      graphql(request, send, variables, runKey),
    ]);
    expect(first.errors).toBeUndefined();
    expect(second.errors).toBeUndefined();
    expect(await balanceOf(request, checking.id)).toBe(-most);
  });

  // With the bug armed, GraphQL's date filter leaves out today too.
  test("bankDateFilterOffByOne: the GraphQL history filter leaves out the last day", async ({
    request,
  }) => {
    expected("today-to-today: more than 0 rows clean; 0 armed");
    // Arm the bug; a new customer with a deposit today.
    const runKey = uniqueRunKey("gqldate");
    await armFlags(request, runKey, { bankDateFilterOffByOne: true });
    await signUpCustomer(request, "Dated GraphQL Customer");
    const [checking] = (await moneyAccounts(request)).accounts;
    await addFunds(request, checking.id, 4_200);
    const today = todayUtc();
    fact("today", today);
    const history = `query History($id: ID!, $to: String!) {
        account(id: $id) { transactions(from: $to, to: $to) { total } }
      }`;
    const variables = { id: checking.id, to: today };

    // Clean: today's rows are there.
    type Page = { account: { transactions: { total: number } } };
    const correct = await graphql<Page>(request, history, variables);
    expect(correct.data!.account.transactions.total).toBeGreaterThan(0);

    // Today's rows fall outside a range that ends today.
    const missing = await graphql<Page>(request, history, variables, runKey);
    expect(missing.data!.account.transactions.total).toBe(0);
  });

  // With the bug armed, the counterparty on a transfer shows the other
  // customer's name and email.
  test("bankGraphqlOwnerLeak: a nested field leaks another customer's name and email", async ({
    request,
    playwright,
    baseURL,
  }) => {
    expected(
      "clean: counterparty is only the account number; armed (bankGraphqlOwnerLeak): plus the other customer's name and email",
    );
    // Arm the bug; customer one sends $10 to customer two.
    const runKey = uniqueRunKey("gqlleak");
    await armFlags(request, runKey, { bankGraphqlOwnerLeak: true });
    await signUpCustomer(request, "Leaking Customer");
    const [checking] = (await moneyAccounts(request)).accounts;
    const other = await playwright.request.newContext({ baseURL });
    const them = await signUpCustomer(other, "Leaked Customer");
    const [theirs] = (await moneyAccounts(other)).accounts;
    await sendMoney(request, {
      fromAccountId: checking.id,
      toAccountNumber: theirs.number,
      amountCents: 1_000,
    });
    // Who was the payment to?
    const query = `query Who($id: ID!) {
        account(id: $id) {
          transactions(type: "out") {
            transactions { counterpartyDetails { accountNumber fullName email } }
          }
        }
      }`;

    // Without the flag the nested object carries only the account number...
    const correct = await graphql<GraphqlCounterparty>(request, query, {
      id: checking.id,
    });
    expect(
      correct.data!.account.transactions.transactions[0].counterpartyDetails,
    ).toEqual({
      accountNumber: theirs.number,
      fullName: null,
      email: null,
    });

    // ...and with it, the other customer's name and email come back.
    const leaked = await graphql<GraphqlCounterparty>(
      request,
      query,
      { id: checking.id },
      runKey,
    );
    expect(
      leaked.data!.account.transactions.transactions[0].counterpartyDetails,
    ).toEqual({
      accountNumber: theirs.number,
      fullName: "Leaked Customer",
      email: them.email,
    });
    await other.dispose();
  });

  // With the bug armed, a server error shows the database's message and a stack trace.
  test("bankGraphqlErrorDetail: an error leaks the internal message and stack", async ({
    request,
  }) => {
    expected(
      "clean: 'Something went wrong.' and no stack; armed (bankGraphqlErrorDetail): SERVER_ERROR with 'invalid byte sequence' and a stack naming node_modules",
    );
    // Arm the bug; a transfer whose memo holds a null byte.
    const runKey = uniqueRunKey("gqlerror");
    await armFlags(request, runKey, { bankGraphqlErrorDetail: true });
    await signUpCustomer(request, "Erroring Customer");
    const [checking, savings] = (await moneyAccounts(request)).accounts;
    fact("checking", checking.id);
    // A null byte is refused by Postgres itself, below the bank's own checks.
    const query = `mutation Send($from: ID!, $to: String!, $memo: String) {
        transfer(fromAccountId: $from, toAccountNumber: $to, amountCents: 100, memo: $memo) { replayed }
      }`;
    const variables = {
      from: checking.id,
      to: savings.number,
      memo: "bad\u0000memo",
    };

    // Clean: a plain message, no stack.
    const hidden = await graphql(request, query, variables);
    expect(hidden.errors?.[0].message).toBe("Something went wrong.");
    expect(hidden.errors?.[0].extensions?.stacktrace).toBeUndefined();

    // Armed: the database's words and a stack trace.
    const leaked = await graphql(request, query, variables, runKey);
    expect(leaked.errors?.[0].extensions?.code).toBe("SERVER_ERROR");
    // The database's own words, which a caller should never be shown.
    expect(leaked.errors?.[0].message).toContain("invalid byte sequence");
    // Plus a stack naming server files. The checkout path differs between the
    // host and the CI container, so match on node_modules, not on a directory.
    const stack = leaked.errors?.[0].extensions?.stacktrace;
    expect(Array.isArray(stack) && stack.length).toBeTruthy();
    expect(stack!.join(" ")).toContain("node_modules");
  });

  // With the bug armed, a query past the depth limit runs.
  test("bankGraphqlDepth: a query with no depth limit is allowed through", async ({
    request,
  }) => {
    expected(
      "clean: QUERY_TOO_DEEP; armed (bankGraphqlDepth): no errors and data comes back",
    );
    // Arm the bug; a new customer and a query nested past the limit.
    const runKey = uniqueRunKey("gqldepth");
    await armFlags(request, runKey, { bankGraphqlDepth: true });
    await signUpCustomer(request, "Deep Customer");
    const [checking] = (await moneyAccounts(request)).accounts;
    fact("checking", checking.id);
    const deep = `query Deep($id: ID!) {
        account(id: $id) {
          transactions { transactions { transfer { fromAccount {
            transactions { transactions { transfer { fromAccount { number } } } } } } } }
        }
      }`;

    // Clean: refused.
    const refused = await graphql(request, deep, { id: checking.id });
    expect(errorCode(refused)).toBe("QUERY_TOO_DEEP");

    // Armed: it runs.
    const allowed = await graphql(request, deep, { id: checking.id }, runKey);
    expect(allowed.errors).toBeUndefined();
    expect(allowed.data).toBeTruthy();
  });
});
