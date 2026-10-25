import { expect, test } from "@playwright/test";
import { armFlags } from "./_helpers";
import { addPayee, moneyAccounts, signUpCustomer, uniqueRunKey } from "./_bank";
import {
  addDays,
  advanceClockTo,
  next31stBeforeShortMonth,
  readClock,
  scheduleBill,
  scheduledById,
} from "./_schedule";

// The scheduled payments' planted bug, armed for one run key only. The sweep
// that runs due payments reads the flag from the request that triggers it, so
// the clock is moved with the run key in the query string. Without the flag
// the same steps clamp the day, which api-bank-scheduled.spec.ts checks.

test("bankMonthlyRepeatOverflow: a monthly payment set for the 31st skips the short month", async ({
  request,
}) => {
  const runKey = uniqueRunKey("monthly-overflow");
  await armFlags(request, runKey, { bankMonthlyRepeatOverflow: true });

  await signUpCustomer(request, "Overflow Customer");
  const [checking] = (await moneyAccounts(request)).accounts;
  const payee = await addPayee(request, "Bay Homes Rent", "UNIT-12B");
  const { today } = await readClock(request);
  const { date, clamped } = next31stBeforeShortMonth(addDays(today, 1));
  const created = await scheduleBill(request, {
    fromAccountId: checking.id,
    payeeId: payee.id,
    amountCents: 150_000,
    repeat: "monthly",
    firstDue: date,
  });

  await advanceClockTo(request, created.runsOn, `?runKey=${runKey}`);
  const after = await scheduledById(request, created.id);
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
