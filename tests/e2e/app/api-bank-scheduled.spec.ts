import { readFileSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { expect, test, type APIRequestContext } from "@playwright/test";
import {
  DEMO,
  addPayee,
  balanceOf,
  moneyAccounts,
  signIn,
  signUpCustomer,
} from "./_bank";
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
} from "./_schedule";

// Scheduled payments and the customer's own clock (phase A2). A payment is
// due on a date; it runs when the customer's "today" reaches it, which a test
// brings about by moving that customer's clock. Nothing here depends on the
// real date: every date is worked out from the clock the server reports.
//
// Safe in the fully parallel suite: each test signs up its own customer, and
// a clock belongs to one customer.

const openApiSpec = JSON.parse(readFileSync("openapi.json", "utf8"));
const ajv = new Ajv2020({
  strict: false,
  allErrors: true,
  validateSchema: false,
});
addFormats(ajv);
ajv.addSchema(openApiSpec, "openapi.json");

function expectSchema(schemaName: string, body: unknown) {
  const validate = ajv.compile({
    $ref: `openapi.json#/components/schemas/${schemaName}`,
  });
  expect(validate(body), JSON.stringify(validate.errors, null, 2)).toBe(true);
}

async function setUp(request: APIRequestContext) {
  await signUpCustomer(request, "Schedule Customer");
  const [checking] = (await moneyAccounts(request)).accounts;
  const payee = await addPayee(request, "City Power", "ACC-100234");
  const { today } = await readClock(request);
  return { checking, payee, today };
}

test.describe("The customer's clock", () => {
  test("starts on the real date, moves forward in whole days, and comes back", async ({
    request,
    browser,
  }) => {
    await signUpCustomer(request, "Clock Customer");
    const start = await readClock(request);
    expectSchema("BankClock", start);
    expect(start.offsetDays).toBe(0);
    expect(start.today).toBe(start.realToday);

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

    for (const days of [0, 367, 1.5, -1]) {
      const bad = await request.post("/api/bank/clock/advance", {
        data: { days },
      });
      expect(bad.status(), `days=${days}`).toBe(400);
    }

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

    const visitor = await browser.newContext();
    expect((await visitor.request.get("/api/bank/clock")).status()).toBe(401);
    await visitor.close();
  });
});

test.describe("Scheduled payments", () => {
  test("a payment set for tomorrow is paid when the customer's tomorrow comes", async ({
    request,
  }) => {
    const { checking, payee, today } = await setUp(request);
    const firstDue = addDays(today, 1);
    const created = await scheduleBill(request, {
      fromAccountId: checking.id,
      payeeId: payee.id,
      amountCents: 12_050,
      memo: "Power",
      firstDue,
    });
    expect(created.status).toBe("active");
    expect(created.runs).toBe(0);
    expect(created.nextDue).toBe(firstDue);
    expect(created.runsOn).toBe(businessDay(firstDue));

    const list = await listScheduled(request);
    expectSchema("BankScheduledPaymentsResponse", list);
    expect(list.today).toBe(today);
    // Nothing has moved yet.
    expect(await balanceOf(request, checking.id)).toBe(checking.balanceCents);

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

  test("a payment due on a weekend is paid on the Monday after", async ({
    request,
  }) => {
    const { checking, payee, today } = await setUp(request);
    const saturday = nextSaturday(addDays(today, 1));
    const sunday = addDays(saturday, 1);
    const monday = addDays(saturday, 2);
    const created = await scheduleBill(request, {
      fromAccountId: checking.id,
      payeeId: payee.id,
      amountCents: 5_000,
      firstDue: saturday,
    });
    expect(created.runsOn).toBe(monday);

    await advanceClockTo(request, saturday);
    expect((await scheduledById(request, created.id)).status).toBe("active");
    await advanceClockTo(request, sunday);
    expect((await scheduledById(request, created.id)).status).toBe("active");
    expect(await balanceOf(request, checking.id)).toBe(checking.balanceCents);

    await advanceClockTo(request, monday);
    const after = await scheduledById(request, created.id);
    expect(after.status).toBe("done");
    expect(after.lastRunOn).toBe(monday);
    expect(await balanceOf(request, checking.id)).toBe(
      checking.balanceCents - 5_000,
    );
  });

  test("a weekly payment comes back every seven days", async ({ request }) => {
    const { checking, payee, today } = await setUp(request);
    const first = nextWeekday(addDays(today, 1));
    const created = await scheduleBill(request, {
      fromAccountId: checking.id,
      payeeId: payee.id,
      amountCents: 2_500,
      repeat: "weekly",
      firstDue: first,
    });

    await advanceClockTo(request, first);
    const once = await scheduledById(request, created.id);
    expect(once.runs).toBe(1);
    expect(once.status).toBe("active");
    expect(once.lastResult).toBe("paid");
    expect(once.nextDue).toBe(addDays(first, 7));

    await advanceClockTo(request, addDays(first, 7));
    const twice = await scheduledById(request, created.id);
    expect(twice.runs).toBe(2);
    expect(twice.nextDue).toBe(addDays(first, 14));
    expect(await balanceOf(request, checking.id)).toBe(
      checking.balanceCents - 5_000,
    );
  });

  test("a monthly payment keeps its day, and the 31st becomes the last day of a shorter month", async ({
    request,
  }) => {
    const { checking, payee, today } = await setUp(request);
    const { date, clamped } = next31stBeforeShortMonth(addDays(today, 1));
    const created = await scheduleBill(request, {
      fromAccountId: checking.id,
      payeeId: payee.id,
      amountCents: 9_900,
      repeat: "monthly",
      firstDue: date,
    });
    expect(created.anchorDay).toBe(31);

    await advanceClockTo(request, created.runsOn);
    const after = await scheduledById(request, created.id);
    expect(after.runs).toBe(1);
    expect(after.status).toBe("active");
    // February 28, April 30 and the like: never the 31st of a month without
    // one, and never a skipped month.
    expect(after.nextDue).toBe(clamped);
  });

  test("not enough money: the payment is skipped and the customer is told", async ({
    request,
  }) => {
    const { checking, payee, today } = await setUp(request);
    const created = await scheduleBill(request, {
      fromAccountId: checking.id,
      payeeId: payee.id,
      amountCents: checking.balanceCents + 100,
      firstDue: addDays(today, 1),
    });

    await advanceClockTo(request, created.runsOn);
    const after = await scheduledById(request, created.id);
    expect(after.status).toBe("failed");
    expect(after.runs).toBe(1);
    expect(after.lastResult).toBe("failed");
    expect(await balanceOf(request, checking.id)).toBe(checking.balanceCents);
    const { notifications } = await (
      await request.get("/api/bank/notifications")
    ).json();
    const failed = notifications.find(
      (n: { kind: string }) => n.kind === "scheduled_failed",
    );
    expect(failed, JSON.stringify(notifications)).toBeDefined();
    expect(failed.title).toContain("was not paid");
  });

  test("cancel, validation, and who may do what", async ({
    request,
    browser,
  }) => {
    const { checking, payee, today } = await setUp(request);
    const created = await scheduleBill(request, {
      fromAccountId: checking.id,
      payeeId: payee.id,
      amountCents: 1_000,
      firstDue: addDays(today, 1),
    });

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
    await advanceClockTo(request, created.runsOn);
    expect((await scheduledById(request, created.id)).status).toBe("cancelled");
    expect(await balanceOf(request, checking.id)).toBe(checking.balanceCents);

    // Field errors, one at a time.
    const cases: [Record<string, unknown>, string][] = [
      [{ firstDue: addDays(today, -1) }, "firstDue"],
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
          firstDue: addDays(today, 1),
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
      firstDue: addDays(today, 1),
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
        firstDue: addDays(today, 1),
      },
    });
    expect(demoPost.status()).toBe(403);
    expect(
      (await demo.request.get("/api/bank/scheduled-payments")).status(),
    ).toBe(200);
    await demo.close();
  });
});
