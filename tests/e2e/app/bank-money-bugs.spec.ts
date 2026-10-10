import { expect, test, type Page } from "@playwright/test";
import { armFlags } from "./_helpers";
import {
  addFunds,
  addPayee,
  DEMO,
  signIn,
  balanceOf,
  moneyAccounts,
  sendMoney,
  signUpCustomer,
  STARTER_CENTS,
  todayUtc,
  uniqueRunKey,
} from "./_bank";

// Playground Bank's planted money bugs (REPORT: by design, never "fixed").
// Each test arms one flag for its own runKey, so the rest of the parallel suite
// keeps the correct behavior. Without the flag, the same steps behave
// correctly: api-bank-money.spec.ts and react-bank-money.spec.ts cover that.

async function reviewOwnTransfer(page: Page, toId: string, amount: string) {
  await page.getByTestId("transfer-to-account").selectOption(toId);
  await page.getByTestId("transfer-amount").fill(amount);
  await page.getByTestId("transfer-review").click();
  await expect(page.getByTestId("transfer-summary")).toBeVisible();
}

async function transfersOut(page: Page, accountId: string) {
  const response = await page.request.get(
    `/api/bank/accounts/${accountId}/transactions?type=out`,
  );
  return (await response.json()).total as number;
}

test.describe("Playground Bank planted money bugs", () => {
  test("bankNegativeTransfer: a negative amount pulls money the wrong way", async ({
    page,
  }) => {
    const runKey = uniqueRunKey("negative");
    await armFlags(page.request, runKey, { bankNegativeTransfer: true });
    await signUpCustomer(page.request, "Negative Customer");
    const [checking, savings] = (await moneyAccounts(page.request)).accounts;

    // The form lets the minus sign through...
    await page.goto(`/app/bank/transfer?runKey=${runKey}`);
    await reviewOwnTransfer(page, savings.id, "-500");
    await expect(page.getByTestId("summary-amount")).toHaveText("-$500.00");
    await page.getByTestId("transfer-confirm").click();
    await expect(page.getByTestId("transfer-receipt")).toBeVisible();

    // ...and the server takes it: the sender gains, the recipient loses.
    expect(await balanceOf(page.request, checking.id)).toBe(
      STARTER_CENTS.checking + 50_000,
    );
    expect(await balanceOf(page.request, savings.id)).toBe(
      STARTER_CENTS.savings - 50_000,
    );
  });

  test("bankDoubleSubmit: a double-click sends the transfer twice", async ({
    page,
  }) => {
    const runKey = uniqueRunKey("double");
    await armFlags(page.request, runKey, { bankDoubleSubmit: true });
    await signUpCustomer(page.request, "Double Customer");
    const [checking, savings] = (await moneyAccounts(page.request)).accounts;

    await page.goto(`/app/bank/transfer?runKey=${runKey}`);
    await reviewOwnTransfer(page, savings.id, "100");
    await page.getByTestId("transfer-confirm").dblclick();
    await expect(page.getByTestId("transfer-receipt")).toBeVisible();

    await expect.poll(() => transfersOut(page, checking.id)).toBe(2);
    expect(await balanceOf(page.request, checking.id)).toBe(
      STARTER_CENTS.checking - 20_000,
    );
  });

  test("without bankDoubleSubmit, a double-click sends one transfer", async ({
    page,
  }) => {
    await signUpCustomer(page.request, "Single Customer");
    const [checking, savings] = (await moneyAccounts(page.request)).accounts;

    await page.goto("/app/bank/transfer");
    await reviewOwnTransfer(page, savings.id, "100");
    await page.getByTestId("transfer-confirm").dblclick();
    await expect(page.getByTestId("transfer-receipt")).toBeVisible();

    expect(await transfersOut(page, checking.id)).toBe(1);
    expect(await balanceOf(page.request, checking.id)).toBe(
      STARTER_CENTS.checking - 10_000,
    );
  });

  test("bankTransferRace: two transfers at once overdraw the account", async ({
    request,
  }) => {
    const runKey = uniqueRunKey("race");
    await armFlags(request, runKey, { bankTransferRace: true });
    await signUpCustomer(request, "Race Customer");
    const [checking, savings] = (await moneyAccounts(request)).accounts;

    // Each one is 80% of the balance: either alone is fine, both are not.
    const send = () =>
      sendMoney(
        request,
        {
          fromAccountId: checking.id,
          toAccountNumber: savings.number,
          amountCents: 2_000_000,
        },
        { runKey },
      );
    const statuses = (await Promise.all([send(), send()])).map((response) =>
      response.status(),
    );
    expect(statuses).toEqual([201, 201]);
    expect(await balanceOf(request, checking.id)).toBe(-1_500_000);
  });

  test("bankStaleBalance: the Bank page keeps the old balance after a transfer", async ({
    page,
  }) => {
    const runKey = uniqueRunKey("stale");
    await armFlags(page.request, runKey, { bankStaleBalance: true });
    await signUpCustomer(page.request, "Stale Customer");
    const [checking, savings] = (await moneyAccounts(page.request)).accounts;

    await page.goto(`/app/bank?runKey=${runKey}`);
    await expect(page.getByTestId(`account-balance-${checking.id}`)).toHaveText(
      "$25,000.00",
    );
    // Clicking through keeps the page's data in memory, like a real visit.
    await page.getByTestId("bank-transfer-link").click();
    await reviewOwnTransfer(page, savings.id, "1000");
    await page.getByTestId("transfer-confirm").click();
    await expect(page.getByTestId("receipt-from-balance")).toHaveText(
      "$24,000.00",
    );
    await page.getByTestId("transfer-done").click();

    // The receipt says $24,000.00, the overview still says $25,000.00.
    await expect(page.getByTestId("bank-page")).toBeVisible();
    await expect(page.getByTestId(`account-balance-${checking.id}`)).toHaveText(
      "$25,000.00",
    );
    await page.reload();
    await expect(page.getByTestId(`account-balance-${checking.id}`)).toHaveText(
      "$24,000.00",
    );
  });

  test("bankDateFilterOffByOne: the date filter leaves out the last day", async ({
    request,
  }) => {
    const runKey = uniqueRunKey("dates");
    await armFlags(request, runKey, { bankDateFilterOffByOne: true });
    await signUpCustomer(request, "Dated Customer");
    const [checking] = (await moneyAccounts(request)).accounts;
    await addFunds(request, checking.id, 1_000);
    const today = todayUtc();
    const query = `from=${today}&to=${today}`;

    const correct = await request.get(
      `/api/bank/accounts/${checking.id}/transactions?${query}`,
    );
    expect((await correct.json()).total).toBe(2);
    const buggy = await request.get(
      `/api/bank/accounts/${checking.id}/transactions?${query}&runKey=${runKey}`,
    );
    expect((await buggy.json()).total).toBe(0);
  });

  test("bankStatementTotal: the statement's total leaves out the last row", async ({
    request,
  }) => {
    const runKey = uniqueRunKey("total");
    await armFlags(request, runKey, { bankStatementTotal: true });
    await signUpCustomer(request, "Totalled Customer");
    const [checking] = (await moneyAccounts(request)).accounts;
    await addFunds(request, checking.id, 4_200);

    const response = await request.get(
      `/api/bank/accounts/${checking.id}/statement.csv?runKey=${runKey}`,
    );
    const text = await response.text();
    // Rows: 25000.00 + 42.00, but the total only counts the first.
    expect(text).toContain("deposit,42.00,25042.00");
    expect(text).toMatch(/Total,,,,25000\.00,\r\n$/);
  });

  test("bankLoanRounding: the payments don't pay the loan off", async ({
    request,
  }) => {
    const runKey = uniqueRunKey("rounding");
    await armFlags(request, runKey, { bankLoanRounding: true });
    await signUpCustomer(request, "Rounding Customer");
    const query = "amountCents=1200000&termMonths=12";

    const correct = await (
      await request.get(`/api/bank/loans/quote?${query}`)
    ).json();
    expect(correct.schedule[11].balanceCents).toBe(0);
    expect(correct.totalRepaidCents).toBe(
      1_200_000 + correct.totalInterestCents,
    );

    const buggy = await (
      await request.get(`/api/bank/loans/quote?${query}&runKey=${runKey}`)
    ).json();
    // The cents are cut off each payment, and the last month never settles.
    expect(buggy.monthlyPaymentCents).toBe(correct.monthlyPaymentCents - 1);
    expect(buggy.schedule[11].balanceCents).toBeGreaterThan(0);
    expect(buggy.totalRepaidCents).not.toBe(
      1_200_000 + buggy.totalInterestCents,
    );
  });

  test("bankPayeeIdor: any customer can delete someone else's payee", async ({
    request,
    playwright,
    baseURL,
  }) => {
    const runKey = uniqueRunKey("idor");
    await armFlags(request, runKey, { bankPayeeIdor: true });
    await signUpCustomer(request, "Attacking Customer");
    const victim = await playwright.request.newContext({ baseURL });
    await signUpCustomer(victim, "Victim Customer");
    const payee = await addPayee(victim, "Victim Power", "VP-1");

    const blocked = await request.delete(`/api/bank/payees/${payee.id}`, {
      data: {},
    });
    expect(blocked.status()).toBe(404);

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

  test("bankNotificationCount: reading notifications never lowers the count", async ({
    request,
    playwright,
    baseURL,
  }) => {
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

    const correct = await (await request.get("/api/bank/notifications")).json();
    expect(correct.unread).toBe(0);
    const buggy = await (
      await request.get(`/api/bank/notifications?runKey=${runKey}`)
    ).json();
    expect(buggy.unread).toBe(1);
    await sender.dispose();
  });

  test("bankRequestDoublePay: a paid request can be paid again", async ({
    request,
    playwright,
    baseURL,
  }) => {
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

    const pay = () =>
      request.post(`/api/bank/requests/${asked.id}/pay?runKey=${runKey}`, {
        data: { fromAccountId: mine.id },
      });
    expect((await pay()).status()).toBe(200);
    expect((await pay()).status()).toBe(200);
    expect(await balanceOf(asker, theirs.id)).toBe(
      STARTER_CENTS.checking + 10_000,
    );
    await asker.dispose();
  });

  test("bankSupportStatus: the customer's reply leaves the ticket on Answered", async ({
    request,
    playwright,
    baseURL,
  }) => {
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

    const correct = await ask();
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

    const buggy = await ask();
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
});
