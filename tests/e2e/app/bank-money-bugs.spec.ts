import { expect, test, type Page } from "@playwright/test";
import { armFlags } from "./_helpers";
import {
  addFunds,
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
});
