const crypto = require("crypto");
const {
  InsufficientFundsError,
  UUID,
  cents,
  insertTransaction,
  toMoneyAccount,
} = require("./money");

// Bill pay: the payees a customer saves, and payments to them. A payment
// leaves the bank, so it is one debit, checked and written in one step like a
// transfer, plus its history row, in one database transaction.

const MAX_PAYEES = 20;

class TooManyPayeesError extends Error {}

function toPayee(row) {
  return {
    id: row.id,
    name: row.name,
    reference: row.reference,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

function toBillPayment(row) {
  return {
    id: row.id,
    accountId: row.account_id,
    payeeId: row.payee_id,
    payeeName: row.payee_name,
    payeeReference: row.payee_reference,
    amountCents: cents(row.amount_cents),
    memo: row.memo,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

async function listPayees(db, userId) {
  const { rows } = await db.query(
    `SELECT * FROM bank_payees
      WHERE user_id = $1 AND deleted_at IS NULL
      ORDER BY name, created_at, id`,
    [userId],
  );
  return rows.map(toPayee);
}

async function addPayee(db, userId, { name, reference }) {
  const id = crypto.randomUUID();
  await db.transaction(async (tx) => {
    const { rows } = await tx.query(
      `SELECT count(*) AS total FROM bank_payees
        WHERE user_id = $1 AND deleted_at IS NULL`,
      [userId],
    );
    if (Number(rows[0].total) >= MAX_PAYEES) {
      throw new TooManyPayeesError("too many payees");
    }
    await tx.query(
      `INSERT INTO bank_payees (id, user_id, name, reference)
       VALUES ($1, $2, $3, $4)`,
      [id, userId, name, reference],
    );
  });
  const { rows } = await db.query("SELECT * FROM bank_payees WHERE id = $1", [
    id,
  ]);
  return toPayee(rows[0]);
}

// Someone else's payee answers the same as one that doesn't exist.
async function findOwnPayee(db, userId, payeeId) {
  if (!UUID.test(String(payeeId))) {
    return null;
  }
  const { rows } = await db.query(
    `SELECT * FROM bank_payees
      WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
    [payeeId, userId],
  );
  return rows[0] || null;
}

// Marks the payee deleted; null when there was nothing to delete.
async function deletePayee(db, userId, payeeId, { anyOwner = false } = {}) {
  if (!UUID.test(String(payeeId))) {
    return null;
  }
  // INTENTIONAL DEFECT (bankPayeeIdor, REPORT): with anyOwner the query
  // forgets "AND user_id = $2", so any signed-in customer can delete anyone's
  // payee by its id (an insecure direct object reference).
  const { rows } = anyOwner
    ? await db.query(
        `UPDATE bank_payees SET deleted_at = now()
          WHERE id = $1 AND deleted_at IS NULL RETURNING *`,
        [payeeId],
      )
    : await db.query(
        `UPDATE bank_payees SET deleted_at = now()
          WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL RETURNING *`,
        [payeeId, userId],
      );
  return rows[0] ? toPayee(rows[0]) : null;
}

const PAYMENT_SELECT = `
  SELECT b.*, p.name AS payee_name, p.reference AS payee_reference
    FROM bank_bill_payments b
    JOIN bank_payees p ON p.id = b.payee_id`;

async function findPayment(db, id) {
  const { rows } = await db.query(`${PAYMENT_SELECT} WHERE b.id = $1`, [id]);
  return rows[0] ? toBillPayment(rows[0]) : null;
}

async function findPaymentByKey(db, userId, key) {
  const { rows } = await db.query(
    `${PAYMENT_SELECT} WHERE b.user_id = $1 AND b.idempotency_key = $2`,
    [userId, key],
  );
  return rows[0] ? toBillPayment(rows[0]) : null;
}

async function payBill(db, { userId, from, payee, amountCents, memo, key }) {
  if (key) {
    const existing = await findPaymentByKey(db, userId, key);
    if (existing) {
      return { payment: existing, replayed: true };
    }
  }
  let paymentId;
  try {
    paymentId = await db.transaction(async (tx) => {
      const debit = await tx.query(
        `UPDATE bank_money_accounts SET balance_cents = balance_cents - $2
          WHERE id = $1 AND balance_cents >= $2 RETURNING balance_cents`,
        [from.id, amountCents],
      );
      if (debit.rows.length === 0) {
        throw new InsufficientFundsError("insufficient funds");
      }
      const id = crypto.randomUUID();
      await tx.query(
        `INSERT INTO bank_bill_payments
           (id, user_id, account_id, payee_id, amount_cents, memo, idempotency_key)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [id, userId, from.id, payee.id, amountCents, memo, key || null],
      );
      await insertTransaction(tx, {
        accountId: from.id,
        kind: "bill_payment",
        amountCents: -amountCents,
        balanceAfterCents: cents(debit.rows[0].balance_cents),
        description: `Bill payment to ${payee.name}`,
        memo,
        counterparty: payee.reference,
      });
      return id;
    });
  } catch (error) {
    if (error.code === "23505" && key) {
      const existing = await findPaymentByKey(db, userId, key);
      if (existing) {
        return { payment: existing, replayed: true };
      }
    }
    throw error;
  }
  return { payment: await findPayment(db, paymentId), replayed: false };
}

async function listBillPayments(db, userId, limit = 20) {
  const { rows } = await db.query(
    `${PAYMENT_SELECT} WHERE b.user_id = $1
      ORDER BY b.created_at DESC LIMIT $2`,
    [userId, limit],
  );
  return rows.map(toBillPayment);
}

// Maya's payees, so the page has something to show without signing up.
const DEMO_PAYEES = [
  { name: "City Power", reference: "ACC-100234" },
  { name: "Telco Mobile", reference: "415-555-0134" },
  { name: "Bay Homes Rent", reference: "UNIT-12B" },
];

async function seedDemoPayees(db, userId) {
  const existing = await db.query(
    "SELECT count(*) AS total FROM bank_payees WHERE user_id = $1",
    [userId],
  );
  if (Number(existing.rows[0].total) > 0) {
    return;
  }
  for (const payee of DEMO_PAYEES) {
    await addPayee(db, userId, payee);
  }
}

module.exports = {
  MAX_PAYEES,
  TooManyPayeesError,
  addPayee,
  deletePayee,
  findOwnPayee,
  listBillPayments,
  listPayees,
  payBill,
  seedDemoPayees,
  toMoneyAccount,
};
