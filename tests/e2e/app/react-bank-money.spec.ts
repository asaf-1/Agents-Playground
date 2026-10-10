import { readFile } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import {
  addFunds,
  balanceOf,
  DEMO,
  moneyAccounts,
  PASSWORD,
  signIn,
  signUpCustomer,
  uniqueEmail,
  usd,
} from "./_bank";

// Playground Bank money in the React app (/app/bank...). Each test signs up its
// own customer through page.request, which shares the page's cookies, so the
// browser is signed in as that customer and nothing is shared between tests.

test.describe("Playground Bank money (/app/bank)", () => {
  test("the Bank page shows a new customer's accounts and total", async ({
    page,
  }) => {
    await signUpCustomer(page.request, "Overview Customer");
    const [checking, savings] = (await moneyAccounts(page.request)).accounts;

    await page.goto("/app/bank");
    await expect(page.getByTestId("app-heading")).toHaveText("Bank");
    await expect(page.getByTestId("bank-total")).toHaveText(
      usd(checking.balanceCents + savings.balanceCents),
    );
    await expect(page.getByTestId(`account-balance-${checking.id}`)).toHaveText(
      usd(checking.balanceCents),
    );
    await expect(page.getByTestId(`account-balance-${savings.id}`)).toHaveText(
      usd(savings.balanceCents),
    );
    await expect(page.getByTestId(`account-number-${checking.id}`)).toHaveText(
      checking.number,
    );
    await expect(page.getByTestId("nav-link-bank")).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(page.getByTestId("bank-activity")).toContainText(
      "Opening deposit",
    );
  });

  test("Add funds raises the balance, up to $1,000,000 at a time", async ({
    page,
  }) => {
    await signUpCustomer(page.request, "Adding Customer");
    const opened = await moneyAccounts(page.request);
    const [checking] = opened.accounts;
    const total = opened.totalCents;
    await page.goto("/app/bank");

    await page.getByTestId(`account-add-funds-${checking.id}`).click();
    await page.getByTestId("add-funds-amount").fill("1000000.01");
    await page.getByTestId("add-funds-submit").click();
    await expect(page.getByTestId("add-funds-amount-error")).toContainText(
      "$1,000,000",
    );

    await page.getByTestId("add-funds-quick-1000").click();
    await page.getByTestId("add-funds-submit").click();
    await expect(page.getByTestId("add-funds-dialog")).toHaveCount(0);
    await expect(page.getByTestId(`account-balance-${checking.id}`)).toHaveText(
      usd(checking.balanceCents + 100_000),
    );
    await expect(page.getByTestId("bank-total")).toHaveText(
      usd(total + 100_000),
    );
  });

  test("open an account with a starting amount", async ({ page }) => {
    await signUpCustomer(page.request, "Opening Customer");
    const { totalCents } = await moneyAccounts(page.request);
    await page.goto("/app/bank");

    await page.getByTestId("bank-open-account").click();
    await page.getByTestId("open-account-kind").selectOption("savings");
    await page.getByTestId("open-account-name").fill("Holiday fund");
    await page.getByTestId("open-account-amount").fill("500");
    await page.getByTestId("open-account-submit").click();
    await expect(page.getByTestId("open-account-dialog")).toHaveCount(0);

    const cards = page.locator('[data-testid^="bank-account-card-"]');
    await expect(cards).toHaveCount(3);
    await expect(cards.last()).toContainText("Holiday fund");
    await expect(cards.last()).toContainText("$500.00");
    await expect(page.getByTestId("bank-total")).toHaveText(
      usd(totalCents + 50_000),
    );
  });

  test("a transfer goes form, review, receipt, and the balances follow", async ({
    page,
  }) => {
    await signUpCustomer(page.request, "Transfer Customer");
    const [checking, savings] = (await moneyAccounts(page.request)).accounts;
    await page.goto("/app/bank");

    await page.getByTestId(`account-transfer-${checking.id}`).click();
    await expect(page).toHaveURL(/\/app\/bank\/transfer\?from=/);
    await expect(page.getByTestId("transfer-from")).toHaveValue(checking.id);
    await page.getByTestId("transfer-to-account").selectOption(savings.id);
    await page.getByTestId("transfer-amount").fill("1,250.50");
    await page.getByTestId("transfer-memo").fill("Holiday fund");
    await page.getByTestId("transfer-review").click();

    await expect(page.getByTestId("summary-amount")).toHaveText("$1,250.50");
    await expect(page.getByTestId("summary-to")).toContainText(savings.number);
    await expect(page.getByTestId("summary-memo")).toHaveText("Holiday fund");
    await page.getByTestId("transfer-confirm").click();

    await expect(page.getByTestId("transfer-receipt")).toBeVisible();
    await expect(page.getByTestId("receipt-amount")).toHaveText("$1,250.50");
    await expect(page.getByTestId("receipt-from-balance")).toHaveText(
      usd(checking.balanceCents - 125_050),
    );

    await page.getByTestId("transfer-done").click();
    await expect(page.getByTestId(`account-balance-${checking.id}`)).toHaveText(
      usd(checking.balanceCents - 125_050),
    );
    await expect(page.getByTestId(`account-balance-${savings.id}`)).toHaveText(
      usd(savings.balanceCents + 125_050),
    );
    await expect(page.getByTestId("bank-activity")).toContainText(
      "Holiday fund",
    );
  });

  test("the transfer form checks the amount against the balance", async ({
    page,
  }) => {
    await signUpCustomer(page.request, "Checked Customer");
    const [, savings] = (await moneyAccounts(page.request)).accounts;
    await page.goto("/app/bank/transfer");

    await page.getByTestId("transfer-to-account").selectOption(savings.id);
    const [checking] = (await moneyAccounts(page.request)).accounts;
    // A cent more than Checking actually holds, whatever that is.
    const overBalance = ((checking.balanceCents + 1) / 100).toFixed(2);
    for (const [amount, message] of [
      ["0", "above zero"],
      ["-5", "above zero"],
      ["12.345", "like 250.00"],
      [overBalance, `Checking holds ${usd(checking.balanceCents)}`],
    ]) {
      await page.getByTestId("transfer-amount").fill(amount);
      await page.getByTestId("transfer-review").click();
      await expect(page.getByTestId("transfer-amount-error")).toContainText(
        message,
      );
    }
    await expect(page.getByTestId("transfer-summary")).toHaveCount(0);
  });

  test("send money to another customer by account number", async ({
    page,
    request,
  }) => {
    await signUpCustomer(page.request, "Paying Customer");
    await signUpCustomer(request, "Paid Customer");
    const [theirs] = (await moneyAccounts(request)).accounts;
    await page.goto("/app/bank/transfer");

    await page.getByTestId("transfer-to-other").click();
    await page.getByTestId("transfer-to-number").fill("PB-123");
    await page.getByTestId("transfer-amount").fill("75");
    await page.getByTestId("transfer-review").click();
    await expect(page.getByTestId("transfer-to-number-error")).toBeVisible();

    await page.getByTestId("transfer-to-number").fill(theirs.number);
    await page.getByTestId("transfer-review").click();
    await page.getByTestId("transfer-confirm").click();
    await expect(page.getByTestId("receipt-to")).toHaveText(theirs.number);
    expect(await balanceOf(request, theirs.id)).toBe(
      theirs.balanceCents + 7_500,
    );
  });

  test("a transfer to an unknown account number shows the server's answer", async ({
    page,
  }) => {
    await signUpCustomer(page.request, "Mistyping Customer");
    await page.goto("/app/bank/transfer");
    await page.getByTestId("transfer-to-other").click();
    await page.getByTestId("transfer-to-number").fill("PB-0000-0000");
    await page.getByTestId("transfer-amount").fill("10");
    await page.getByTestId("transfer-review").click();
    await page.getByTestId("transfer-confirm").click();
    await expect(page.getByTestId("transfer-error")).toHaveText(
      "There's no account with that number.",
    );
    await page.getByTestId("transfer-back").click();
    await expect(page.getByTestId("transfer-to-number")).toHaveValue(
      "PB-0000-0000",
    );
  });

  test("history filters by type and amount, and pages through 20 at a time", async ({
    page,
  }) => {
    await signUpCustomer(page.request, "History Customer");
    const [checking] = (await moneyAccounts(page.request)).accounts;
    for (let dollars = 1; dollars <= 21; dollars += 1) {
      await addFunds(page.request, checking.id, dollars * 100);
    }
    await page.goto(`/app/bank/accounts/${checking.id}`);

    await expect(page.getByTestId("history-count")).toContainText(
      "22 transactions",
    );
    const rows = page.locator('[data-testid^="history-row-"]');
    await expect(rows).toHaveCount(20);
    await expect(page.getByTestId("history-page")).toHaveText("Page 1 of 2");
    await page.getByTestId("history-next").click();
    await expect(page.getByTestId("history-page")).toHaveText("Page 2 of 2");
    await expect(rows).toHaveCount(2);

    await page.getByTestId("history-min").fill("10.00");
    await page.getByTestId("history-max").fill("15");
    await page.getByTestId("history-apply").click();
    await expect(page.getByTestId("history-count")).toContainText(
      "6 transactions",
    );
    await expect(page.getByTestId("history-pager")).toHaveCount(0);

    await page.getByTestId("history-clear").click();
    await page.getByTestId("history-type").selectOption("out");
    await page.getByTestId("history-apply").click();
    await expect(page.getByTestId("history-empty")).toBeVisible();

    await page.getByTestId("history-min").fill("ten");
    await page.getByTestId("history-apply").click();
    await expect(page.getByTestId("history-min-error")).toBeVisible();
  });

  test("download the CSV statement", async ({ page }) => {
    await signUpCustomer(page.request, "Download Customer");
    const [checking] = (await moneyAccounts(page.request)).accounts;
    await addFunds(page.request, checking.id, 4_200);
    await page.goto(`/app/bank/accounts/${checking.id}`);

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("statement-download").click(),
    ]);
    expect(download.suggestedFilename()).toMatch(
      new RegExp(`^statement-${checking.number}-.+\\.csv$`),
    );
    const csv = await readFile(await download.path(), "utf8");
    expect(csv).toContain("Date (UTC),Description,Memo,Type,Amount,Balance");
    expect(csv).toContain(
      `Added funds,,deposit,42.00,${((checking.balanceCents + 4_200) / 100).toFixed(2)}`,
    );
    const closing = ((checking.balanceCents + 4_200) / 100).toFixed(2);
    expect(csv).toMatch(new RegExp(`Total,,,,${closing},\r\n$`));
  });

  test("a demo customer can browse but not move money", async ({ page }) => {
    await signIn(page.request, DEMO.customer);
    await page.goto("/app/bank");
    await expect(page.getByTestId("bank-demo-note")).toBeVisible();
    await expect(
      page.locator('[data-testid^="bank-account-card-"]'),
    ).toHaveCount(2);
    await expect(
      page.locator('[data-testid^="account-add-funds-"]'),
    ).toHaveCount(0);
    await expect(page.getByTestId("bank-transfer-link")).toHaveCount(0);
    await expect(page.getByTestId("bank-demo-signup")).toBeVisible();

    await page.locator('[data-testid^="account-view-"]').first().click();
    await expect(page.getByTestId("account-number")).toHaveText("PB-1000-0001");
    await expect(page.getByTestId("history-table")).toBeVisible();

    await page.goto("/app/bank/transfer");
    await expect(page.getByTestId("transfer-demo-note")).toBeVisible();
    await expect(page.getByTestId("transfer-form")).toHaveCount(0);
  });

  test("the demo note's Sign up leads to your own transfer form", async ({
    page,
  }) => {
    await signIn(page.request, DEMO.customer);
    await page.goto("/app/bank/transfer");
    await page.getByTestId("transfer-demo-signup").click();
    await expect(page).toHaveURL(/\/app\/signup\?next=/);

    await page.getByTestId("signup-fullName").fill("Converted Customer");
    await page.getByTestId("signup-email").fill(uniqueEmail("converted"));
    await page.getByTestId("signup-password").fill(PASSWORD);
    await page.getByTestId("signup-confirmPassword").fill(PASSWORD);
    await page.getByTestId("signup-acceptTerms").check();
    await page.getByTestId("signup-submit").click();

    await expect(page).toHaveURL(/\/app\/bank\/transfer$/);
    await expect(page.getByTestId("transfer-form")).toBeVisible();
    const [own] = (await moneyAccounts(page.request)).accounts;
    await expect(page.getByTestId("transfer-from")).toContainText(
      usd(own.balanceCents),
    );
  });

  test("signed-out visitors are asked to log in", async ({ page }) => {
    for (const path of ["/app/bank", "/app/bank/transfer"]) {
      await page.goto(path);
      await expect(page.getByTestId("signin-prompt")).toBeVisible();
    }
  });

  test("another customer's account page says it doesn't exist", async ({
    page,
    request,
  }) => {
    await signUpCustomer(page.request, "Nosy Customer");
    await signUpCustomer(request, "Hidden Customer");
    const [theirs] = (await moneyAccounts(request)).accounts;
    await page.goto(`/app/bank/accounts/${theirs.id}`);
    await expect(page.getByTestId("account-not-found")).toBeVisible();
    await expect(page.getByTestId("account-balance")).toHaveCount(0);
  });

  test("Bank users: staff open a customer's profile from the ⋯ menu", async ({
    page,
    request,
  }) => {
    const customer = await signUpCustomer(request, "Profiled Customer");
    const [theirChecking] = (await moneyAccounts(request)).accounts;
    await signIn(page.request, DEMO.support);
    await page.goto("/app/admin/users");
    await page.getByTestId("admin-search").fill(customer.email);

    await page.getByTestId(`admin-actions-${customer.id}`).click();
    await expect(
      page.getByTestId(`admin-menu-note-${customer.id}`),
    ).toContainText("Only an Admin");
    await expect(page.getByTestId(`admin-toggle-${customer.id}`)).toHaveCount(
      0,
    );
    await page.getByTestId(`admin-view-${customer.id}`).click();

    const dialog = page.getByTestId("bank-user-dialog");
    await expect(dialog).toContainText("Profiled Customer");
    await expect(
      dialog.locator('[data-testid^="bank-user-account-"]'),
    ).toHaveCount(2);
    await expect(dialog).toContainText(usd(theirChecking.balanceCents));
  });

  test("Bank users: an Admin changes a role from the ⋯ menu", async ({
    page,
    request,
  }) => {
    const customer = await signUpCustomer(request, "Promoted Customer");
    await signIn(page.request, DEMO.admin);
    await page.goto("/app/admin/users");
    await page.getByTestId("admin-search").fill(customer.email);

    await page.getByTestId(`admin-actions-${customer.id}`).click();
    await page.getByTestId(`admin-change-role-${customer.id}`).click();
    await page.getByTestId(`admin-role-${customer.id}`).selectOption("support");
    await page.getByTestId("role-save").click();
    await expect(page.getByTestId("role-dialog")).toHaveCount(0);
    await expect(
      page.getByTestId(`admin-role-badge-${customer.id}`),
    ).toHaveText("Support");
  });

  test("the bank pages pass an accessibility scan", async ({ page }) => {
    await signUpCustomer(page.request, "Accessible Customer");
    const [checking] = (await moneyAccounts(page.request)).accounts;
    for (const path of [
      "/app/bank",
      `/app/bank/accounts/${checking.id}`,
      "/app/bank/transfer",
    ]) {
      await page.goto(path);
      await expect(page.getByTestId("app-heading")).toBeVisible();
      await page.waitForLoadState("networkidle");
      const results = await new AxeBuilder({ page })
        .include('[data-testid="app-main"]')
        .analyze();
      expect(
        results.violations,
        `${path}: ${JSON.stringify(results.violations.map((v) => v.id))}`,
      ).toEqual([]);
    }
  });
});
