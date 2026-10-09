const fs = require("fs");
const path = require("path");

const MIGRATIONS_DIR = path.join(__dirname, "migrations");

// Numbered SQL files (001_accounts.sql, 002_...): each runs once, in order,
// inside a transaction, and is recorded in bank_schema_migrations. A new change
// to the tables is always a new file, never an edit to an old one.
async function runMigrations(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS bank_schema_migrations (
      version integer PRIMARY KEY,
      name text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const { rows } = await db.query("SELECT version FROM bank_schema_migrations");
  const applied = new Set(rows.map((row) => Number(row.version)));

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((file) => /^\d{3}_[a-z0-9_-]+\.sql$/.test(file))
    .sort();

  let ran = 0;
  for (const file of files) {
    const version = Number(file.slice(0, 3));
    if (applied.has(version)) {
      continue;
    }
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    await db.transaction(async (tx) => {
      await tx.exec(sql);
      await tx.query(
        "INSERT INTO bank_schema_migrations (version, name) VALUES ($1, $2)",
        [version, file],
      );
    });
    ran += 1;
  }

  return { applied: applied.size + ran, ran };
}

module.exports = { runMigrations };
