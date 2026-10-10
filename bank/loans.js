const crypto = require("crypto");
const { UUID, cents, insertTransaction } = require("./money");
const { notify } = require("./notify");

// Loans: a customer asks, an Admin approves or rejects, and approving pays the
// amount into the customer's account. The rate and the monthly payment are
// fixed when the loan is asked for. Repayments aren't part of the bank yet;
// the schedule shows what they would be.
//
// THE RATE IS NOT A RATE CARD. There is no table of "12 months costs 5.90%".
// A rate is worked out for the customer asking, from what the bank can see of
// them: what they hold, how long they have banked here, how their earlier
// loans went, how much they use the account, and how big this ask is next to
// their own money. Two customers asking for the same loan on the same day get
// different offers, and the same customer's offer moves as their balance does
// -- so spending money, or buying crypto with it, makes their next loan dearer.

// The terms the bank offers. A product choice, not a price.
const TERM_MONTHS = [12, 24, 36, 60];
const MIN_LOAN_CENTS = 100_000;
const MAX_LOAN_CENTS = 100_000_000;
const MAX_PENDING = 3;

// The shape of the rate. Longer money costs more everywhere, so the term sets
// where the curve starts; the customer's own standing moves it from there.
const BASE_BP = 420;
const TERM_BP_PER_MONTH = 6;
const MAX_DISCOUNT_BP = 240;
const MAX_EXPOSURE_BP = 300;
const MIN_APR_BP = 350;
const MAX_APR_BP = 1600;

const DAY_MS = 86_400_000;

function clamp(value, low, high) {
  return Math.min(high, Math.max(low, value));
}

// Everything the bank knows about this customer that bears on a rate, each
// turned into a 0..1 factor so the weights below are readable.
async function standingFor(db, userId) {
  const held = await db.query(
    `SELECT COALESCE(SUM(balance_cents), 0) AS total, MIN(created_at) AS since
       FROM bank_money_accounts WHERE user_id = $1`,
    [userId],
  );
  const decided = await db.query(
    `SELECT status, count(*) AS n FROM bank_loans
      WHERE user_id = $1 GROUP BY status`,
    [userId],
  );
  const used = await db.query(
    `SELECT count(*) AS n FROM bank_transactions t
       JOIN bank_money_accounts a ON a.id = t.account_id
      WHERE a.user_id = $1`,
    [userId],
  );

  const balanceCents = cents(held.rows[0].total);
  const since = held.rows[0].since ? new Date(held.rows[0].since) : null;
  const tenureDays = since
    ? Math.max(0, Math.floor((Date.now() - since.getTime()) / DAY_MS))
    : 0;

  const byStatus = Object.fromEntries(
    decided.rows.map((row) => [row.status, Number(row.n)]),
  );
  const approved = byStatus.approved || 0;
  const rejected = byStatus.rejected || 0;
  const transactions = Number(used.rows[0].n);

  // What they hold. tanh flattens out, so a millionaire is not infinitely
  // better than someone comfortable: $200,000 already scores about 0.76.
  const balance = Math.tanh(balanceCents / 20_000_000);
  // How long they have banked here, full marks at a year.
  const tenure = clamp(tenureDays / 365, 0, 1);
  // How earlier loans went. No history is neutral, not bad.
  const history =
    approved + rejected === 0 ? 0.5 : approved / (approved + rejected);
  // How much they actually use the account.
  const activity = Math.tanh(transactions / 40);

  const score = clamp(
    balance * 0.4 + tenure * 0.2 + history * 0.25 + activity * 0.15,
    0,
    1,
  );

  return {
    balanceCents,
    tenureDays,
    loansApproved: approved,
    loansRejected: rejected,
    transactions,
    factors: { balance, tenure, history, activity },
    score,
  };
}

// Somebody the bank has never seen: a brand-new customer gets this before
// their first account exists, and it is what quote() assumes if no standing is
// passed in, so the function stays pure and testable.
const UNKNOWN_STANDING = {
  balanceCents: 0,
  tenureDays: 0,
  loansApproved: 0,
  loansRejected: 0,
  transactions: 0,
  factors: { balance: 0, tenure: 0, history: 0.5, activity: 0 },
  score: 0.125,
};

// The rate this customer is offered for this ask, and the reasons, so the page
// can tell them why rather than just showing a number.
function rateFor(amountCents, termMonths, standing = UNKNOWN_STANDING) {
  const termBp = BASE_BP + termMonths * TERM_BP_PER_MONTH;
  const discountBp = Math.round(standing.score * MAX_DISCOUNT_BP);

  // How big the ask is next to what they already hold. Squared, so a small
  // loan against a healthy balance costs almost nothing extra and a loan far
  // past their means costs a lot.
  const exposure =
    amountCents / Math.max(1, standing.balanceCents + amountCents);
  const exposureBp = Math.round(exposure * exposure * MAX_EXPOSURE_BP);

  const aprBasisPoints = clamp(
    termBp - discountBp + exposureBp,
    MIN_APR_BP,
    MAX_APR_BP,
  );

  return {
    aprBasisPoints,
    reasons: {
      termBp,
      discountBp,
      exposureBp,
      score: Math.round(standing.score * 1000) / 1000,
      exposure: Math.round(exposure * 1000) / 1000,
      balanceCents: standing.balanceCents,
      tenureDays: standing.tenureDays,
      loansApproved: standing.loansApproved,
      loansRejected: standing.loansRejected,
      transactions: standing.transactions,
    },
  };
}

class TooManyPendingError extends Error {}
class AlreadyDecidedError extends Error {}

// The standard fixed-payment formula: payment = P x r / (1 - (1 + r)^-n), with
// r the monthly rate. Rounded to the nearest cent.
function correctPayment(amountCents, termMonths, aprBasisPoints) {
  const rate = aprBasisPoints / 10_000 / 12;
  return Math.round(
    (amountCents * rate) / (1 - Math.pow(1 + rate, -termMonths)),
  );
}

// Month by month: interest on what is still owed, the rest of the payment
// pays the loan down. The last payment takes whatever is left, so the balance
// ends at exactly zero.
function buildSchedule(
  amountCents,
  termMonths,
  aprBasisPoints,
  payment,
  adjustLast,
) {
  const rate = aprBasisPoints / 10_000 / 12;
  const schedule = [];
  let balance = amountCents;
  let totalInterest = 0;
  let totalRepaid = 0;
  for (let month = 1; month <= termMonths; month += 1) {
    const interest = Math.round(balance * rate);
    let principal = payment - interest;
    let paid = payment;
    if (month === termMonths && adjustLast) {
      principal = balance;
      paid = principal + interest;
    }
    balance -= principal;
    totalInterest += interest;
    totalRepaid += paid;
    schedule.push({
      month,
      paymentCents: paid,
      principalCents: principal,
      interestCents: interest,
      balanceCents: balance,
    });
  }
  return { schedule, totalInterest, totalRepaid };
}

function quote(
  amountCents,
  termMonths,
  { roundingBug = false, standing = UNKNOWN_STANDING } = {},
) {
  const { aprBasisPoints, reasons } = rateFor(
    amountCents,
    termMonths,
    standing,
  );
  const rate = aprBasisPoints / 10_000 / 12;
  const exact = (amountCents * rate) / (1 - Math.pow(1 + rate, -termMonths));
  // INTENTIONAL DEFECT (bankLoanRounding, REPORT): cuts the cents off the
  // payment instead of rounding, and never settles the last month, so the
  // payments don't pay the loan off: a balance is left at the end.
  const payment = roundingBug ? Math.floor(exact) : Math.round(exact);
  const { schedule, totalInterest, totalRepaid } = buildSchedule(
    amountCents,
    termMonths,
    aprBasisPoints,
    payment,
    !roundingBug,
  );
  return {
    amountCents,
    termMonths,
    aprBasisPoints,
    monthlyPaymentCents: payment,
    totalInterestCents: totalInterest,
    totalRepaidCents: totalRepaid,
    schedule,
    // Why this customer got this rate. The page shows it, so the offer is
    // explainable instead of arbitrary.
    rate: reasons,
  };
}

// A stored loan's schedule, rebuilt from what was fixed when it was asked.
function scheduleFor(row) {
  const amount = cents(row.amount_cents);
  const payment = cents(row.monthly_payment_cents);
  return buildSchedule(
    amount,
    row.term_months,
    row.apr_basis_points,
    payment,
    payment === correctPayment(amount, row.term_months, row.apr_basis_points),
  ).schedule;
}

function toLoan(row) {
  const loan = {
    id: row.id,
    accountId: row.account_id,
    accountNumber: row.account_number,
    amountCents: cents(row.amount_cents),
    termMonths: row.term_months,
    aprBasisPoints: row.apr_basis_points,
    monthlyPaymentCents: cents(row.monthly_payment_cents),
    totalInterestCents: cents(row.total_interest_cents),
    purpose: row.purpose,
    status: row.status,
    decisionNote: row.decision_note,
    decidedAt: row.decided_at ? new Date(row.decided_at).toISOString() : null,
    createdAt: new Date(row.created_at).toISOString(),
  };
  if (row.customer_email !== undefined) {
    loan.customer = {
      id: row.user_id,
      fullName: row.customer_name,
      email: row.customer_email,
      isDemo: Boolean(row.customer_is_demo),
    };
  }
  return loan;
}

const LOAN_SELECT = `
  SELECT l.*, a.number AS account_number,
         u.full_name AS customer_name, u.email AS customer_email,
         u.is_demo AS customer_is_demo
    FROM bank_loans l
    JOIN bank_money_accounts a ON a.id = l.account_id
    JOIN bank_users u ON u.id = l.user_id`;

async function findLoan(db, id) {
  if (!UUID.test(String(id))) {
    return null;
  }
  const { rows } = await db.query(`${LOAN_SELECT} WHERE l.id = $1`, [id]);
  return rows[0] || null;
}

function withoutCustomer(row) {
  const { customer_email: _email, customer_name: _name, ...rest } = row;
  return rest;
}

async function listLoans(db, userId) {
  const { rows } = await db.query(
    `${LOAN_SELECT} WHERE l.user_id = $1 ORDER BY l.created_at DESC`,
    [userId],
  );
  return rows.map((row) => toLoan(withoutCustomer(row)));
}

// The staff queue: pending first, newest first inside each status.
async function listAllLoans(db, status) {
  const { rows } = status
    ? await db.query(
        `${LOAN_SELECT} WHERE l.status = $1 ORDER BY l.created_at DESC LIMIT 200`,
        [status],
      )
    : await db.query(
        `${LOAN_SELECT}
          ORDER BY (l.status = 'pending') DESC, l.created_at DESC LIMIT 200`,
      );
  return rows.map(toLoan);
}

async function requestLoan(
  db,
  { userId, account, amountCents, termMonths, purpose, roundingBug },
) {
  // The rate is worked out from the customer's standing at the moment they
  // ask, and then fixed on the row: a later change to their balance moves
  // their NEXT offer, never a loan they already hold.
  const terms = quote(amountCents, termMonths, {
    roundingBug,
    standing: await standingFor(db, userId),
  });
  const id = crypto.randomUUID();
  await db.transaction(async (tx) => {
    const { rows } = await tx.query(
      `SELECT count(*) AS total FROM bank_loans
        WHERE user_id = $1 AND status = 'pending'`,
      [userId],
    );
    if (Number(rows[0].total) >= MAX_PENDING) {
      throw new TooManyPendingError("too many pending loans");
    }
    await tx.query(
      `INSERT INTO bank_loans
         (id, user_id, account_id, amount_cents, term_months, apr_basis_points,
          monthly_payment_cents, total_interest_cents, purpose)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        id,
        userId,
        account.id,
        amountCents,
        termMonths,
        terms.aprBasisPoints,
        terms.monthlyPaymentCents,
        terms.totalInterestCents,
        purpose,
      ],
    );
  });
  return toLoan(withoutCustomer(await findLoan(db, id)));
}

// Approving pays the loan into its account, in the same transaction that
// marks it approved, so a loan is never approved without its money or paid
// twice. A loan that was already decided can't be decided again.
async function decideLoan(db, { loanId, deciderId, decision, note }) {
  await db.transaction(async (tx) => {
    const { rows } = await tx.query(
      "SELECT * FROM bank_loans WHERE id = $1 FOR UPDATE",
      [loanId],
    );
    const loan = rows[0];
    if (loan.status !== "pending") {
      throw new AlreadyDecidedError("already decided");
    }
    if (decision === "approve") {
      const credit = await tx.query(
        `UPDATE bank_money_accounts SET balance_cents = balance_cents + $2
          WHERE id = $1 RETURNING balance_cents`,
        [loan.account_id, loan.amount_cents],
      );
      await insertTransaction(tx, {
        accountId: loan.account_id,
        kind: "loan_disbursement",
        amountCents: cents(loan.amount_cents),
        balanceAfterCents: cents(credit.rows[0].balance_cents),
        description: `Loan ${loan.id.slice(0, 8)}, ${loan.term_months} months`,
        memo: loan.purpose,
      });
    }
    await tx.query(
      `UPDATE bank_loans
          SET status = $2, decided_by = $3, decision_note = $4, decided_at = now()
        WHERE id = $1`,
      [
        loanId,
        decision === "approve" ? "approved" : "rejected",
        deciderId,
        note,
      ],
    );
    await notify(tx, {
      userId: loan.user_id,
      kind: "loan_decided",
      title:
        decision === "approve"
          ? "Your loan was approved"
          : "Your loan was rejected",
      body: note || `${loan.term_months} months`,
      link: "/bank/loans",
      amountCents: cents(loan.amount_cents),
    });
  });
  return toLoan(await findLoan(db, loanId));
}

// Maya's approved loan, so the Loans page has something to show. Safe on
// every start: it only runs when she has no loans yet.
async function seedDemoLoan(db, { userId, accountId, deciderId }) {
  const existing = await db.query(
    "SELECT count(*) AS total FROM bank_loans WHERE user_id = $1",
    [userId],
  );
  if (Number(existing.rows[0].total) > 0) {
    return;
  }
  const loan = await requestLoan(db, {
    userId,
    account: { id: accountId },
    amountCents: 1_500_000,
    termMonths: 24,
    purpose: "Car",
  });
  await decideLoan(db, {
    loanId: loan.id,
    deciderId,
    decision: "approve",
    note: "Good payment history.",
  });
}

module.exports = {
  AlreadyDecidedError,
  MAX_LOAN_CENTS,
  MAX_PENDING,
  MIN_LOAN_CENTS,
  TERM_MONTHS,
  UNKNOWN_STANDING,
  rateFor,
  standingFor,
  TooManyPendingError,
  decideLoan,
  findLoan,
  listAllLoans,
  listLoans,
  quote,
  requestLoan,
  scheduleFor,
  seedDemoLoan,
  toLoan,
};
