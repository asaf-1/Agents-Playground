// Playground Bank's database. With DATABASE_URL set (Neon, on Render) it talks
// to Postgres through `pg`. Without it, it starts PGlite: a real Postgres engine
// that runs inside Node, in memory. The SQL is the same either way, so local
// runs, the tests and CI need no database server and no secret.

// Node's Postgres client.
const { Pool } = require("pg");

// Savepoint names are numbered, so two are never the same.
let savepoints = 0;

// The database handed to work inside a transaction: query and exec, plus a
// transaction of its own. A transaction inside a transaction is a savepoint:
// the inner work is saved or undone on its own, and the outer transaction
// decides at the end. This is what lets bank/idempotency.js wrap a money
// action (which opens its own transaction) and the saving of its answer in
// one outer transaction.
function inTransaction(runner) {
  const tx = {
    query: (text, params) => runner.query(text, params),
    exec: (text) => runner.exec(text),
    async transaction(work) {
      savepoints += 1;
      const name = `bank_savepoint_${savepoints}`;
      await runner.exec(`SAVEPOINT ${name}`);
      try {
        const result = await work(tx);
        await runner.exec(`RELEASE SAVEPOINT ${name}`);
        return result;
      } catch (error) {
        // Undo only the inner work; the outer transaction can go on or fail.
        await runner.exec(`ROLLBACK TO SAVEPOINT ${name}`).catch(() => {});
        throw error;
      }
    },
  };
  return tx;
}

// Postgres: a small pool of connections.
function postgresDatabase(connectionString) {
  const pool = new Pool({
    connectionString,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 15_000,
  });
  // Neon closes idle connections when it scales to zero. Without a listener,
  // an error on an idle connection would crash the whole server.
  pool.on("error", (error) => {
    console.error(`[bank] idle database connection closed: ${error.message}`);
  });

  // The same small interface for both databases: query, exec, a transaction,
  // close.
  return {
    kind: "postgres",
    query: (text, params) => pool.query(text, params),
    exec: (text) => pool.query(text),
    // Runs work in one transaction: all of it is saved, or none of it.
    async transaction(work) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await work(
          inTransaction({
            query: (text, params) => client.query(text, params),
            exec: (text) => client.query(text),
          }),
        );
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}

// PGlite: Postgres in memory, loaded only when needed.
async function pgliteDatabase() {
  const { PGlite } = await import("@electric-sql/pglite");
  const db = await PGlite.create();

  return {
    kind: "pglite",
    query: (text, params) => db.query(text, params),
    exec: (text) => db.exec(text),
    transaction: (work) =>
      db.transaction((tx) =>
        work(
          inTransaction({
            query: (text, params) => tx.query(text, params),
            exec: (text) => tx.exec(text),
          }),
        ),
      ),
    close: () => db.close(),
  };
}

// Postgres when DATABASE_URL is set, PGlite otherwise.
async function createDatabase(url = process.env.DATABASE_URL) {
  const connectionString = (url || "").trim();
  return connectionString
    ? postgresDatabase(connectionString)
    : pgliteDatabase();
}

module.exports = { createDatabase };
