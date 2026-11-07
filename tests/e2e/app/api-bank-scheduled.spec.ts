// Reads openapi.json from disk, so answers can be checked against the contract.
import { readFileSync } from "node:fs";
// Ajv checks a JSON value against a JSON Schema; ajv-formats adds formats like date-time.
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
// The type of a request context.
import { type APIRequestContext } from "@playwright/test";
// Playwright's test tools, with the [RESULT] block printed after every test.
import {
  expect,
  expected,
  fact,
  test,
} from "../../../framework/fixtures/resultBlock";
// The bank helpers: sign up, sign in, accounts, balances, payees.
import {
  DEMO,
  addPayee,
  balanceOf,
  moneyAccounts,
  signIn,
  signUpCustomer,
} from "../../../framework/helpers/bank";
// The customer's clock, calendar arithmetic, and the scheduled-payment calls.
import {
  addDays,
  advanceClockTo,
  businessDay,
  listScheduled,
  next31stBeforeShortMonth,
  nextSaturday,
  nextWeekday,
  readClock,
  scheduleBill,
  scheduledById,
} from "../../../framework/helpers/schedule";

// Scheduled payments and the customer's own clock (phase A2). A payment is
// due on a date; it runs when the customer's "today" reaches it, which a test
// brings about by moving that customer's clock. Nothing here depends on the
// real date: every date is worked out from the clock the server reports.
//
// Safe in the fully parallel suite: each test signs up its own customer, and
// a clock belongs to one customer.

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

// A new customer with Checking, a payee, and their "today".
async function setUp(request: APIRequestContext) {
  await signUpCustomer(request, "Schedule Customer");
  const [checking] = (await moneyAccounts(request)).accounts;
  const payee = await addPayee(request, "City Power", "ACC-100234");
  const { today } = await readClock(request);
  fact("checking", checking.id);
  fact("balance", checking.balanceCents);
  fact("payeeId", payee.id);
  fact("today", today);
  return { checking, payee, today };
}

test.describe("The customer's clock", () => {
  // The clock starts on the real date, moves a whole day at a time, rejects
  // bad steps, and resets. The demo clock can't move.
  test("starts on the real date, moves forward in whole days, and comes back", async ({
    request,
    browser,
  }) => {
    expected(
      "offset 0 on the real date; +1 day, then +1 more by default; 400 for 0, 367, 1.5, -1; reset to offset 0; demo 403 and stays at 0; signed out 401",
    );
    // A new customer's clock starts on the real date.
    await signUpCustomer(request, "Clock Customer");
    const start = await readClock(request);
    expectSchema("BankClock", start);
    fact("realToday", start.realToday);
    expect(start.offsetDays).toBe(0);
    expect(start.today).toBe(start.realToday);

    // Forward one day.
    const one = await (
      await request.post("/api/bank/clock/advance", { data: { days: 1 } })
    ).json();
    expect(one.offsetDays).toBe(1);
    expect(one.today).toBe(addDays(start.realToday, 1));
    // No days given means one.
    const two = await (
      await request.post("/api/bank/clock/advance", { data: {} })
    ).json();
    expect(two.offsetDays).toBe(2);

    // No step, more than a year, a fraction, and backwards are refused.
    for (const days of [0, 367, 1.5, -1]) {
      const bad = await request.post("/api/bank/clock/advance", {
        data: { days },
      });
      expect(bad.status(), `days=${days}`).toBe(400);
    }

    // Reset brings it back to the real date.
    const back = await (
      await request.post("/api/bank/clock/reset", { data: {} })
    ).json();
    expect(back.offsetDays).toBe(0);
    expect(back.today).toBe(start.realToday);

    // Demo accounts are shared, so their clock stays on the real date.
    const demo = await browser.newContext();
    await signIn(demo.request, DEMO.customer);
    expect(
      (
        await demo.request.post("/api/bank/clock/advance", {
          data: { days: 1 },
        })
      ).status(),
    ).toBe(403);
    expect((await readClock(demo.request)).offsetDays).toBe(0);
    await demo.close();

    // Someone signed out has no clock.
    const visitor = await browser.newContext();
    expect((await visitor.request.get("/api/bank/clock")).status()).toBe(401);
    await visitor.close();
  });
});

test.describe("Scheduled payments", () => {
  // A one-off payment for tomorrow waits, then is paid when the customer's
  // clock reaches its run day, and the customer is told.
  test("a payment set for tomorrow is paid when the customer's tomorrow comes", async ({
    request,
  }) => {
    expected(
      "active, 0 runs, due tomorrow; nothing moves until the run day; then done, paid once, Checking -12050, a 'Power' bill payment and a scheduled_paid notification",
    );
    // Schedule $120.50 to City Power for tomorrow.
    const { checking, payee, today } = await setUp(request);
    const firstDue = addDays(today, 1);
    const created = await scheduleBill(request, {
      fromAccountId: checking.id,
      payeeId: payee.id,
      amountCents: 12_050,
      memo: "Power",
      firstDue,
    });
    fact("scheduleId", created.id);
    fact("runsOn", created.runsOn);
    expect(created.status).toBe("active");
    expect(created.runs).toBe(0);
    expect(created.nextDue).toBe(firstDue);
    // A weekend due date runs on the Monday after.
    expect(created.runsOn).toBe(businessDay(firstDue));

    // It is listed under the customer's today.
    const list = await listScheduled(request);
    expectSchema("BankScheduledPaymentsResponse", list);
    expect(list.today).toBe(today);
    // Nothing has moved yet.
    expect(await balanceOf(request, checking.id)).toBe(checking.balanceCents);

    // Move the clock to the run day: it was paid, once.
    await advanceClockTo(request, created.runsOn);
    const after = await scheduledById(request, created.id);
    expect(after.status).toBe("done");
    expect(after.runs).toBe(1);
    expect(after.lastResult).toBe("paid");
    expect(after.lastRunOn).toBe(created.runsOn);
    expect(await balanceOf(request, checking.id)).toBe(
      checking.balanceCents - 12_050,
    );

    // It is a bill payment like any other, with its memo, and the customer
    // is told.
    const payments = await (
      await request.get("/api/bank/bill-payments")
    ).json();
    expect(payments.payments.map((p: { memo: string }) => p.memo)).toContain(
      "Power",
    );
    const { notifications } = await (
      await request.get("/api/bank/notifications")
    ).json();
    expect(
      notifications.some((n: { kind: string }) => n.kind === "scheduled_paid"),
    ).toBe(true);
  });

  // A payment due on a Saturday waits through the weekend and is paid on Monday.
  test("a payment due on a weekend is paid on the Monday after", async ({
    request,
  }) => {
    expected(
      "runsOn Monday; still active on Saturday and Sunday with no money moved; done on Monday, Checking -5000",
    );
    // Schedule $50 for the next Saturday.
    const { checking, payee, today } = await setUp(request);
    const saturday = nextSaturday(addDays(today, 1));
    const sunday = addDays(saturday, 1);
    const monday = addDays(saturday, 2);
    fact("saturday", saturday);
    const created = await scheduleBill(request, {
      fromAccountId: checking.id,
      payeeId: payee.id,
      amountCents: 5_000,
      firstDue: saturday,
    });
    fact("scheduleId", created.id);
    expect(created.runsOn).toBe(monday);

    // Saturday and Sunday: still waiting, no money moved.
    await advanceClockTo(request, saturday);
    expect((await scheduledById(request, created.id)).status).toBe("active");
    await advanceClockTo(request, sunday);
    expect((await scheduledById(request, created.id)).status).toBe("active");
    expect(await balanceOf(request, checking.id)).toBe(checking.balanceCents);

    // Monday: paid.
    await advanceClockTo(request, monday);
    const after = await scheduledById(request, created.id);
    expect(after.status).toBe("done");
    expect(after.lastRunOn).toBe(monday);
    expect(await balanceOf(request, checking.id)).toBe(
      checking.balanceCents - 5_000,
    );
  });

  // A weekly payment is paid, then due again seven days later, and again.
  test("a weekly payment comes back every seven days", async ({ request }) => {
    expected(
      "after the first run: 1 run, active, paid, next due +7; after the second: 2 runs, next due +14; Checking -5000",
    );
    // A weekly $25 payment from the next weekday.
    const { checking, payee, today } = await setUp(request);
    const first = nextWeekday(addDays(today, 1));
    fact("first", first);
    const created = await scheduleBill(request, {
      fromAccountId: checking.id,
      payeeId: payee.id,
      amountCents: 2_500,
      repeat: "weekly",
      firstDue: first,
    });
    fact("scheduleId", created.id);

    // The first run, and the next one set a week later.
    await advanceClockTo(request, first);
    const once = await scheduledById(request, created.id);
    expect(once.runs).toBe(1);
    expect(once.status).toBe("active");
    expect(once.lastResult).toBe("paid");
    expect(once.nextDue).toBe(addDays(first, 7));

    // The second run, a week later.
    await advanceClockTo(request, addDays(first, 7));
    const twice = await scheduledById(request, created.id);
    expect(twice.runs).toBe(2);
    expect(twice.nextDue).toBe(addDays(first, 14));
    expect(await balanceOf(request, checking.id)).toBe(
      checking.balanceCents - 5_000,
    );
  });

  // A monthly payment on the 31st moves to the last day of a shorter month,
  // never skipping it.
  test("a monthly payment keeps its day, and the 31st becomes the last day of a shorter month", async ({
    request,
  }) => {
    expected(
      "anchorDay 31; after the first run: 1 run, active, next due on the last day of the next (shorter) month",
    );
    // A monthly $99 payment from the next 31st that is followed by a shorter month.
    const { checking, payee, today } = await setUp(request);
    const { date, clamped } = next31stBeforeShortMonth(addDays(today, 1));
    fact("first", date);
    fact("clamped", clamped);
    const created = await scheduleBill(request, {
      fromAccountId: checking.id,
      payeeId: payee.id,
      amountCents: 9_900,
      repeat: "monthly",
      firstDue: date,
    });
    fact("scheduleId", created.id);
    expect(created.anchorDay).toBe(31);

    // After it runs, the next due date is that month's last day.
    await advanceClockTo(request, created.runsOn);
    const after = await scheduledById(request, created.id);
    expect(after.runs).toBe(1);
    expect(after.status).toBe("active");
    // February 28, April 30 and the like: never the 31st of a month without
    // one, and never a skipped month.
    expect(after.nextDue).toBe(clamped);
  });

  // A payment bigger than the balance fails on its day, takes nothing, and
  // the customer is told.
  test("not enough money: the payment is skipped and the customer is told", async ({
    request,
  }) => {
    expected(
      "failed after 1 run, lastResult failed, balance unchanged, a scheduled_failed notification saying 'was not paid'",
    );
    // Schedule a dollar more than the balance for tomorrow.
    const { checking, payee, today } = await setUp(request);
    const created = await scheduleBill(request, {
      fromAccountId: checking.id,
      payeeId: payee.id,
      amountCents: checking.balanceCents + 100,
      firstDue: addDays(today, 1),
    });
    fact("scheduleId", created.id);

    // On its day it fails, and nothing leaves the account.
    await advanceClockTo(request, created.runsOn);
    const after = await scheduledById(request, created.id);
    expect(after.status).toBe("failed");
    expect(after.runs).toBe(1);
    expect(after.lastResult).toBe("failed");
    expect(await balanceOf(request, checking.id)).toBe(checking.balanceCents);
    // The customer is told it was not paid.
    const { notifications } = await (
      await request.get("/api/bank/notifications")
    ).json();
    const failed = notifications.find(
      (n: { kind: string }) => n.kind === "scheduled_failed",
    );
    expect(failed, JSON.stringify(notifications)).toBeDefined();
    expect(failed.title).toContain("was not paid");
  });

  // Cancelling stops a payment for good; bad fields are refused one by one;
  // another customer can't cancel it; the demo customer can only read.
  test("cancel, validation, and who may do what", async ({
    request,
    browser,
  }) => {
    expected(
      "cancel 200 cancelled, again 404 SCHEDULE_NOT_FOUND; it never runs; 400 naming each bad field; another customer 404; demo 403 to schedule, 200 to read",
    );
    // A payment for tomorrow, then cancelled; a second cancel finds nothing.
    const { checking, payee, today } = await setUp(request);
    const created = await scheduleBill(request, {
      fromAccountId: checking.id,
      payeeId: payee.id,
      amountCents: 1_000,
      firstDue: addDays(today, 1),
    });
    fact("scheduleId", created.id);

    const cancelled = await request.delete(
      `/api/bank/scheduled-payments/${created.id}`,
    );
    expect(cancelled.status()).toBe(200);
    expect((await cancelled.json()).payment.status).toBe("cancelled");
    const again = await request.delete(
      `/api/bank/scheduled-payments/${created.id}`,
    );
    expect(again.status()).toBe(404);
    expect((await again.json()).code).toBe("SCHEDULE_NOT_FOUND");

    // A cancelled payment never runs.
    // From here on, dates count from the moved clock. When tomorrow is a
    // weekend, runsOn is the Monday after it, so the old "tomorrow" is past.
    const now = await advanceClockTo(request, created.runsOn);
    fact("now", now);
    expect((await scheduledById(request, created.id)).status).toBe("cancelled");
    expect(await balanceOf(request, checking.id)).toBe(checking.balanceCents);

    // Field errors, one at a time.
    const cases: [Record<string, unknown>, string][] = [
      [{ firstDue: addDays(now, -1) }, "firstDue"],
      [{ firstDue: "2026-02-30" }, "firstDue"],
      [{ firstDue: "soon" }, "firstDue"],
      [{ repeat: "daily" }, "repeat"],
      [{ amountCents: 0 }, "amountCents"],
      [{ payeeId: "" }, "payeeId"],
    ];
    for (const [change, field] of cases) {
      const response = await request.post("/api/bank/scheduled-payments", {
        data: {
          fromAccountId: checking.id,
          payeeId: payee.id,
          amountCents: 1_000,
          firstDue: addDays(now, 1),
          ...change,
        },
      });
      expect(response.status(), field).toBe(400);
      expect(Object.keys((await response.json()).errors), field).toContain(
        field,
      );
    }

    // Another customer cannot cancel mine.
    const other = await browser.newContext();
    await signUpCustomer(other.request, "Other Customer");
    const mine = await scheduleBill(request, {
      fromAccountId: checking.id,
      payeeId: payee.id,
      amountCents: 1_000,
      firstDue: addDays(now, 1),
    });
    expect(
      (
        await other.request.delete(`/api/bank/scheduled-payments/${mine.id}`)
      ).status(),
    ).toBe(404);
    await other.close();

    // Demo accounts are read-only here too.
    const demo = await browser.newContext();
    await signIn(demo.request, DEMO.customer);
    const demoPost = await demo.request.post("/api/bank/scheduled-payments", {
      data: {
        fromAccountId: checking.id,
        payeeId: payee.id,
        amountCents: 1_000,
        firstDue: addDays(now, 1),
      },
    });
    expect(demoPost.status()).toBe(403);
    expect(
      (await demo.request.get("/api/bank/scheduled-payments")).status(),
    ).toBe(200);
    await demo.close();
  });
});
