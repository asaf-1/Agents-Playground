// Playwright's test tools, with the [RESULT] block printed after every test.
import {
  expect,
  expected,
  fact,
  test,
} from "../../../framework/fixtures/resultBlock";
// Arms a planted bug for one runKey.
import { armFlags } from "../../../framework/helpers/flags";
// The bank helpers: payees, accounts, sign up, a unique runKey.
import {
  addPayee,
  moneyAccounts,
  signUpCustomer,
  uniqueRunKey,
} from "../../../framework/helpers/bank";
// The customer's clock, calendar arithmetic, and the scheduled-payment calls.
import {
  addDays,
  advanceClockTo,
  next31stBeforeShortMonth,
  readClock,
  scheduleBill,
  scheduledById,
} from "../../../framework/helpers/schedule";

// The scheduled payments' planted bug, armed for one run key only. The sweep
// that runs due payments reads the flag from the request that triggers it, so
// the clock is moved with the run key in the query string. Without the flag
// the same steps clamp the day, which api-bank-scheduled.spec.ts checks.

// With the bug armed, a monthly payment on the 31st rolls past a shorter month
// instead of landing on its last day.
test("bankMonthlyRepeatOverflow: a monthly payment set for the 31st skips the short month", async ({
  request,
}) => {
  expected(
    "with bankMonthlyRepeatOverflow armed: after 1 run, next due is not the short month's last day but day 1-3 of the month after",
  );
  // Arm the bug for this runKey.
  const runKey = uniqueRunKey("monthly-overflow");
  await armFlags(request, runKey, { bankMonthlyRepeatOverflow: true });

  // A new customer schedules $1,500 rent monthly from the next suitable 31st.
  await signUpCustomer(request, "Overflow Customer");
  const [checking] = (await moneyAccounts(request)).accounts;
  const payee = await addPayee(request, "Bay Homes Rent", "UNIT-12B");
  const { today } = await readClock(request);
  const { date, clamped } = next31stBeforeShortMonth(addDays(today, 1));
  fact("first", date);
  fact("clamped", clamped);
  const created = await scheduleBill(request, {
    fromAccountId: checking.id,
    payeeId: payee.id,
    amountCents: 150_000,
    repeat: "monthly",
    firstDue: date,
  });
  fact("scheduleId", created.id);

  // Move the clock to the run day with the runKey, so the armed sweep runs it.
  await advanceClockTo(request, created.runsOn, `?runKey=${runKey}`);
  const after = await scheduledById(request, created.id);
  fact("nextDue", after.nextDue);
  expect(after.runs).toBe(1);

  // Correct: the last day of the shorter month. Armed: the day rolled over
  // into the month after it, early in that month, and the short month is
  // never paid.
  expect(after.nextDue).not.toBe(clamped);
  const [, clampedMonth] = clamped.split("-").map(Number);
  const [, month, day] = after.nextDue.split("-").map(Number);
  expect(month).toBe(clampedMonth === 12 ? 1 : clampedMonth + 1);
  expect(day).toBeLessThanOrEqual(3);
});
