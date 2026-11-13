// Node's crypto, for request ids.
const crypto = require("crypto");
// The database, its migrations, the starter money, the API routes, the demo
// data and the shop's catalogue.
const { createDatabase } = require("./db");
const { runMigrations } = require("./migrate");
const { ensureStarterAccounts, seedDemoMoney } = require("./money");
const { createRoutes } = require("./routes");
const { seedDemoAccounts, seedDemoBillsAndLoans } = require("./seed");
const shop = require("./shop");
// Tracing: off unless OTEL_EXPORTER_OTLP_ENDPOINT is set (see tracing.js).
const tracing = require("./tracing");
// The shared security headers.
const security = require("../security-headers");

// A request id a caller may send in X-Request-Id: 8 to 64 letters, digits,
// dots, dashes or underscores. Anything else is replaced with a new one.
const REQUEST_ID = /^[A-Za-z0-9._-]{8,64}$/;

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
      // Tracing first, so the database can be wrapped. With tracing off,
      // wrapDatabase hands the database back unchanged.
      const traced = tracing.start();
      db = tracing.wrapDatabase(await createDatabase());
      const migrations = await runMigrations(db);
      await seedDemoAccounts(db);
      await seedDemoMoney(db);
      await seedDemoBillsAndLoans(db);
      await ensureStarterAccounts(db);
      await shop.seedShopProducts(db);
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
      // Say where the spans go, only when tracing is on.
      if (traced) {
        console.log(
          `Playground Bank tracing: on, sending to ${process.env.OTEL_EXPORTER_OTLP_ENDPOINT}`,
        );
      }
    },

    // Answers one /api/bank request.
    async handle(request, response, requestUrl) {
      // Every answer carries a request id: the caller's own, when it sent a
      // sensible one, or a new one. The audit log and the server's error lines
      // carry the same id, so one request can be followed end to end.
      const incoming = String(request.headers["x-request-id"] || "");
      request.requestId = REQUEST_ID.test(incoming)
        ? incoming
        : crypto.randomUUID();
      response.setHeader("X-Request-Id", request.requestId);

      // With tracing on, the rest of the request runs inside one span (and
      // its queries inside that); with it off, it just runs.
      await tracing.traceRequest(request, response, requestUrl, async () => {
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
      });
    },

    // The shop's products for the classic /api/products routes in server.js,
    // read from the database in the shape those routes have always answered.
    async classicProducts() {
      return shop.listClassicProducts(db);
    },

    async classicProduct(id) {
      return shop.findClassicProduct(db, id);
    },

    // Closes the database when the server stops, and sends any spans still
    // waiting (nothing to send when tracing is off).
    async stop() {
      if (db) {
        await db.close().catch(() => {});
      }
      await tracing.stop();
    },
  };
}

module.exports = { createBank };
