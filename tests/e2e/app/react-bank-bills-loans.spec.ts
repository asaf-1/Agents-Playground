import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import {
  addPayee,
  balanceOf,
  DEMO,
  moneyAccounts,
  requestLoan,
  signIn,
  signUpCustomer,
  usd,
} from "./_bank";

// Playground Bank bill pay and loans in the React app. Customers sign up
// through page.request (sharing the page's cookies) or the separate request
// fixture; staff pages sign the browser in as the demo Support or Admin.

test.describe("Playground Bank bill pay (/app/bank/bills)", () => {
  test("save a payee, then pay a bill with a review and a receipt", async ({
    page,
  }) => {
    await signUpCustomer(page.request, "Bill Customer");
    const [checking] = (await moneyAccounts(page.request)).accounts;
    await page.goto("/app/bank/bills");
    await expect(page.getByTestId("pay-needs-payee")).toBeVisible();

    await page.getByTestId("payee-name").fill("City Power");
    await page.getByTestId("payee-reference").fill("ACC-100234");
    await page.getByTestId("payee-add").click();
    await expect(page.getByTestId("payees-list")).toContainText("City Power");

    await page
      .getByTestId("pay-payee")
      .selectOption({ label: "City Power · ACC-100234" });
    await page.getByTestId("pay-amount").fill("120.50");
    await page.getByTestId("pay-memo").fill("October");
    await page.getByTestId("pay-review").click();
    await expect(page.getByTestId("pay-summary-amount")).toHaveText("$120.50");
    await page.getByTestId("pay-confirm").click();

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

  test("the pay form checks the payee and the amount", async ({ page }) => {
    await signUpCustomer(page.request, "Careful Bill Customer");
    const [checking] = (await moneyAccounts(page.request)).accounts;
    await addPayee(page.request, "Telco Mobile", "415-555-0134");
    await page.goto("/app/bank/bills");

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

  test("delete a payee after confirming", async ({ page }) => {
    await signUpCustomer(page.request, "Tidy Customer");
    const payee = await addPayee(page.request, "Old Gym", "GYM-1");
    await page.goto("/app/bank/bills");

    await page.getByTestId(`payee-delete-${payee.id}`).click();
    await expect(page.getByTestId("payee-delete-dialog")).toContainText(
      "Delete Old Gym?",
    );
    await page.getByTestId("payee-delete-confirm").click();
    await expect(page.getByTestId(`payee-row-${payee.id}`)).toHaveCount(0);
    await expect(page.getByTestId("payees-empty")).toBeVisible();
  });

  test("a demo customer sees payees but can't pay or change them", async ({
    page,
  }) => {
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
  test("ask for a loan with a live quote and its schedule", async ({
    page,
  }) => {
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

    await page.getByTestId("quote-toggle-schedule").click();
    await expect(
      page.locator('[data-testid^="quote-schedule-row-"]'),
    ).toHaveCount(36);
    await expect(page.getByTestId("quote-schedule-balance-36")).toHaveText(
      "$0.00",
    );

    await page.getByTestId("loan-amount").fill("500");
    await expect(page.getByTestId("loan-amount-error")).toBeVisible();
    await expect(page.getByTestId("loan-submit")).toBeDisabled();

    await page.getByTestId("loan-amount").fill("25,000");
    await page.getByTestId("loan-purpose").fill("Kitchen");
    await page.getByTestId("loan-submit").click();
    await expect(page.getByTestId("loan-sent")).toContainText("$25,000.00");
    const row = page.locator('[data-testid^="loan-row-"]');
    await expect(row).toHaveCount(1);
    await expect(row).toContainText("Pending");
    await expect(row).toContainText("Kitchen");
  });

  test("an Admin approves from Loan requests and the customer gets the money", async ({
    page,
    request,
  }) => {
    await signUpCustomer(request, "Approved Loan Customer");
    const [checking] = (await moneyAccounts(request)).accounts;
    const loan = await requestLoan(request, checking.id, 1_000_000, 24, "Car");

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

  test("an Admin rejects with a reason the customer can read", async ({
    page,
    request,
  }) => {
    await signUpCustomer(request, "Rejected Loan Customer");
    const [checking] = (await moneyAccounts(request)).accounts;
    const loan = await requestLoan(request, checking.id);

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

    const mine = await (await request.get("/api/bank/loans")).json();
    expect(mine.loans[0]).toMatchObject({
      status: "rejected",
      decisionNote: "Income too low.",
    });
  });

  test("Support sees Loan requests read-only; customers can't open it", async ({
    page,
    request,
  }) => {
    await signUpCustomer(request, "Waiting Loan Customer");
    const [checking] = (await moneyAccounts(request)).accounts;
    const loan = await requestLoan(request, checking.id);

    await signIn(page.request, DEMO.support);
    await page.goto("/app/admin/loans");
    await expect(page.getByTestId("loan-requests-readonly")).toBeVisible();
    await page.getByTestId(`loan-actions-${loan.id}`).click();
    await expect(page.getByTestId(`loan-menu-note-${loan.id}`)).toContainText(
      "Only an Admin",
    );
    await expect(page.getByTestId(`loan-approve-${loan.id}`)).toHaveCount(0);
    await expect(page.getByTestId("nav-link-loan-requests")).toBeVisible();

    await signUpCustomer(page.request, "Curious Loan Customer");
    await page.goto("/app/admin/loans");
    await expect(page.getByTestId("loan-requests-forbidden")).toBeVisible();
    await expect(page.getByTestId("nav-link-loan-requests")).toHaveCount(0);
  });

  test("a demo customer sees their loan and its schedule", async ({ page }) => {
    await signIn(page.request, DEMO.customer);
    await page.goto("/app/bank/loans");
    await expect(page.getByTestId("loans-demo-note")).toBeVisible();
    await expect(page.getByTestId("loan-form")).toHaveCount(0);
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

  test("the bill pay and loan pages pass an accessibility scan", async ({
    page,
  }) => {
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
    await signIn(page.request, DEMO.admin);
    await page.goto("/app/admin/loans");
    await expect(page.getByTestId("app-heading")).toBeVisible();
    await page.waitForLoadState("networkidle");
    const results = await new AxeBuilder({ page })
      .include('[data-testid="app-main"]')
      .analyze();
    expect(
      results.violations,
      JSON.stringify(results.violations.map((v) => v.id)),
    ).toEqual([]);
  });
});
