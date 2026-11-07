// axe-core's Playwright runner, which checks a page for accessibility problems.
import AxeBuilder from "@axe-core/playwright";
// Playwright's test tools, with the [RESULT] block printed after every test.
import {
  expect,
  // Renamed here, because one test below has its own `expected`.
  expected as expectedResult,
  fact,
  test,
} from "../../../framework/fixtures/resultBlock";
// The bank helpers: the demo people, accounts, payees, loans and sign-in.
import {
  addPayee,
  balanceOf,
  DEMO,
  moneyAccounts,
  requestLoan,
  signIn,
  signUpCustomer,
  usd,
} from "../../../framework/helpers/bank";

// Playground Bank bill pay and loans in the React app. Customers sign up
// through page.request (sharing the page's cookies) or the separate request
// fixture; staff pages sign the browser in as the demo Support or Admin.

test.describe("Playground Bank bill pay (/app/bank/bills)", () => {
  // Save a payee on the page, then pay $120.50 through Review and Confirm,
  // and see the receipt and the history.
  test("save a payee, then pay a bill with a review and a receipt", async ({
    page,
  }) => {
    expectedResult(
      "payee saved; summary $120.50; receipt '$120.50 to City Power' with the new balance; 'October' in payments; Checking -12050",
    );
    // A new customer with no payees yet.
    await signUpCustomer(page.request, "Bill Customer");
    const [checking] = (await moneyAccounts(page.request)).accounts;
    fact("checking", checking.id);
    fact("balance", checking.balanceCents);
    await page.goto("/app/bank/bills");
    await expect(page.getByTestId("pay-needs-payee")).toBeVisible();

    // Save City Power as a payee.
    await page.getByTestId("payee-name").fill("City Power");
    await page.getByTestId("payee-reference").fill("ACC-100234");
    await page.getByTestId("payee-add").click();
    await expect(page.getByTestId("payees-list")).toContainText("City Power");

    // Pay it $120.50, review, then confirm.
    await page
      .getByTestId("pay-payee")
      .selectOption({ label: "City Power · ACC-100234" });
    await page.getByTestId("pay-amount").fill("120.50");
    await page.getByTestId("pay-memo").fill("October");
    await page.getByTestId("pay-review").click();
    await expect(page.getByTestId("pay-summary-amount")).toHaveText("$120.50");
    await page.getByTestId("pay-confirm").click();

    // The receipt, the history, and the balance.
    await expect(page.getByTestId("pay-receipt-amount")).toHaveText(
      "$120.50 to City Power",
    );
    await expect(page.getByTestId("pay-receipt-balance")).toHaveText(
      usd(checking.balanceCents - 12_050),
    );
    await expect(page.getByTestId("payments-table")).toContainText("October");
    expect(await balanceOf(page.request, checking.id)).toBe(
      checking.balanceCents - 12_050,
    );
  });

  // The pay form needs a payee, and won't review an amount bigger than the balance.
  test("the pay form checks the payee and the amount", async ({ page }) => {
    expectedResult(
      "no payee: a payee error; a cent over the balance: 'Checking holds <balance>', and no summary",
    );
    // A new customer with one payee.
    await signUpCustomer(page.request, "Careful Bill Customer");
    const [checking] = (await moneyAccounts(page.request)).accounts;
    await addPayee(page.request, "Telco Mobile", "415-555-0134");
    fact("balance", checking.balanceCents);
    await page.goto("/app/bank/bills");

    // An amount but no payee.
    await page.getByTestId("pay-amount").fill("50");
    await page.getByTestId("pay-review").click();
    await expect(page.getByTestId("pay-payee-error")).toBeVisible();

    await page.getByTestId("pay-payee").selectOption({ index: 1 });
    // A cent more than Checking actually holds.
    await page
      .getByTestId("pay-amount")
      .fill(((checking.balanceCents + 1) / 100).toFixed(2));
    await page.getByTestId("pay-review").click();
    await expect(page.getByTestId("pay-amount-error")).toContainText(
      `Checking holds ${usd(checking.balanceCents)}`,
    );
    await expect(page.getByTestId("pay-summary")).toHaveCount(0);
  });

  // A payee is deleted after a confirm dialog.
  test("delete a payee after confirming", async ({ page }) => {
    expectedResult(
      "the dialog asks 'Delete Old Gym?'; after confirming the row is gone and the empty state shows",
    );
    // A new customer with one payee.
    await signUpCustomer(page.request, "Tidy Customer");
    const payee = await addPayee(page.request, "Old Gym", "GYM-1");
    fact("payeeId", payee.id);
    await page.goto("/app/bank/bills");

    // Delete it, confirming in the dialog.
    await page.getByTestId(`payee-delete-${payee.id}`).click();
    await expect(page.getByTestId("payee-delete-dialog")).toContainText(
      "Delete Old Gym?",
    );
    await page.getByTestId("payee-delete-confirm").click();
    await expect(page.getByTestId(`payee-row-${payee.id}`)).toHaveCount(0);
    await expect(page.getByTestId("payees-empty")).toBeVisible();
  });

  // The demo customer sees their payees with a note, and no forms or delete buttons.
  test("a demo customer sees payees but can't pay or change them", async ({
    page,
  }) => {
    expectedResult(
      "the demo note; City Power listed; no payee form, no pay form, no delete buttons",
    );
    await signIn(page.request, DEMO.customer);
    await page.goto("/app/bank/bills");
    await expect(page.getByTestId("bills-demo-note")).toBeVisible();
    await expect(page.getByTestId("payees-list")).toContainText("City Power");
    await expect(page.getByTestId("payee-form")).toHaveCount(0);
    await expect(page.getByTestId("pay-form")).toHaveCount(0);
    await expect(page.locator('[data-testid^="payee-delete-"]')).toHaveCount(0);
  });
});

test.describe("Playground Bank loans (/app/bank/loans, /app/admin/loans)", () => {
  // The loan form shows a live quote that adds up, a 36-month schedule ending
  // at zero, refuses a too-small amount, and sends a pending request.
  test("ask for a loan with a live quote and its schedule", async ({
    page,
  }) => {
    expectedResult(
      "a % APR and a monthly payment that follows from it; total > $25,000; 36 schedule rows ending $0.00; $500 refused; sent as Pending for Kitchen",
    );
    // A new customer asks for $25,000 over 36 months.
    await signUpCustomer(page.request, "Loan Customer");
    await page.goto("/app/bank/loans");

    await page.getByTestId("loan-amount").fill("25,000");
    await page.getByTestId("loan-term").selectOption("36");

    // The rate is this customer's own, so the quote is checked for sense and
    // for agreeing with itself rather than against a published rate card.
    await expect(page.getByTestId("quote-apr")).toHaveText(/^\d+\.\d{2}%$/);
    await expect(page.getByTestId("quote-monthly")).toHaveText(
      /^\$\d{3}\.\d{2}$/,
    );
    const apr = Number(
      (await page.getByTestId("quote-apr").textContent())!.replace("%", ""),
    );
    const monthly = apr / 100 / 12;
    const expected = Math.round(
      (2_500_000 * monthly) / (1 - Math.pow(1 + monthly, -36)),
    );
    fact("apr %", apr);
    fact("monthly", expected);
    await expect(page.getByTestId("quote-monthly")).toHaveText(usd(expected));
    // The last payment settles the balance exactly, so the total is a few
    // cents off 36 even payments. It must still be more than what was
    // borrowed: the difference is the interest.
    const total = Number(
      (await page.getByTestId("quote-total").textContent())!.replace(
        /[$,]/g,
        "",
      ),
    );
    expect(total).toBeGreaterThan(25_000);
    expect(Math.abs(total * 100 - expected * 36)).toBeLessThan(10_000);

    // The schedule: 36 rows, the last one leaving nothing owed.
    await page.getByTestId("quote-toggle-schedule").click();
    await expect(
      page.locator('[data-testid^="quote-schedule-row-"]'),
    ).toHaveCount(36);
    await expect(page.getByTestId("quote-schedule-balance-36")).toHaveText(
      "$0.00",
    );

    // $500 is too small: an error, and the button is disabled.
    await page.getByTestId("loan-amount").fill("500");
    await expect(page.getByTestId("loan-amount-error")).toBeVisible();
    await expect(page.getByTestId("loan-submit")).toBeDisabled();

    // Back to $25,000 for a kitchen: sent, and listed as Pending.
    await page.getByTestId("loan-amount").fill("25,000");
    await page.getByTestId("loan-purpose").fill("Kitchen");
    await page.getByTestId("loan-submit").click();
    await expect(page.getByTestId("loan-sent")).toContainText("$25,000.00");
    const row = page.locator('[data-testid^="loan-row-"]');
    await expect(row).toHaveCount(1);
    await expect(row).toContainText("Pending");
    await expect(row).toContainText("Kitchen");
  });

  // The Admin approves a loan on Loan requests, and the money reaches the customer.
  test("an Admin approves from Loan requests and the customer gets the money", async ({
    page,
    request,
  }) => {
    expectedResult(
      "the dialog asks 'Approve $10,000.00 for Approved Loan Customer?'; the row leaves Waiting and reads Approved under All; Checking +1000000",
    );
    // A new customer asks for $10,000 over 24 months.
    await signUpCustomer(request, "Approved Loan Customer");
    const [checking] = (await moneyAccounts(request)).accounts;
    const loan = await requestLoan(request, checking.id, 1_000_000, 24, "Car");
    fact("loanId", loan.id);

    // The demo Admin approves it with a note.
    await signIn(page.request, DEMO.admin);
    await page.goto("/app/admin/loans");
    await page.getByTestId(`loan-actions-${loan.id}`).click();
    await page.getByTestId(`loan-approve-${loan.id}`).click();
    await expect(page.getByTestId("loan-decision-dialog")).toContainText(
      "Approve $10,000.00 for Approved Loan Customer?",
    );
    await page.getByTestId("loan-note").fill("Good history.");
    await page.getByTestId("loan-decision-confirm").click();
    await expect(page.getByTestId("loan-decision-dialog")).toHaveCount(0);

    // It leaves the Waiting list and shows as Approved under All.
    await expect(page.getByTestId(`loan-request-row-${loan.id}`)).toHaveCount(
      0,
    );
    await page.getByTestId("loan-filter-all").click();
    await expect(
      page.getByTestId(`loan-request-status-${loan.id}`),
    ).toContainText("Approved");
    expect(await balanceOf(request, checking.id)).toBe(
      checking.balanceCents + 1_000_000,
    );
  });

  // A rejection needs a reason, and the customer can read it.
  test("an Admin rejects with a reason the customer can read", async ({
    page,
    request,
  }) => {
    expectedResult(
      "no reason: 'Say why the loan is rejected.'; with one the dialog closes; the customer's loan reads rejected, 'Income too low.'",
    );
    // A new customer asks for a loan.
    await signUpCustomer(request, "Rejected Loan Customer");
    const [checking] = (await moneyAccounts(request)).accounts;
    const loan = await requestLoan(request, checking.id);
    fact("loanId", loan.id);

    // The demo Admin tries to reject with no reason, then with one.
    await signIn(page.request, DEMO.admin);
    await page.goto("/app/admin/loans");
    await page.getByTestId(`loan-actions-${loan.id}`).click();
    await page.getByTestId(`loan-reject-${loan.id}`).click();
    await page.getByTestId("loan-decision-confirm").click();
    await expect(page.getByTestId("loan-decision-error")).toHaveText(
      "Say why the loan is rejected.",
    );
    await page.getByTestId("loan-note").fill("Income too low.");
    await page.getByTestId("loan-decision-confirm").click();
    await expect(page.getByTestId("loan-decision-dialog")).toHaveCount(0);

    // The customer sees the rejection and the reason.
    const mine = await (await request.get("/api/bank/loans")).json();
    expect(mine.loans[0]).toMatchObject({
      status: "rejected",
      decisionNote: "Income too low.",
    });
  });

  // Support sees Loan requests with a read-only note and no Approve button; a
  // customer is refused the page.
  test("Support sees Loan requests read-only; customers can't open it", async ({
    page,
    request,
  }) => {
    expectedResult(
      "Support: the read-only note, 'Only an Admin' in the menu, no Approve, the sidebar link; a customer: forbidden and no link",
    );
    // A new customer asks for a loan.
    await signUpCustomer(request, "Waiting Loan Customer");
    const [checking] = (await moneyAccounts(request)).accounts;
    const loan = await requestLoan(request, checking.id);
    fact("loanId", loan.id);

    // As Support: read-only.
    await signIn(page.request, DEMO.support);
    await page.goto("/app/admin/loans");
    await expect(page.getByTestId("loan-requests-readonly")).toBeVisible();
    await page.getByTestId(`loan-actions-${loan.id}`).click();
    await expect(page.getByTestId(`loan-menu-note-${loan.id}`)).toContainText(
      "Only an Admin",
    );
    await expect(page.getByTestId(`loan-approve-${loan.id}`)).toHaveCount(0);
    await expect(page.getByTestId("nav-link-loan-requests")).toBeVisible();

    // As a customer: forbidden, and no link.
    await signUpCustomer(page.request, "Curious Loan Customer");
    await page.goto("/app/admin/loans");
    await expect(page.getByTestId("loan-requests-forbidden")).toBeVisible();
    await expect(page.getByTestId("nav-link-loan-requests")).toHaveCount(0);
  });

  // The demo customer sees their approved loan and its 24-month schedule, with no form.
  test("a demo customer sees their loan and its schedule", async ({ page }) => {
    expectedResult(
      "the demo note; no loan form; an Approved loan whose schedule has 24 rows ending $0.00",
    );
    await signIn(page.request, DEMO.customer);
    await page.goto("/app/bank/loans");
    await expect(page.getByTestId("loans-demo-note")).toBeVisible();
    await expect(page.getByTestId("loan-form")).toHaveCount(0);
    // Open the first loan's schedule.
    const row = page.locator('[data-testid^="loan-row-"]').first();
    await expect(row).toContainText("Approved");
    await row.locator('[data-testid^="loan-schedule-"]').click();
    await expect(
      page.locator('[data-testid^="loan-schedule-table-row-"]'),
    ).toHaveCount(24);
    await expect(page.getByTestId("loan-schedule-table-balance-24")).toHaveText(
      "$0.00",
    );
  });

  // Bill pay, Loans and the staff Loan requests page pass axe.
  test("the bill pay and loan pages pass an accessibility scan", async ({
    page,
  }) => {
    expectedResult(
      "no axe violations in the main area of /app/bank/bills, /app/bank/loans and /app/admin/loans",
    );
    // A new customer with a payee scans their two pages.
    await signUpCustomer(page.request, "Accessible Loan Customer");
    await addPayee(page.request);
    for (const path of ["/app/bank/bills", "/app/bank/loans"]) {
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
    // The demo Admin scans the staff page.
    await signIn(page.request, DEMO.admin);
    await page.goto("/app/admin/loans");
    await expect(page.getByTestId("app-heading")).toBeVisible();
    await page.waitForLoadState("networkidle");
    const results = await new AxeBuilder({ page })
      .include('[data-testid="app-main"]')
      .analyze();
    fact("violations", results.violations.length);
    expect(
      results.violations,
      JSON.stringify(results.violations.map((v) => v.id)),
    ).toEqual([]);
  });
});
