// The database, its migrations, the starter money, the API routes and the demo
// data.
const { createDatabase } = require("./db");
const { runMigrations } = require("./migrate");
const { ensureStarterAccounts, seedDemoMoney } = require("./money");
const { createRoutes } = require("./routes");
const { seedDemoAccounts, seedDemoBillsAndLoans } = require("./seed");
// The shared security headers.
const security = require("../security-headers");

// Playground Bank's back end, mounted by server.js at /api/bank/*. start()
// connects the database, brings its tables up to date and adds the demo
// accounts and their money; server.js only opens its port once that has
// worked. getFlags(request, url) returns the planted-bug flags for the
// request's runKey (server.js owns the flag store).
function createBank({ getFlags, getRunKey } = {}) {
  // Set by start(); until then every request gets "starting".
  let db = null;
  let handler = null;

  return {
    // Connect, bring the tables up to date, add the demo data, then build the
    // routes.
    async start() {
      db = await createDatabase();
      const migrations = await runMigrations(db);
      await seedDemoAccounts(db);
      await seedDemoMoney(db);
      await seedDemoBillsAndLoans(db);
      await ensureStarterAccounts(db);
      handler = createRoutes(
        db,
        {
          database: db.kind,
          migrations: migrations.applied,
        },
        getFlags,
        getRunKey,
      );
      // Say which database is in use.
      console.log(
        db.kind === "postgres"
          ? "Playground Bank database: Postgres (DATABASE_URL)"
          : "Playground Bank database: PGlite in memory (resets on restart)",
      );
    },

    // Answers one /api/bank request.
    async handle(request, response, requestUrl) {
      // Still starting: 503 with a "try again" message.
      if (!handler) {
        response.writeHead(
          503,
          security.headersFor("api", {
            request,
            extra: {
              "Cache-Control": "no-store",
              "Content-Type": "application/json; charset=utf-8",
            },
          }),
        );
        response.end(
          JSON.stringify({
            code: "STARTING",
            message: "The bank is starting. Try again in a moment.",
          }),
        );
        return;
      }
      // Ready: the routes answer.
      await handler(request, response, requestUrl);
    },

    // Closes the database when the server stops.
    async stop() {
      if (db) {
        await db.close().catch(() => {});
      }
    },
  };
}

module.exports = { createBank };
