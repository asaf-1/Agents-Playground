// Reads a downloaded file from disk.
import { readFile } from "node:fs/promises";
// axe-core's Playwright runner, which checks a page for accessibility problems.
import AxeBuilder from "@axe-core/playwright";
// Playwright's test tools, with the [RESULT] block printed after every test.
import {
  expect,
  expected,
  fact,
  test,
} from "../../../framework/fixtures/resultBlock";
// The bank helpers: the demo people, accounts, deposits, sign-in and sign up.
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
} from "../../../framework/helpers/bank";

// Playground Bank money in the React app (/app/bank...). Each test signs up its
// own customer through page.request, which shares the page's cookies, so the
// browser is signed in as that customer and nothing is shared between tests.

test.describe("Playground Bank money (/app/bank)", () => {
  // The Bank page shows the customer's two accounts, their total, and the
  // opening deposit.
  test("the Bank page shows a new customer's accounts and total", async ({
    page,
  }) => {
    expected(
      "heading Bank; the total and each balance as money; the Checking number; Bank marked current; 'Opening deposit' in the activity",
    );
    // A new customer and their two accounts.
    await signUpCustomer(page.request, "Overview Customer");
    const [checking, savings] = (await moneyAccounts(page.request)).accounts;
    fact("checking", `${checking.number} ${checking.balanceCents}`);
    fact("savings", `${savings.number} ${savings.balanceCents}`);

    await page.goto("/app/bank");
    await expect(page.getByTestId("app-heading")).toHaveText("Bank");
    // The total and each balance.
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
    // The sidebar marks Bank, and the activity has the opening deposit.
    await expect(page.getByTestId("nav-link-bank")).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(page.getByTestId("bank-activity")).toContainText(
      "Opening deposit",
    );
  });

  // Add funds refuses more than $1,000,000, and the $1,000 quick button adds that much.
  test("Add funds raises the balance, up to $1,000,000 at a time", async ({
    page,
  }) => {
    expected(
      "$1,000,000.01 refused naming $1,000,000; the $1,000 button closes the dialog and raises Checking and the total by 100000",
    );
    // A new customer on the Bank page.
    await signUpCustomer(page.request, "Adding Customer");
    const opened = await moneyAccounts(page.request);
    const [checking] = opened.accounts;
    const total = opened.totalCents;
    fact("checking", checking.id);
    fact("total", total);
    await page.goto("/app/bank");

    // A cent over the cap is refused.
    await page.getByTestId(`account-add-funds-${checking.id}`).click();
    await page.getByTestId("add-funds-amount").fill("1000000.01");
    await page.getByTestId("add-funds-submit").click();
    await expect(page.getByTestId("add-funds-amount-error")).toContainText(
      "$1,000,000",
    );

    // The $1,000 quick button works.
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

  // A new savings account with a name and $500 appears, and the total rises.
  test("open an account with a starting amount", async ({ page }) => {
    expected(
      "3 account cards, the last 'Holiday fund' with $500.00; the total up by 50000",
    );
    // A new customer on the Bank page.
    await signUpCustomer(page.request, "Opening Customer");
    const { totalCents } = await moneyAccounts(page.request);
    fact("total", totalCents);
    await page.goto("/app/bank");

    // Open "Holiday fund" with $500.
    await page.getByTestId("bank-open-account").click();
    await page.getByTestId("open-account-kind").selectOption("savings");
    await page.getByTestId("open-account-name").fill("Holiday fund");
    await page.getByTestId("open-account-amount").fill("500");
    await page.getByTestId("open-account-submit").click();
    await expect(page.getByTestId("open-account-dialog")).toHaveCount(0);

    // A third card, and a higher total.
    const cards = page.locator('[data-testid^="bank-account-card-"]');
    await expect(cards).toHaveCount(3);
    await expect(cards.last()).toContainText("Holiday fund");
    await expect(cards.last()).toContainText("$500.00");
    await expect(page.getByTestId("bank-total")).toHaveText(
      usd(totalCents + 50_000),
    );
  });

  // A transfer runs from the form to a review to a receipt, and both balances change.
  test("a transfer goes form, review, receipt, and the balances follow", async ({
    page,
  }) => {
    expected(
      "the review shows $1,250.50 to Savings with the memo; the receipt shows the amount and new balance; the Bank page shows Checking -125050, Savings +125050 and the memo",
    );
    // A new customer starts a transfer from Checking's card.
    await signUpCustomer(page.request, "Transfer Customer");
    const [checking, savings] = (await moneyAccounts(page.request)).accounts;
    fact("checking", checking.id);
    fact("savings", savings.id);
    await page.goto("/app/bank");

    await page.getByTestId(`account-transfer-${checking.id}`).click();
    await expect(page).toHaveURL(/\/app\/bank\/transfer\?from=/);
    await expect(page.getByTestId("transfer-from")).toHaveValue(checking.id);
    // $1,250.50 to Savings, memo "Holiday fund".
    await page.getByTestId("transfer-to-account").selectOption(savings.id);
    await page.getByTestId("transfer-amount").fill("1,250.50");
    await page.getByTestId("transfer-memo").fill("Holiday fund");
    await page.getByTestId("transfer-review").click();

    // The review.
    await expect(page.getByTestId("summary-amount")).toHaveText("$1,250.50");
    await expect(page.getByTestId("summary-to")).toContainText(savings.number);
    await expect(page.getByTestId("summary-memo")).toHaveText("Holiday fund");
    await page.getByTestId("transfer-confirm").click();

    // The receipt.
    await expect(page.getByTestId("transfer-receipt")).toBeVisible();
    await expect(page.getByTestId("receipt-amount")).toHaveText("$1,250.50");
    await expect(page.getByTestId("receipt-from-balance")).toHaveText(
      usd(checking.balanceCents - 125_050),
    );

    // Back on the Bank page, both balances moved.
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

  // The transfer form refuses zero, negative, three-decimal and over-balance amounts.
  test("the transfer form checks the amount against the balance", async ({
    page,
  }) => {
    expected(
      "0 and -5 'above zero'; 12.345 'like 250.00'; a cent over 'Checking holds <balance>'; no summary",
    );
    // A new customer on the transfer form, sending to Savings.
    await signUpCustomer(page.request, "Checked Customer");
    const [, savings] = (await moneyAccounts(page.request)).accounts;
    await page.goto("/app/bank/transfer");

    await page.getByTestId("transfer-to-account").selectOption(savings.id);
    const [checking] = (await moneyAccounts(page.request)).accounts;
    // A cent more than Checking actually holds, whatever that is.
    const overBalance = ((checking.balanceCents + 1) / 100).toFixed(2);
    fact("balance", checking.balanceCents);
    // Each bad amount, with the words its error must contain.
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

  // Money can go to another customer's account number; a malformed number is refused first.
  test("send money to another customer by account number", async ({
    page,
    request,
  }) => {
    expected(
      "'PB-123' refused; to the real number the receipt names it and the recipient is up by 7500",
    );
    // The sender in the browser, the recipient through `request`.
    await signUpCustomer(page.request, "Paying Customer");
    await signUpCustomer(request, "Paid Customer");
    const [theirs] = (await moneyAccounts(request)).accounts;
    fact("theirs", theirs.number);
    await page.goto("/app/bank/transfer");

    // A number that is too short.
    await page.getByTestId("transfer-to-other").click();
    await page.getByTestId("transfer-to-number").fill("PB-123");
    await page.getByTestId("transfer-amount").fill("75");
    await page.getByTestId("transfer-review").click();
    await expect(page.getByTestId("transfer-to-number-error")).toBeVisible();

    // The real number: sent.
    await page.getByTestId("transfer-to-number").fill(theirs.number);
    await page.getByTestId("transfer-review").click();
    await page.getByTestId("transfer-confirm").click();
    await expect(page.getByTestId("receipt-to")).toHaveText(theirs.number);
    expect(await balanceOf(request, theirs.id)).toBe(
      theirs.balanceCents + 7_500,
    );
  });

  // A number nobody has: the server's message shows, and Back keeps what was typed.
  test("a transfer to an unknown account number shows the server's answer", async ({
    page,
  }) => {
    expected(
      "'There's no account with that number.'; Back keeps PB-0000-0000 in the field",
    );
    await signUpCustomer(page.request, "Mistyping Customer");
    await page.goto("/app/bank/transfer");
    // $10 to PB-0000-0000.
    await page.getByTestId("transfer-to-other").click();
    await page.getByTestId("transfer-to-number").fill("PB-0000-0000");
    await page.getByTestId("transfer-amount").fill("10");
    await page.getByTestId("transfer-review").click();
    await page.getByTestId("transfer-confirm").click();
    await expect(page.getByTestId("transfer-error")).toHaveText(
      "There's no account with that number.",
    );
    // Back to the form, the number still filled in.
    await page.getByTestId("transfer-back").click();
    await expect(page.getByTestId("transfer-to-number")).toHaveValue(
      "PB-0000-0000",
    );
  });

  // The account history pages 20 at a time and filters by amount and type.
  test("history filters by type and amount, and pages through 20 at a time", async ({
    page,
  }) => {
    expected(
      "22 transactions, 20 on page 1 of 2 and 2 on page 2; $10-$15 is 6 with no pager; type out is empty; 'ten' shows an error",
    );
    // A new customer with 21 small deposits.
    await signUpCustomer(page.request, "History Customer");
    const [checking] = (await moneyAccounts(page.request)).accounts;
    fact("checking", checking.id);
    for (let dollars = 1; dollars <= 21; dollars += 1) {
      await addFunds(page.request, checking.id, dollars * 100);
    }
    await page.goto(`/app/bank/accounts/${checking.id}`);

    // Two pages: 20 rows, then 2.
    await expect(page.getByTestId("history-count")).toContainText(
      "22 transactions",
    );
    const rows = page.locator('[data-testid^="history-row-"]');
    await expect(rows).toHaveCount(20);
    await expect(page.getByTestId("history-page")).toHaveText("Page 1 of 2");
    await page.getByTestId("history-next").click();
    await expect(page.getByTestId("history-page")).toHaveText("Page 2 of 2");
    await expect(rows).toHaveCount(2);

    // $10 to $15: six rows, one page.
    await page.getByTestId("history-min").fill("10.00");
    await page.getByTestId("history-max").fill("15");
    await page.getByTestId("history-apply").click();
    await expect(page.getByTestId("history-count")).toContainText(
      "6 transactions",
    );
    await expect(page.getByTestId("history-pager")).toHaveCount(0);

    // Only outgoing: none.
    await page.getByTestId("history-clear").click();
    await page.getByTestId("history-type").selectOption("out");
    await page.getByTestId("history-apply").click();
    await expect(page.getByTestId("history-empty")).toBeVisible();

    // A word where an amount should be.
    await page.getByTestId("history-min").fill("ten");
    await page.getByTestId("history-apply").click();
    await expect(page.getByTestId("history-min-error")).toBeVisible();
  });

  // The statement downloads as a CSV named after the account, and its rows
  // and total are right.
  test("download the CSV statement", async ({ page }) => {
    expected(
      "a statement-<number>-*.csv with the header, the $42 deposit row with its balance, and the closing Total",
    );
    // A new customer with a $42 deposit, on their account page.
    await signUpCustomer(page.request, "Download Customer");
    const [checking] = (await moneyAccounts(page.request)).accounts;
    fact("checking", checking.number);
    await addFunds(page.request, checking.id, 4_200);
    await page.goto(`/app/bank/accounts/${checking.id}`);

    // Click Download and catch the file.
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("statement-download").click(),
    ]);
    expect(download.suggestedFilename()).toMatch(
      new RegExp(`^statement-${checking.number}-.+\\.csv$`),
    );
    // Its header, the deposit row and the total.
    const csv = await readFile(await download.path(), "utf8");
    expect(csv).toContain("Date (UTC),Description,Memo,Type,Amount,Balance");
    expect(csv).toContain(
      `Added funds,,deposit,42.00,${((checking.balanceCents + 4_200) / 100).toFixed(2)}`,
    );
    const closing = ((checking.balanceCents + 4_200) / 100).toFixed(2);
    fact("closing", closing);
    expect(csv).toMatch(new RegExp(`Total,,,,${closing},\r\n$`));
  });

  // The demo customer can look around but has no money buttons.
  test("a demo customer can browse but not move money", async ({ page }) => {
    expected(
      "the demo note, 2 account cards, no add-funds or transfer buttons, a sign-up link; the first account PB-1000-0001 with history; the transfer page shows a note, no form",
    );
    // The Bank page as the demo customer.
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

    // The first account's page.
    await page.locator('[data-testid^="account-view-"]').first().click();
    await expect(page.getByTestId("account-number")).toHaveText("PB-1000-0001");
    await expect(page.getByTestId("history-table")).toBeVisible();

    // The transfer page.
    await page.goto("/app/bank/transfer");
    await expect(page.getByTestId("transfer-demo-note")).toBeVisible();
    await expect(page.getByTestId("transfer-form")).toHaveCount(0);
  });

  // The Sign up link on the demo note leads to a new account and straight
  // back to a working transfer form.
  test("the demo note's Sign up leads to your own transfer form", async ({
    page,
  }) => {
    expected(
      "sign-up with ?next=; after signing up, /app/bank/transfer with the form, from an account holding the new balance",
    );
    // From the demo transfer page, follow Sign up.
    await signIn(page.request, DEMO.customer);
    await page.goto("/app/bank/transfer");
    await page.getByTestId("transfer-demo-signup").click();
    await expect(page).toHaveURL(/\/app\/signup\?next=/);

    // Sign up as a new customer.
    await page.getByTestId("signup-fullName").fill("Converted Customer");
    await page.getByTestId("signup-email").fill(uniqueEmail("converted"));
    await page.getByTestId("signup-password").fill(PASSWORD);
    await page.getByTestId("signup-confirmPassword").fill(PASSWORD);
    await page.getByTestId("signup-acceptTerms").check();
    await page.getByTestId("signup-submit").click();

    // Back on the transfer form, from their own account.
    await expect(page).toHaveURL(/\/app\/bank\/transfer$/);
    await expect(page.getByTestId("transfer-form")).toBeVisible();
    const [own] = (await moneyAccounts(page.request)).accounts;
    fact("own", own.id);
    await expect(page.getByTestId("transfer-from")).toContainText(
      usd(own.balanceCents),
    );
  });

  // Signed out, the Bank and Transfer pages ask to log in.
  test("signed-out visitors are asked to log in", async ({ page }) => {
    expected("the sign-in prompt on /app/bank and /app/bank/transfer");
    for (const path of ["/app/bank", "/app/bank/transfer"]) {
      await page.goto(path);
      await expect(page.getByTestId("signin-prompt")).toBeVisible();
    }
  });

  // Another customer's account page says "not found" and shows no balance.
  test("another customer's account page says it doesn't exist", async ({
    page,
    request,
  }) => {
    expected("account-not-found shown, no balance");
    // The browser's customer opens another customer's account page.
    await signUpCustomer(page.request, "Nosy Customer");
    await signUpCustomer(request, "Hidden Customer");
    const [theirs] = (await moneyAccounts(request)).accounts;
    fact("theirs", theirs.id);
    await page.goto(`/app/bank/accounts/${theirs.id}`);
    await expect(page.getByTestId("account-not-found")).toBeVisible();
    await expect(page.getByTestId("account-balance")).toHaveCount(0);
  });

  // Support opens a customer's profile from the ⋯ menu (and can't change it).
  test("Bank users: staff open a customer's profile from the ⋯ menu", async ({
    page,
    request,
  }) => {
    expected(
      "the menu says 'Only an Admin' with no toggle; the profile dialog shows the name, 2 accounts and the Checking balance",
    );
    // A new customer, and the demo Support person on the staff page.
    const customer = await signUpCustomer(request, "Profiled Customer");
    const [theirChecking] = (await moneyAccounts(request)).accounts;
    await signIn(page.request, DEMO.support);
    await page.goto("/app/admin/users");
    await page.getByTestId("admin-search").fill(customer.email);

    // The ⋯ menu: no change for Support, only View.
    await page.getByTestId(`admin-actions-${customer.id}`).click();
    await expect(
      page.getByTestId(`admin-menu-note-${customer.id}`),
    ).toContainText("Only an Admin");
    await expect(page.getByTestId(`admin-toggle-${customer.id}`)).toHaveCount(
      0,
    );
    await page.getByTestId(`admin-view-${customer.id}`).click();

    // The profile dialog.
    const dialog = page.getByTestId("bank-user-dialog");
    await expect(dialog).toContainText("Profiled Customer");
    await expect(
      dialog.locator('[data-testid^="bank-user-account-"]'),
    ).toHaveCount(2);
    await expect(dialog).toContainText(usd(theirChecking.balanceCents));
  });

  // The Admin changes a customer's role to Support from the ⋯ menu.
  test("Bank users: an Admin changes a role from the ⋯ menu", async ({
    page,
    request,
  }) => {
    expected("the role dialog closes and the badge reads Support");
    // A new customer, and the demo Admin on the staff page.
    const customer = await signUpCustomer(request, "Promoted Customer");
    await signIn(page.request, DEMO.admin);
    await page.goto("/app/admin/users");
    await page.getByTestId("admin-search").fill(customer.email);

    // Change role to Support.
    await page.getByTestId(`admin-actions-${customer.id}`).click();
    await page.getByTestId(`admin-change-role-${customer.id}`).click();
    await page.getByTestId(`admin-role-${customer.id}`).selectOption("support");
    await page.getByTestId("role-save").click();
    await expect(page.getByTestId("role-dialog")).toHaveCount(0);
    await expect(
      page.getByTestId(`admin-role-badge-${customer.id}`),
    ).toHaveText("Support");
  });

  // The Bank, account and transfer pages pass axe.
  test("the bank pages pass an accessibility scan", async ({ page }) => {
    expected(
      "no axe violations in the main area of /app/bank, the account page and /app/bank/transfer",
    );
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
