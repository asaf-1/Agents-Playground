const crypto = require("crypto");
const bills = require("./bills");
const { InsufficientFundsError, cents } = require("./money");
const { notify } = require("./notify");

// Scheduled payments, and the clock they run on.
//
// A customer schedules a bill for a date, once or on a repeat. Nothing runs in
// the background: a due payment is paid the next time that customer shows up
// (every request to the bank runs `runDue` for them first), and when they
// move their clock on the Practice page. That keeps the behaviour the same on
// a laptop, in CI and on Render, and makes a test deterministic: schedule for
// tomorrow, advance a day, look.
//
// The clock is the customer's own. Their "today" is the real date plus an
// offset they chose, in whole days, forward only. Everyone else's today is
// the real one. Dates are UTC calendar days as "YYYY-MM-DD" strings, the same
// convention the history uses.

const REPEATS = ["once", "weekly", "monthly"];
const MAX_ADVANCE_DAYS = 366; // in one step
const MAX_OFFSET_DAYS = 3660; // in all, about ten years
const MAX_RUNS_PER_SWEEP = 60; // a safety stop, not a rule anyone should meet

class ClockTooFarError extends Error {}

// --- Calendar arithmetic ------------------------------------------------------

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function parseDate(text) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text || "")) {
    return null;
  }
  const date = new Date(`${text}T00:00:00Z`);
  return Number.isNaN(date.getTime()) && isoDate(date) !== text ? null : date;
}

function isValidDate(text) {
  const date = parseDate(text);
  return date !== null && isoDate(date) === text;
}

function addDays(text, days) {
  const date = parseDate(text);
  date.setUTCDate(date.getUTCDate() + days);
  return isoDate(date);
}

function dayOfWeek(text) {
  return parseDate(text).getUTCDay(); // 0 Sunday … 6 Saturday
}

// Banks do not pay on weekends: a payment due on a Saturday or a Sunday runs
// on the Monday after. Holidays are left out on purpose; they differ by
// country and this bank has none.
function businessDay(text) {
  const dow = dayOfWeek(text);
  if (dow === 6) return addDays(text, 2);
  if (dow === 0) return addDays(text, 1);
  return text;
}

function daysInMonth(year, monthIndex) {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

// The date after `text` for a repeat. Monthly keeps the day the schedule was
// made for (anchorDay), clamped to the length of the next month, so the 31st
// becomes the 30th or the 28th and returns to the 31st when a month has one.
//
// INTENTIONAL DEFECT (bankMonthlyRepeatOverflow, REPORT): with the flag armed
// the day is not clamped, and JavaScript's Date rolls a day that does not
// exist over into the month after: January 31 plus one month becomes March 3,
// so February is never paid.
function nextDue(text, repeat, anchorDay, { overflowBug = false } = {}) {
  if (repeat === "weekly") {
    return addDays(text, 7);
  }
  if (repeat === "monthly") {
    const [year, month] = text.split("-").map(Number); // month 1..12
    const nextYear = month === 12 ? year + 1 : year;
    const nextMonthIndex = month === 12 ? 0 : month;
    const day = overflowBug
      ? anchorDay
      : Math.min(anchorDay, daysInMonth(nextYear, nextMonthIndex));
    return isoDate(new Date(Date.UTC(nextYear, nextMonthIndex, day)));
  }
  return null;
}

// --- The clock ----------------------------------------------------------------

async function getClock(db, userId) {
  const { rows } = await db.query(
    "SELECT offset_days FROM bank_clocks WHERE user_id = $1",
    [userId],
  );
  const offsetDays = rows[0] ? Number(rows[0].offset_days) : 0;
  const realToday = isoDate(new Date());
  return { realToday, offsetDays, today: addDays(realToday, offsetDays) };
}

async function advanceClock(db, userId, days) {
  const { offsetDays } = await getClock(db, userId);
  if (offsetDays + days > MAX_OFFSET_DAYS) {
    throw new ClockTooFarError("too far");
  }
  await db.query(
    `INSERT INTO bank_clocks (user_id, offset_days, updated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (user_id) DO UPDATE
       SET offset_days = bank_clocks.offset_days + $2, updated_at = now()`,
    [userId, days],
  );
  return getClock(db, userId);
}

async function resetClock(db, userId) {
  await db.query("DELETE FROM bank_clocks WHERE user_id = $1", [userId]);
  return getClock(db, userId);
}

// --- Schedules ----------------------------------------------------------------

const SELECT = `
  SELECT s.id, s.user_id, s.account_id, s.payee_id, s.amount_cents, s.memo,
         s.repeat, s.anchor_day, s.next_due::text AS next_due, s.status, s.runs,
         s.last_run_on::text AS last_run_on, s.last_result, s.created_at,
         p.name AS payee_name, p.reference AS payee_reference,
         a.name AS account_name
    FROM bank_scheduled_payments s
    JOIN bank_payees p ON p.id = s.payee_id
    JOIN bank_money_accounts a ON a.id = s.account_id`;

function toSchedule(row) {
  return {
    id: row.id,
    accountId: row.account_id,
    accountName: row.account_name,
    payeeId: row.payee_id,
    payeeName: row.payee_name,
    payeeReference: row.payee_reference,
    amountCents: cents(row.amount_cents),
    memo: row.memo,
    repeat: row.repeat,
    // The day of the month the schedule was made for; a monthly repeat
    // returns to it after a shorter month.
    anchorDay: Number(row.anchor_day),
    nextDue: row.next_due,
    // The day it actually runs: the Monday after, for a weekend date.
    runsOn: businessDay(row.next_due),
    status: row.status,
    runs: Number(row.runs),
    lastRunOn: row.last_run_on || null,
    lastResult: row.last_result || null,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

async function createSchedule(
  db,
  { userId, from, payee, amountCents, memo, repeat, firstDue },
) {
  const id = crypto.randomUUID();
  await db.query(
    `INSERT INTO bank_scheduled_payments
       (id, user_id, account_id, payee_id, amount_cents, memo, repeat, anchor_day, next_due)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::date)`,
    [
      id,
      userId,
      from.id,
      payee.id,
      amountCents,
      memo,
      repeat,
      Number(firstDue.slice(8, 10)),
      firstDue,
    ],
  );
  return findSchedule(db, userId, id);
}

async function findSchedule(db, userId, id) {
  const { rows } = await db.query(
    `${SELECT} WHERE s.user_id = $1 AND s.id = $2`,
    [userId, id],
  );
  return rows[0] ? toSchedule(rows[0]) : null;
}

// Active ones first, soonest first; then the finished ones, newest first.
async function listSchedules(db, userId) {
  const { rows } = await db.query(
    `${SELECT} WHERE s.user_id = $1
      ORDER BY (s.status = 'active') DESC, s.next_due ASC, s.created_at DESC`,
    [userId],
  );
  return rows.map(toSchedule);
}

async function cancelSchedule(db, userId, id) {
  const { rows } = await db.query(
    `UPDATE bank_scheduled_payments SET status = 'cancelled'
      WHERE user_id = $1 AND id = $2 AND status = 'active'
     RETURNING id`,
    [userId, id],
  );
  return rows[0] ? findSchedule(db, userId, id) : null;
}

// --- Running what is due --------------------------------------------------------

// Pays every schedule of this customer whose run day has arrived on their
// clock. Each period is paid at most once: the bill payment carries an
// idempotency key made of the schedule and its due date, and the row is
// advanced with a compare-and-set on that same date, so two sweeps at once
// cannot pay or advance twice.
async function runDue(db, user, { today, overflowBug = false } = {}) {
  const due = await db.query(
    `${SELECT}
      WHERE s.user_id = $1 AND s.status = 'active'
        AND (s.next_due + (CASE EXTRACT(DOW FROM s.next_due)
                             WHEN 6 THEN 2 WHEN 0 THEN 1 ELSE 0 END)::int)
            <= $2::date
      ORDER BY s.next_due, s.created_at`,
    [user.id, today],
  );
  let paid = 0;
  for (const row of due.rows) {
    paid += await runOne(db, user, toSchedule(row), { today, overflowBug });
  }
  return paid;
}

async function runOne(db, user, schedule, { today, overflowBug }) {
  let current = schedule;
  let paid = 0;
  let steps = 0;
  while (
    current.status === "active" &&
    businessDay(current.nextDue) <= today &&
    steps < MAX_RUNS_PER_SWEEP
  ) {
    steps += 1;
    const key = `scheduled:${current.id}:${current.nextDue}`;
    const memo = current.memo || `Scheduled payment, ${current.repeat}`;
    let result = "paid";
    try {
      await bills.payBill(db, {
        userId: user.id,
        from: { id: current.accountId },
        payee: {
          id: current.payeeId,
          name: current.payeeName,
          reference: current.payeeReference,
        },
        amountCents: current.amountCents,
        memo,
        key,
      });
    } catch (error) {
      if (!(error instanceof InsufficientFundsError)) {
        throw error;
      }
      result = "failed";
    }

    const amount = `$${(current.amountCents / 100).toFixed(2)}`;
    await notify(db, {
      userId: user.id,
      kind: result === "paid" ? "scheduled_paid" : "scheduled_failed",
      title:
        result === "paid"
          ? `Scheduled payment of ${amount} to ${current.payeeName} was paid`
          : `Scheduled payment of ${amount} to ${current.payeeName} was not paid`,
      body:
        result === "paid"
          ? `Due ${current.nextDue}, paid from ${current.accountName} on ${today}.`
          : `Due ${current.nextDue}: ${current.accountName} did not hold ${amount}. This payment was skipped.`,
      link: "/bank/bills",
      amountCents: result === "paid" ? -current.amountCents : null,
    });

    const next =
      current.repeat === "once"
        ? null
        : nextDue(current.nextDue, current.repeat, current.anchorDay, {
            overflowBug,
          });
    const status =
      current.repeat === "once"
        ? result === "paid"
          ? "done"
          : "failed"
        : "active";

    // Compare-and-set on the due date: if another sweep already moved this
    // schedule on, nothing here applies and the loop ends.
    const moved = await db.query(
      `UPDATE bank_scheduled_payments
          SET runs = runs + 1, last_run_on = $2::date, last_result = $3,
              status = $4, next_due = COALESCE($5::date, next_due)
        WHERE id = $1 AND status = 'active' AND next_due = $6::date
      RETURNING id`,
      [current.id, today, result, status, next, current.nextDue],
    );
    if (moved.rows.length === 0) {
      break;
    }
    if (result === "paid") paid += 1;
    current = { ...current, status, nextDue: next ?? current.nextDue };
  }
  return paid;
}

module.exports = {
  ClockTooFarError,
  MAX_ADVANCE_DAYS,
  MAX_OFFSET_DAYS,
  REPEATS,
  addDays,
  advanceClock,
  businessDay,
  cancelSchedule,
  createSchedule,
  findSchedule,
  getClock,
  isValidDate,
  listSchedules,
  nextDue,
  resetClock,
  runDue,
};
