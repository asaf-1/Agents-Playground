// Playground Bank's database. With DATABASE_URL set (Neon, on Render) it talks
// to Postgres through `pg`. Without it, it starts PGlite: a real Postgres engine
// that runs inside Node, in memory. The SQL is the same either way, so local
// runs, the tests and CI need no database server and no secret.
const { Pool } = require("pg");

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

  return {
    kind: "postgres",
    query: (text, params) => pool.query(text, params),
    exec: (text) => pool.query(text),
    async transaction(work) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await work({
          query: (text, params) => client.query(text, params),
          exec: (text) => client.query(text),
        });
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

async function pgliteDatabase() {
  const { PGlite } = await import("@electric-sql/pglite");
  const db = await PGlite.create();

  return {
    kind: "pglite",
    query: (text, params) => db.query(text, params),
    exec: (text) => db.exec(text),
    transaction: (work) =>
      db.transaction((tx) =>
        work({
          query: (text, params) => tx.query(text, params),
          exec: (text) => tx.exec(text),
        }),
      ),
    close: () => db.close(),
  };
}

async function createDatabase(url = process.env.DATABASE_URL) {
  const connectionString = (url || "").trim();
  return connectionString
    ? postgresDatabase(connectionString)
    : pgliteDatabase();
}

module.exports = { createDatabase };
