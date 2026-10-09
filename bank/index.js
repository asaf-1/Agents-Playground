const { createDatabase } = require("./db");
const { runMigrations } = require("./migrate");
const { createRoutes } = require("./routes");
const { seedDemoAccounts } = require("./seed");

// Playground Bank's back end, mounted by server.js at /api/bank/*. start()
// connects the database, brings its tables up to date and adds the demo
// accounts; server.js only opens its port once that has worked.
function createBank() {
  let db = null;
  let handler = null;

  return {
    async start() {
      db = await createDatabase();
      const migrations = await runMigrations(db);
      await seedDemoAccounts(db);
      handler = createRoutes(db, {
        database: db.kind,
        migrations: migrations.applied,
      });
      console.log(
        db.kind === "postgres"
          ? "Playground Bank database: Postgres (DATABASE_URL)"
          : "Playground Bank database: PGlite in memory (resets on restart)",
      );
    },

    async handle(request, response, requestUrl) {
      if (!handler) {
        response.writeHead(503, {
          "Cache-Control": "no-store",
          "Content-Type": "application/json; charset=utf-8",
        });
        response.end(
          JSON.stringify({
            code: "STARTING",
            message: "The bank is starting. Try again in a moment.",
          }),
        );
        return;
      }
      await handler(request, response, requestUrl);
    },

    async stop() {
      if (db) {
        await db.close().catch(() => {});
      }
    },
  };
}

module.exports = { createBank };
