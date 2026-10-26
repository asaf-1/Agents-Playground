// Which indexes the bank's busiest queries use: `npm run db:audit`.
//
// Builds a throwaway database from bank/migrations/ (PGlite, in memory), fills
// it with enough rows that the planner has to choose (a customer with 50,000
// history rows, a bell with 20,000 notifications, a card with 20,000 charges),
// then prints EXPLAIN ANALYZE for each query below, and every foreign key with
// no index whose first column is the key's column.
//
// It changes nothing anywhere: the database exists only while it runs. The
// before-and-after plans of the 2026-10-26 audit are in the private runbook.

const { runMigrations } = require("../../bank/migrate");

const QUERIES = [
  {
    name: "History, one page (REST and GraphQL page=)",
    sql: `SELECT * FROM bank_transactions
           WHERE account_id = $1 AND created_at >= now() - interval '90 days'
           ORDER BY created_at DESC, seq DESC LIMIT 20 OFFSET 40`,
    params: (ids) => [ids.account],
  },
  {
    name: "History, the next page after a cursor (GraphQL history)",
    sql: `SELECT * FROM bank_transactions
           WHERE account_id = $1 AND (created_at, seq) < (now() - interval '3 days', 1000000)
           ORDER BY created_at DESC, seq DESC LIMIT 21`,
    params: (ids) => [ids.account],
  },
  {
    name: "The bell: how many unread (every page load)",
    sql: `SELECT count(*) FROM bank_notifications
           WHERE user_id = $1 AND read_at IS NULL`,
    params: (ids) => [ids.user],
  },
  {
    name: "Notifications, newest 30",
    sql: `SELECT * FROM bank_notifications WHERE user_id = $1
           ORDER BY created_at DESC LIMIT 30`,
    params: (ids) => [ids.user],
  },
  {
    name: "Open orders, checked on every request (the sweep)",
    sql: `SELECT * FROM bank_orders WHERE user_id = $1 AND status = 'open'
           ORDER BY created_at`,
    params: (ids) => [ids.user],
  },
  {
    name: "A card's spend today (every purchase)",
    sql: `SELECT coalesce(sum(amount_cents), 0) FROM bank_card_charges
           WHERE card_id = $1 AND charged_on = current_date AND status = 'approved'`,
    params: (ids) => [ids.card],
  },
  {
    name: "A card's charges, the next page after a cursor (GraphQL)",
    sql: `SELECT * FROM bank_card_charges
           WHERE card_id = $1 AND (created_at, id) < (now() - interval '1 day', 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)
           ORDER BY created_at DESC, id DESC LIMIT 21`,
    params: (ids) => [ids.card],
  },
  {
    name: "Every order of a customer, newest first, a page (GraphQL orders)",
    sql: `SELECT * FROM bank_orders WHERE user_id = $1
           ORDER BY created_at DESC, id DESC LIMIT 21`,
    params: (ids) => [ids.user],
  },
];

async function seed(db) {
  await db.exec(`
    INSERT INTO bank_users (id, email, full_name, password_hash)
    SELECT gen_random_uuid(), 'audit-' || g || '@example.test', 'Audit ' || g, 'x'
      FROM generate_series(1, 200) g;
  `);

  const user = (
    await db.query(
      "SELECT id FROM bank_users WHERE email = 'audit-1@example.test'",
    )
  ).rows[0].id;

  await db.exec(`
    INSERT INTO bank_money_accounts (id, user_id, number, kind, name, balance_cents)
    SELECT gen_random_uuid(), u.id, 'PB-' || lpad((9000 + row_number() OVER ())::text, 4, '0') || '-0001', 'checking', 'Checking', 100000
      FROM bank_users u WHERE u.email LIKE 'audit-%';
  `);

  const account = (
    await db.query("SELECT id FROM bank_money_accounts WHERE user_id = $1", [
      user,
    ])
  ).rows[0].id;

  // 50,000 rows for the customer under audit, 100 for every other account.
  await db.query(
    `INSERT INTO bank_transactions (id, account_id, kind, amount_cents, balance_after_cents, description, created_at)
     SELECT gen_random_uuid(), $1, 'deposit', 100, 100, 'Audit', now() - (g || ' minutes')::interval
       FROM generate_series(1, 50000) g`,
    [account],
  );
  await db.exec(`
    INSERT INTO bank_transactions (id, account_id, kind, amount_cents, balance_after_cents, description, created_at)
    SELECT gen_random_uuid(), a.id, 'deposit', 100, 100, 'Audit', now() - (g || ' hours')::interval
      FROM bank_money_accounts a CROSS JOIN generate_series(1, 100) g;
  `);

  // 20,000 notifications, one in fifty unread, plus everybody else's.
  await db.query(
    `INSERT INTO bank_notifications (id, user_id, kind, title, body, link, read_at, created_at)
     SELECT gen_random_uuid(), $1, 'welcome', 'Audit', 'Audit', '/app', CASE WHEN g % 50 = 0 THEN NULL ELSE now() END, now() - (g || ' minutes')::interval
       FROM generate_series(1, 20000) g`,
    [user],
  );
  await db.exec(`
    INSERT INTO bank_notifications (id, user_id, kind, title, body, link, read_at, created_at)
    SELECT gen_random_uuid(), u.id, 'welcome', 'Audit', 'Audit', '/app', now(), now() - (g || ' hours')::interval
      FROM bank_users u CROSS JOIN generate_series(1, 50) g;
  `);

  const card = (
    await db.query(
      `INSERT INTO bank_cards (id, user_id, account_id, number, expires, cvv, limit_cents)
       VALUES (gen_random_uuid(), $1, $2, '9000000000000001', '10/29', '123', 100000)
       RETURNING id`,
      [user, account],
    )
  ).rows[0].id;

  await db.query(
    `INSERT INTO bank_card_charges (id, card_id, merchant, amount_cents, status, charged_on, created_at)
     SELECT gen_random_uuid(), $1, 'Audit', 100, 'approved', current_date - (g / 100), now() - (g || ' minutes')::interval
       FROM generate_series(1, 20000) g`,
    [card],
  );

  const coin = (await db.query("SELECT symbol FROM bank_coins LIMIT 1")).rows[0]
    .symbol;

  await db.query(
    `INSERT INTO bank_orders (id, user_id, symbol, account_id, side, spend_cents, limit_micros, status, created_at)
     SELECT gen_random_uuid(), $1, $2, $3, 'buy', 1000, 1000000, CASE WHEN g % 20 = 0 THEN 'open' ELSE 'filled' END, now() - (g || ' minutes')::interval
       FROM generate_series(1, 5000) g`,
    [user, coin, account],
  );

  await db.exec("ANALYZE");

  return { user, account, card };
}

async function unindexedForeignKeys(db) {
  const { rows } = await db.query(`
    SELECT c.conrelid::regclass::text AS table_name,
           a.attname AS column_name,
           c.confrelid::regclass::text AS references_table
      FROM pg_constraint c
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
     WHERE c.contype = 'f'
       AND NOT EXISTS (
         SELECT 1 FROM pg_index i
          WHERE i.indrelid = c.conrelid AND i.indkey[0] = c.conkey[1]
       )
     ORDER BY 1, 2`);
  return rows;
}

async function main() {
  const { PGlite } = await import("@electric-sql/pglite");
  const pglite = await PGlite.create();
  const db = {
    query: (text, params) => pglite.query(text, params),
    exec: (text) => pglite.exec(text),
    transaction: (work) =>
      pglite.transaction((tx) =>
        work({
          query: (text, params) => tx.query(text, params),
          exec: (text) => tx.exec(text),
        }),
      ),
  };

  try {
    await runMigrations(db);
    const ids = await seed(db);

    for (const query of QUERIES) {
      const plan = await db.query(
        `EXPLAIN (ANALYZE, COSTS OFF, TIMING OFF, SUMMARY ON) ${query.sql}`,
        query.params(ids),
      );
      console.log(`\n== ${query.name}`);
      for (const row of plan.rows) console.log(`   ${row["QUERY PLAN"]}`);
    }

    console.log(
      "\n== Foreign keys with no index starting with the key's column",
    );
    for (const row of await unindexedForeignKeys(db)) {
      console.log(
        `   ${row.table_name}.${row.column_name} -> ${row.references_table}`,
      );
    }
  } finally {
    await pglite.close();
  }
}

main().catch((error) => {
  console.error(`[db] ${error.message}`);
  process.exit(1);
});
