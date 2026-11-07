// Playwright's test tools, with the [RESULT] block printed after every test.
import {
  expect,
  expected,
  fact,
  test,
} from "../../../framework/fixtures/resultBlock";
// The bank helpers: the demo people, payees, balances, accounts, sign in, sign up.
import {
  DEMO,
  addPayee,
  balanceOf,
  moneyAccounts,
  signIn,
  signUpCustomer,
} from "../../../framework/helpers/bank";
// The customer's clock, calendar arithmetic, and scheduling a bill.
import {
  addDays,
  businessDay,
  daysBetween,
  readClock,
  scheduleBill,
} from "../../../framework/helpers/schedule";

// Scheduled payments in the browser (phase A2): the form and list on the Bill
// pay page, and the clock card on the Practice page that moves the customer's
// own calendar so a payment due tomorrow can be watched happening.

test.describe("Scheduled payments (/app/bank/bills) and the clock (/app/practice)", () => {
  // Schedule a payment for tomorrow on Bill pay, move the clock day by day on
  // Practice, see it paid, then reset the clock.
  test("schedule a bill for tomorrow, move your clock, and watch it get paid", async ({
    page,
  }) => {
    expected(
      "the row shows City Power, Scheduled and tomorrow, no money moved; the clock reaches the run day; the row says Paid, 'Water' is in payments, Checking -4500; reset to the real date",
    );
    // A new customer with a payee, and their today, tomorrow and run day.
    await signUpCustomer(page.request, "Schedule Customer");
    const [checking] = (await moneyAccounts(page.request)).accounts;
    await addPayee(page.request, "City Power", "ACC-100234");
    const { today } = await readClock(page.request);
    const tomorrow = addDays(today, 1);
    const runsOn = businessDay(tomorrow);
    fact("checking", checking.id);
    fact("today", today);
    fact("runsOn", runsOn);

    // Schedule $45 to City Power for tomorrow, memo "Water".
    await page.goto("/app/bank/bills");
    await expect(page.getByTestId("sched-today")).toContainText(today);
    await page
      .getByTestId("sched-payee")
      .selectOption({ label: "City Power · ACC-100234" });
    await page.getByTestId("sched-amount").fill("45.00");
    await page.getByTestId("sched-date").fill(tomorrow);
    await page.getByTestId("sched-repeat").selectOption("once");
    await page.getByTestId("sched-memo").fill("Water");
    await page.getByTestId("sched-add").click();
    await expect(page.getByTestId("sched-table")).toContainText("City Power");
    await expect(page.getByTestId("sched-table")).toContainText("Scheduled");
    await expect(page.getByTestId("sched-table")).toContainText(tomorrow);
    // Nothing paid yet.
    expect(await balanceOf(page.request, checking.id)).toBe(
      checking.balanceCents,
    );

    // The clock card: one day at a time, until the run day.
    await page.goto("/app/practice");
    await expect(page.getByTestId("clock-today")).toContainText(today);
    const steps = daysBetween(today, runsOn);
    for (let step = 1; step <= steps; step += 1) {
      await page.getByTestId("clock-advance").click();
      await expect(page.getByTestId("clock-offset")).toContainText(
        `${step} day`,
      );
    }
    await expect(page.getByTestId("clock-today")).toContainText(runsOn);

    // Back on Bill pay: paid, and the money left.
    await page.goto("/app/bank/bills");
    await expect(page.getByTestId("sched-table")).toContainText("Paid");
    await expect(page.getByTestId("payments-table")).toContainText("Water");
    expect(await balanceOf(page.request, checking.id)).toBe(
      checking.balanceCents - 4_500,
    );

    // And back to the real date.
    await page.goto("/app/practice");
    await page.getByTestId("clock-reset").click();
    await expect(page.getByTestId("clock-today")).toContainText(
      "the real date",
    );
    await expect(page.getByTestId("clock-reset")).toBeDisabled();
  });

  // A scheduled payment can be cancelled from its row.
  test("cancel a scheduled payment from its row", async ({ page }) => {
    expected(
      "the row reads Scheduled and Every month, then Cancelled with no cancel button",
    );
    // A new customer with a monthly $30 payment due in three days.
    await signUpCustomer(page.request, "Schedule Customer");
    const [checking] = (await moneyAccounts(page.request)).accounts;
    const payee = await addPayee(page.request, "Telco Mobile", "415-555-0134");
    const { today } = await readClock(page.request);
    const created = await scheduleBill(page.request, {
      fromAccountId: checking.id,
      payeeId: payee.id,
      amountCents: 3_000,
      repeat: "monthly",
      firstDue: addDays(today, 3),
    });
    fact("scheduleId", created.id);

    // Cancel it from the Bill pay page.
    await page.goto("/app/bank/bills");
    await expect(page.getByTestId(`sched-status-${created.id}`)).toHaveText(
      "Scheduled",
    );
    await expect(page.getByTestId("sched-table")).toContainText("Every month");
    await page.getByTestId(`sched-cancel-${created.id}`).click();
    await expect(page.getByTestId(`sched-status-${created.id}`)).toHaveText(
      "Cancelled",
    );
    await expect(page.getByTestId(`sched-cancel-${created.id}`)).toHaveCount(0);
  });

  // The demo customer sees the list with no form, and their clock can't move.
  test("a demo customer sees the list but no form, and cannot move the clock", async ({
    page,
  }) => {
    expected(
      "Bill pay: today shown, no schedule form; Practice: the real date, no advance button, a 'Demo accounts' note",
    );
    await signIn(page.request, DEMO.customer);
    await page.goto("/app/bank/bills");
    await expect(page.getByTestId("sched-today")).toBeVisible();
    await expect(page.getByTestId("sched-card")).toHaveCount(0);
    await page.goto("/app/practice");
    await expect(page.getByTestId("clock-today")).toContainText(
      "the real date",
    );
    await expect(page.getByTestId("clock-advance")).toHaveCount(0);
    await expect(page.getByTestId("clock-note")).toContainText("Demo accounts");
  });

  // A signed-out visitor sees the clock card with a "Log in" note and no controls.
  test("a visitor is told to log in for a clock of their own", async ({
    page,
  }) => {
    expected("the clock card with a 'Log in' note and no advance button");
    await page.goto("/app/practice");
    await expect(page.getByTestId("clock-card")).toBeVisible();
    await expect(page.getByTestId("clock-note")).toContainText("Log in");
    await expect(page.getByTestId("clock-advance")).toHaveCount(0);
  });
});
