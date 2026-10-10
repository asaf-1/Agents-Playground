const crypto = require("crypto");

// Data access for money: accounts, transfers and their transactions. Amounts
// are whole cents. A balance only changes in a statement that checks and
// writes in one step, inside the same database transaction as the rows that
// explain the change, so money is never created or lost on the way.

const STARTER_ACCOUNTS = [
  { kind: "checking", name: "Checking", openingCents: 2_500_000 },
  { kind: "savings", name: "Savings", openingCents: 7_500_000 },
];
const MAX_ACCOUNTS = 10;
// How long the planted race bug waits between reading a balance and writing
// it, so two transfers sent together reliably both pass the check.
const RACE_WINDOW_MS = 250;

class InsufficientFundsError extends Error {}
class TooManyAccountsError extends Error {}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function iso(value) {
  return new Date(value).toISOString();
}

// pg returns bigint columns as strings and PGlite as numbers; amounts here
// stay far below Number.MAX_SAFE_INTEGER, so both become plain numbers.
function cents(value) {
  return Number(value);
}

function toMoneyAccount(row) {
  return {
    id: row.id,
    number: row.number,
    kind: row.kind,
    name: row.name,
    balanceCents: cents(row.balance_cents),
    createdAt: iso(row.created_at),
  };
}

function toTransaction(row) {
  return {
    id: row.id,
    accountId: row.account_id,
    kind: row.kind,
    amountCents: cents(row.amount_cents),
    balanceAfterCents: cents(row.balance_after_cents),
    description: row.description,
    memo: row.memo,
    counterparty: row.counterparty,
    transferId: row.transfer_id || null,
    createdAt: iso(row.created_at),
  };
}

function toTransfer(row) {
  return {
    id: row.id,
    fromAccountId: row.from_account_id,
    toAccountNumber: row.to_number,
    amountCents: cents(row.amount_cents),
    memo: row.memo,
    createdAt: iso(row.created_at),
  };
}

// Numbers look like PB-4821-0937. Random ones start at 2000, so they never
// clash with the demo accounts' fixed PB-1000-000x.
async function freeAccountNumber(tx) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const number = `PB-${2000 + crypto.randomInt(8000)}-${String(
      crypto.randomInt(10000),
    ).padStart(4, "0")}`;
    const { rows } = await tx.query(
      "SELECT 1 FROM bank_money_accounts WHERE number = $1",
      [number],
    );
    if (rows.length === 0) {
      return number;
    }
  }
  throw new Error("could not find a free account number");
}

async function insertTransaction(tx, entry) {
  await tx.query(
    `INSERT INTO bank_transactions
       (id, account_id, kind, amount_cents, balance_after_cents, description,
        memo, counterparty, transfer_id, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, COALESCE($10, now()))`,
    [
      crypto.randomUUID(),
      entry.accountId,
      entry.kind,
      entry.amountCents,
      entry.balanceAfterCents,
      entry.description,
      entry.memo || "",
      entry.counterparty || "",
      entry.transferId || null,
      entry.createdAt || null,
    ],
  );
}

async function insertAccount(tx, account) {
  const id = crypto.randomUUID();
  const number = account.number || (await freeAccountNumber(tx));
  await tx.query(
    `INSERT INTO bank_money_accounts
       (id, user_id, number, kind, name, balance_cents, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, now()))`,
    [
      id,
      account.userId,
      number,
      account.kind,
      account.name,
      account.openingCents,
      account.createdAt || null,
    ],
  );
  if (account.openingCents > 0) {
    await insertTransaction(tx, {
      accountId: id,
      kind: "opening",
      amountCents: account.openingCents,
      balanceAfterCents: account.openingCents,
      description: "Opening deposit",
      createdAt: account.createdAt,
    });
  }
  return id;
}

async function findAccountById(db, id) {
  const { rows } = await db.query(
    "SELECT * FROM bank_money_accounts WHERE id = $1",
    [id],
  );
  return rows[0] || null;
}

// Someone else's account answers the same as one that doesn't exist, so ids
// can't be probed.
async function findOwnAccount(db, userId, accountId) {
  if (!UUID.test(String(accountId))) {
    return null;
  }
  const row = await findAccountById(db, accountId);
  return row && row.user_id === userId ? row : null;
}

async function findAccountByNumber(db, number) {
  const { rows } = await db.query(
    `SELECT a.*, u.is_demo
       FROM bank_money_accounts a
       JOIN bank_users u ON u.id = a.user_id
      WHERE a.number = $1`,
    [number],
  );
  return rows[0] || null;
}

async function listAccounts(db, userId) {
  const { rows } = await db.query(
    `SELECT * FROM bank_money_accounts
      WHERE user_id = $1
      ORDER BY created_at, kind, number`,
    [userId],
  );
  return rows.map(toMoneyAccount);
}

async function openAccount(db, userId, { kind, name, openingCents }) {
  const id = await db.transaction(async (tx) => {
    const { rows } = await tx.query(
      "SELECT count(*) AS total FROM bank_money_accounts WHERE user_id = $1",
      [userId],
    );
    if (Number(rows[0].total) >= MAX_ACCOUNTS) {
      throw new TooManyAccountsError("too many accounts");
    }
    return insertAccount(tx, { userId, kind, name, openingCents });
  });
  return toMoneyAccount(await findAccountById(db, id));
}

// Every new customer starts with $100,000 of fake money.
async function openStarterAccounts(db, userId) {
  await db.transaction(async (tx) => {
    for (const account of STARTER_ACCOUNTS) {
      await insertAccount(tx, { userId, ...account });
    }
  });
}

// People who signed up before money existed get the same start. Safe on every
// start: anyone who already has an account is skipped. Demo users get theirs
// from seedDemoMoney instead.
async function ensureStarterAccounts(db) {
  const { rows } = await db.query(
    `SELECT u.id FROM bank_users u
      WHERE NOT u.is_demo
        AND NOT EXISTS (SELECT 1 FROM bank_money_accounts a WHERE a.user_id = u.id)`,
  );
  for (const row of rows) {
    await openStarterAccounts(db, row.id);
  }
  return rows.length;
}

async function deposit(db, accountId, amountCents) {
  return db.transaction(async (tx) => {
    const { rows } = await tx.query(
      `UPDATE bank_money_accounts SET balance_cents = balance_cents + $2
        WHERE id = $1 RETURNING *`,
      [accountId, amountCents],
    );
    await insertTransaction(tx, {
      accountId,
      kind: "deposit",
      amountCents,
      balanceAfterCents: cents(rows[0].balance_cents),
      description: "Added funds",
    });
    return toMoneyAccount(rows[0]);
  });
}

const TRANSFER_SELECT = `
  SELECT t.*, a.number AS to_number
    FROM bank_transfers t
    JOIN bank_money_accounts a ON a.id = t.to_account_id`;

async function findTransfer(db, id) {
  const { rows } = await db.query(`${TRANSFER_SELECT} WHERE t.id = $1`, [id]);
  return rows[0] ? toTransfer(rows[0]) : null;
}

async function findTransferByKey(db, userId, key) {
  const { rows } = await db.query(
    `${TRANSFER_SELECT} WHERE t.user_id = $1 AND t.idempotency_key = $2`,
    [userId, key],
  );
  return rows[0] ? toTransfer(rows[0]) : null;
}

// Moves money between two accounts. The debit is one statement that checks
// the balance and subtracts in the same step ("only if there is enough"), so
// two transfers at the same moment can't both spend the same money. A
// repeated idempotency key returns the first transfer instead of a second one.
async function transfer(
  db,
  { userId, from, to, amountCents, memo, key, race },
) {
  if (key) {
    const existing = await findTransferByKey(db, userId, key);
    if (existing) {
      return { transfer: existing, replayed: true };
    }
  }

  if (race) {
    // INTENTIONAL DEFECT (bankTransferRace, REPORT): check-then-act. The
    // balance is read, the request waits, and only then is the money taken,
    // without the "only if there is enough" condition. Two transfers sent
    // together both read the old balance, both pass, and the account ends up
    // below zero.
    const { rows } = await db.query(
      "SELECT balance_cents FROM bank_money_accounts WHERE id = $1",
      [from.id],
    );
    if (cents(rows[0].balance_cents) < amountCents) {
      throw new InsufficientFundsError("insufficient funds");
    }
    await new Promise((resolve) => setTimeout(resolve, RACE_WINDOW_MS));
  }

  let transferId;
  try {
    transferId = await db.transaction(async (tx) => {
      const debit = await tx.query(
        race
          ? `UPDATE bank_money_accounts SET balance_cents = balance_cents - $2
              WHERE id = $1 RETURNING balance_cents`
          : `UPDATE bank_money_accounts SET balance_cents = balance_cents - $2
              WHERE id = $1 AND balance_cents >= $2 RETURNING balance_cents`,
        [from.id, amountCents],
      );
      if (debit.rows.length === 0) {
        throw new InsufficientFundsError("insufficient funds");
      }
      const credit = await tx.query(
        `UPDATE bank_money_accounts SET balance_cents = balance_cents + $2
          WHERE id = $1 RETURNING balance_cents`,
        [to.id, amountCents],
      );
      const id = crypto.randomUUID();
      await tx.query(
        `INSERT INTO bank_transfers
           (id, user_id, from_account_id, to_account_id, amount_cents, memo,
            idempotency_key)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [id, userId, from.id, to.id, amountCents, memo, key || null],
      );
      await insertTransaction(tx, {
        accountId: from.id,
        kind: "transfer_out",
        amountCents: -amountCents,
        balanceAfterCents: cents(debit.rows[0].balance_cents),
        description: `Transfer to ${to.number}`,
        memo,
        counterparty: to.number,
        transferId: id,
      });
      await insertTransaction(tx, {
        accountId: to.id,
        kind: "transfer_in",
        amountCents,
        balanceAfterCents: cents(credit.rows[0].balance_cents),
        description: `Transfer from ${from.number}`,
        memo,
        counterparty: from.number,
        transferId: id,
      });
      return id;
    });
  } catch (error) {
    // The same key arrived twice at once: the second insert hit the unique
    // key, its whole transaction rolled back, and the first transfer stands.
    if (error.code === "23505" && key) {
      const existing = await findTransferByKey(db, userId, key);
      if (existing) {
        return { transfer: existing, replayed: true };
      }
    }
    throw error;
  }
  return { transfer: await findTransfer(db, transferId), replayed: false };
}

// Filters: fromIso/toIso are the start (inclusive) and end (exclusive) of the
// period; type is in, out, deposit or transfer; min/max compare the amount
// without its sign.
function transactionFilter(accountId, filters) {
  const where = ["account_id = $1"];
  const values = [accountId];
  const add = (sql, value) => {
    values.push(value);
    where.push(sql.replace("?", `$${values.length}`));
  };
  if (filters.fromIso) add("created_at >= ?", filters.fromIso);
  if (filters.toIso) add("created_at < ?", filters.toIso);
  if (filters.type === "in") where.push("amount_cents > 0");
  if (filters.type === "out") where.push("amount_cents < 0");
  if (filters.type === "deposit") where.push("kind IN ('opening', 'deposit')");
  if (filters.type === "transfer") {
    where.push("kind IN ('transfer_in', 'transfer_out')");
  }
  if (filters.minCents !== undefined)
    add("abs(amount_cents) >= ?", filters.minCents);
  if (filters.maxCents !== undefined)
    add("abs(amount_cents) <= ?", filters.maxCents);
  return { where: where.join(" AND "), values };
}

async function listTransactions(db, accountId, filters) {
  const { where, values } = transactionFilter(accountId, filters);
  const count = await db.query(
    `SELECT count(*) AS total FROM bank_transactions WHERE ${where}`,
    values,
  );
  const total = Number(count.rows[0].total);
  const offset = (filters.page - 1) * filters.pageSize;
  const { rows } = await db.query(
    `SELECT * FROM bank_transactions WHERE ${where}
      ORDER BY created_at DESC, seq DESC
      LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, filters.pageSize, offset],
  );
  return {
    transactions: rows.map(toTransaction),
    page: filters.page,
    pageSize: filters.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / filters.pageSize)),
  };
}

// Oldest first, as a statement reads.
async function statementTransactions(db, accountId, filters) {
  const { where, values } = transactionFilter(accountId, filters);
  const { rows } = await db.query(
    `SELECT * FROM bank_transactions WHERE ${where}
      ORDER BY created_at, seq LIMIT 5000`,
    values,
  );
  return rows.map(toTransaction);
}

async function recentActivity(db, userId, limit) {
  const { rows } = await db.query(
    `SELECT t.* FROM bank_transactions t
       JOIN bank_money_accounts a ON a.id = t.account_id
      WHERE a.user_id = $1
      ORDER BY t.created_at DESC, t.seq DESC
      LIMIT $2`,
    [userId, limit],
  );
  return rows.map(toTransaction);
}

// --- Demo money -------------------------------------------------------------

const DEMO_MONEY = {
  "maya@playgroundbank.test": [
    { kind: "checking", name: "Checking", number: "PB-1000-0001" },
    { kind: "savings", name: "Savings", number: "PB-1000-0002" },
  ],
  "lee@playgroundbank.test": [
    { kind: "checking", name: "Checking", number: "PB-1000-0003" },
    { kind: "savings", name: "Savings", number: "PB-1000-0004" },
  ],
};

// Maya's ready-made history: two months of added funds and moves to savings,
// so there is something to browse, filter and download without signing up.
const MAYA_HISTORY = [
  { day: 56, type: "deposit", cents: 420_000 },
  { day: 55, type: "save", cents: 80_000, memo: "Monthly savings" },
  { day: 49, type: "deposit", cents: 15_250 },
  { day: 42, type: "deposit", cents: 420_000 },
  { day: 41, type: "save", cents: 80_000, memo: "Monthly savings" },
  { day: 38, type: "spend", cents: 120_000, memo: "Holiday fund" },
  { day: 33, type: "deposit", cents: 9_999 },
  { day: 28, type: "deposit", cents: 420_000 },
  { day: 27, type: "save", cents: 80_000, memo: "Monthly savings" },
  { day: 21, type: "save", cents: 25_000, memo: "Emergency fund" },
  { day: 17, type: "deposit", cents: 3_150 },
  { day: 14, type: "deposit", cents: 420_000 },
  { day: 13, type: "save", cents: 80_000, memo: "Monthly savings" },
  { day: 9, type: "spend", cents: 60_000, memo: "New laptop" },
  { day: 6, type: "deposit", cents: 12_500 },
  { day: 2, type: "save", cents: 50_000, memo: "Bonus to savings" },
];

function daysAgo(day, hour) {
  const date = new Date(Date.now() - day * 86_400_000);
  date.setUTCHours(hour, 15, 0, 0);
  return date.toISOString();
}

async function seedHistory(tx, userId, checking, savings) {
  const balance = { checking: 2_500_000, savings: 7_500_000 };
  const accounts = { checking, savings };
  for (const event of MAYA_HISTORY) {
    const createdAt = daysAgo(event.day, 9 + (event.day % 8));
    if (event.type === "deposit") {
      balance.checking += event.cents;
      await insertTransaction(tx, {
        accountId: checking.id,
        kind: "deposit",
        amountCents: event.cents,
        balanceAfterCents: balance.checking,
        description: "Added funds",
        createdAt,
      });
      continue;
    }
    // "save" moves checking to savings; "spend" brings savings back.
    const [from, to] =
      event.type === "save" ? ["checking", "savings"] : ["savings", "checking"];
    balance[from] -= event.cents;
    balance[to] += event.cents;
    const transferId = crypto.randomUUID();
    await tx.query(
      `INSERT INTO bank_transfers
         (id, user_id, from_account_id, to_account_id, amount_cents, memo, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        transferId,
        userId,
        accounts[from].id,
        accounts[to].id,
        event.cents,
        event.memo,
        createdAt,
      ],
    );
    await insertTransaction(tx, {
      accountId: accounts[from].id,
      kind: "transfer_out",
      amountCents: -event.cents,
      balanceAfterCents: balance[from],
      description: `Transfer to ${accounts[to].number}`,
      memo: event.memo,
      counterparty: accounts[to].number,
      transferId,
      createdAt,
    });
    await insertTransaction(tx, {
      accountId: accounts[to].id,
      kind: "transfer_in",
      amountCents: event.cents,
      balanceAfterCents: balance[to],
      description: `Transfer from ${accounts[from].number}`,
      memo: event.memo,
      counterparty: accounts[from].number,
      transferId,
      createdAt,
    });
  }
  for (const [kind, account] of Object.entries(accounts)) {
    await tx.query(
      "UPDATE bank_money_accounts SET balance_cents = $2 WHERE id = $1",
      [account.id, balance[kind]],
    );
  }
}

// Safe on every start: a demo user who already has accounts is left alone.
async function seedDemoMoney(db) {
  for (const [email, plan] of Object.entries(DEMO_MONEY)) {
    const { rows } = await db.query(
      `SELECT u.id,
              (SELECT count(*) FROM bank_money_accounts a WHERE a.user_id = u.id) AS accounts
         FROM bank_users u WHERE u.email = $1`,
      [email],
    );
    if (!rows[0] || Number(rows[0].accounts) > 0) {
      continue;
    }
    const userId = rows[0].id;
    await db.transaction(async (tx) => {
      const opened = daysAgo(60, 8);
      const ids = [];
      for (let index = 0; index < plan.length; index += 1) {
        ids.push(
          await insertAccount(tx, {
            userId,
            ...plan[index],
            openingCents: STARTER_ACCOUNTS[index].openingCents,
            createdAt: opened,
          }),
        );
      }
      if (email.startsWith("maya@")) {
        await seedHistory(
          tx,
          userId,
          { id: ids[0], number: plan[0].number },
          { id: ids[1], number: plan[1].number },
        );
      }
    });
  }
}

module.exports = {
  InsufficientFundsError,
  MAX_ACCOUNTS,
  TooManyAccountsError,
  deposit,
  ensureStarterAccounts,
  findAccountByNumber,
  findOwnAccount,
  listAccounts,
  listTransactions,
  openAccount,
  openStarterAccounts,
  recentActivity,
  seedDemoMoney,
  statementTransactions,
  toMoneyAccount,
  transfer,
};
