const crypto = require("crypto");
const { cents, insertTransaction } = require("./money");
const { notify } = require("./notify");

// Cards: a virtual debit card per account, with freeze, a daily limit and
// simulated purchases. A purchase is one debit, checked and written in one
// database transaction like a bill payment, plus its history row. Declined
// attempts are recorded too, with the reason, and the customer is told.

class CardExistsError extends Error {}

// The default daily limit is a share of the account's balance when the card
// is made, in whole dollars: a customer with more in the account starts with
// more room, and nobody gets a number pulled from the air. They can change it.
const DEFAULT_LIMIT_SHARE = 0.1;

const REASONS = {
  frozen: "The card is frozen.",
  over_limit: "This would take today's spending past the card's daily limit.",
  insufficient_funds: "The account did not hold enough.",
};

// --- Numbers ------------------------------------------------------------------

// The check digit real card numbers carry (Luhn), so a typo in a number is
// caught before it is even looked up. Ours start with 9, which no real card
// range uses.
function luhnCheckDigit(digits) {
  let sum = 0;
  let double = true;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let d = Number(digits[i]);
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return String((10 - (sum % 10)) % 10);
}

function newCardNumber() {
  let body = "9";
  while (body.length < 15) body += crypto.randomInt(0, 10);
  return body + luhnCheckDigit(body);
}

function newCvv() {
  return String(crypto.randomInt(0, 1000)).padStart(3, "0");
}

// "MM/YY", three years from the real date of issue.
function expiryFrom(date) {
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const year = String((date.getUTCFullYear() + 3) % 100).padStart(2, "0");
  return `${month}/${year}`;
}

function formatNumber(number) {
  return number.replace(/(\d{4})(?=\d)/g, "$1 ");
}

function defaultLimit(balanceCents) {
  return Math.floor((balanceCents * DEFAULT_LIMIT_SHARE) / 100) * 100;
}

// --- Reading ------------------------------------------------------------------

// $1 is always the customer's today (null means "count nothing"); spent_today
// counts approved charges on that day. Every query below references $1, so
// Postgres can type it; a parameter that is passed but never used fails with
// "could not determine data type".
const SELECT = `
  SELECT c.id, c.user_id, c.account_id, c.number, c.expires, c.status, c.frozen_by,
         c.limit_cents, c.created_at,
         a.name AS account_name, a.number AS account_number,
         (SELECT COALESCE(SUM(ch.amount_cents), 0) FROM bank_card_charges ch
           WHERE ch.card_id = c.id AND ch.status = 'approved'
             AND ch.charged_on = $1::date) AS spent_today
    FROM bank_cards c
    JOIN bank_money_accounts a ON a.id = c.account_id`;

function toCard(row) {
  return {
    id: row.id,
    userId: row.user_id,
    accountId: row.account_id,
    accountName: row.account_name,
    accountNumber: row.account_number,
    last4: row.number.slice(-4),
    expires: row.expires,
    status: row.status,
    frozenBy: row.frozen_by || null,
    limitCents: cents(row.limit_cents),
    spentTodayCents: cents(row.spent_today),
    createdAt: new Date(row.created_at).toISOString(),
  };
}

async function listCards(db, userId, today) {
  const { rows } = await db.query(
    `${SELECT} WHERE c.user_id = $2 ORDER BY c.created_at`,
    [today, userId],
  );
  return rows.map(toCard);
}

async function findOwnCard(db, userId, id, today) {
  const { rows } = await db.query(
    `${SELECT} WHERE c.user_id = $2 AND c.id = $3`,
    [today, userId, id],
  );
  return rows[0] ? toCard(rows[0]) : null;
}

// Any customer's card, for the bank's staff.
async function findCard(db, id, today) {
  const { rows } = await db.query(`${SELECT} WHERE c.id = $2`, [today, id]);
  return rows[0] ? toCard(rows[0]) : null;
}

// The full number and the CVV, shown on request and never in a list.
async function cardDetails(db, id) {
  const { rows } = await db.query(
    "SELECT number, expires, cvv FROM bank_cards WHERE id = $1",
    [id],
  );
  if (!rows[0]) return null;
  return {
    number: formatNumber(rows[0].number),
    expires: rows[0].expires,
    cvv: rows[0].cvv,
  };
}

// --- Changing -------------------------------------------------------------------

async function createCard(db, { userId, account }) {
  const id = crypto.randomUUID();
  try {
    await db.query(
      `INSERT INTO bank_cards (id, user_id, account_id, number, expires, cvv, limit_cents)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        id,
        userId,
        account.id,
        newCardNumber(),
        expiryFrom(new Date()),
        newCvv(),
        defaultLimit(cents(account.balance_cents ?? account.balanceCents)),
      ],
    );
  } catch (error) {
    if (error.code === "23505") {
      throw new CardExistsError("this account already has a card");
    }
    throw error;
  }
  return { id };
}

// status and limitCents are optional; frozenBy records who froze it.
async function updateCard(db, id, { status, frozenBy, limitCents }, today) {
  await db.query(
    `UPDATE bank_cards
        SET status = COALESCE($2, status),
            frozen_by = CASE WHEN $2 IS NULL THEN frozen_by ELSE $3 END,
            limit_cents = COALESCE($4, limit_cents)
      WHERE id = $1`,
    [id, status ?? null, frozenBy ?? null, limitCents ?? null],
  );
  return findCard(db, id, today);
}

// A purchase. Checked and written in one transaction, in this order: frozen,
// then the daily limit, then the balance. A declined attempt is recorded and
// the customer is told why; an approved one debits the account and lands in
// its history as a card purchase.
//
// INTENTIONAL DEFECT (bankCardLimitPerCharge, REPORT): with the flag armed the
// limit is compared with this one charge instead of the day's total, so many
// small purchases walk past the daily limit.
async function charge(
  db,
  { userId, card, merchant, amountCents, today, perChargeBug = false },
) {
  const result = await db.transaction(async (tx) => {
    const fresh = (
      await tx.query(
        "SELECT status, limit_cents, account_id FROM bank_cards WHERE id = $1",
        [card.id],
      )
    ).rows[0];
    let reason = null;
    if (fresh.status === "frozen") {
      reason = "frozen";
    } else {
      const spent = cents(
        (
          await tx.query(
            `SELECT COALESCE(SUM(amount_cents), 0) AS total FROM bank_card_charges
              WHERE card_id = $1 AND status = 'approved' AND charged_on = $2::date`,
            [card.id, today],
          )
        ).rows[0].total,
      );
      const counted = perChargeBug ? amountCents : spent + amountCents;
      if (counted > cents(fresh.limit_cents)) {
        reason = "over_limit";
      }
    }

    let balanceAfter = null;
    if (!reason) {
      const debit = await tx.query(
        `UPDATE bank_money_accounts SET balance_cents = balance_cents - $2
          WHERE id = $1 AND balance_cents >= $2 RETURNING balance_cents`,
        [fresh.account_id, amountCents],
      );
      if (debit.rows.length === 0) {
        reason = "insufficient_funds";
      } else {
        balanceAfter = cents(debit.rows[0].balance_cents);
      }
    }

    const status = reason ? "declined" : "approved";
    const id = crypto.randomUUID();
    await tx.query(
      `INSERT INTO bank_card_charges (id, card_id, merchant, amount_cents, status, reason, charged_on)
       VALUES ($1, $2, $3, $4, $5, $6, $7::date)`,
      [id, card.id, merchant, amountCents, status, reason, today],
    );
    if (status === "approved") {
      await insertTransaction(tx, {
        accountId: fresh.account_id,
        kind: "card_purchase",
        amountCents: -amountCents,
        balanceAfterCents: balanceAfter,
        description: `Card purchase at ${merchant}`,
        memo: `Card ending ${card.last4}`,
        counterparty: merchant,
      });
    } else {
      await notify(tx, {
        userId,
        kind: "card_declined",
        title: `Card ending ${card.last4} declined at ${merchant}`,
        body: REASONS[reason],
        link: "/bank/cards",
        amountCents: -amountCents,
      });
    }
    return id;
  });
  return {
    charge: await findCharge(db, result),
    card: await findOwnCard(db, userId, card.id, today),
  };
}

function toCharge(row) {
  return {
    id: row.id,
    cardId: row.card_id,
    merchant: row.merchant,
    amountCents: cents(row.amount_cents),
    status: row.status,
    reason: row.reason || null,
    reasonText: row.reason ? REASONS[row.reason] : null,
    chargedOn: row.charged_on,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

async function findCharge(db, id) {
  const { rows } = await db.query(
    `SELECT id, card_id, merchant, amount_cents, status, reason, charged_on::text AS charged_on, created_at
       FROM bank_card_charges WHERE id = $1`,
    [id],
  );
  return rows[0] ? toCharge(rows[0]) : null;
}

// A card's charges newest first, a page after a cursor (GraphQL Card.charges),
// on the same keyset terms as transactionsAfter in bank/money.js.
async function chargesAfter(db, cardId, { first, after = null }) {
  const count = await db.query(
    "SELECT count(*) AS total FROM bank_card_charges WHERE card_id = $1",
    [cardId],
  );
  const params = [cardId];
  let clause = "card_id = $1";
  if (after) {
    params.push(after.at, after.id);
    clause += " AND (created_at, id) < ($2::timestamptz, $3::uuid)";
  }
  params.push(first + 1);
  const { rows } = await db.query(
    `SELECT id, card_id, merchant, amount_cents, status, reason,
            charged_on::text AS charged_on, created_at, created_at::text AS cursor_at
       FROM bank_card_charges
      WHERE ${clause}
      ORDER BY created_at DESC, id DESC
      LIMIT $${params.length}`,
    params,
  );
  const page = rows.slice(0, first);
  const last = page[page.length - 1];
  return {
    charges: page.map(toCharge),
    total: Number(count.rows[0].total),
    hasNextPage: rows.length > first,
    last: last ? { at: last.cursor_at, id: last.id } : null,
  };
}

async function listCharges(db, cardId, limit = 30) {
  const { rows } = await db.query(
    `SELECT id, card_id, merchant, amount_cents, status, reason, charged_on::text AS charged_on, created_at
       FROM bank_card_charges WHERE card_id = $1
      ORDER BY created_at DESC LIMIT $2`,
    [cardId, limit],
  );
  return rows.map(toCharge);
}

module.exports = {
  CardExistsError,
  DEFAULT_LIMIT_SHARE,
  REASONS,
  cardDetails,
  charge,
  chargesAfter,
  createCard,
  defaultLimit,
  findCard,
  findOwnCard,
  listCards,
  listCharges,
  luhnCheckDigit,
  updateCard,
};
