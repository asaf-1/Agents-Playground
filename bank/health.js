// Playground Bank's own health checks, which the canaries, the cluster's probes
// and Render ask instead of the classic site's /api/health. No sign-in needed.
//
// - GET /api/bank/health/live: "the bank is running". bank/index.js answers it
//   before anything else, even while the bank is starting, and it never
//   touches the database: a slow database must never make a host restart the
//   bank.
// - GET /api/bank/health/ready: "the bank can serve money". bank/routes.js
//   answers it once the bank has started (before that, every /api/bank address
//   gets 503 STARTING): its database answers, and every migration file has run.

// The migration files on disk, to compare with what the database has applied.
const { migrationFiles } = require("./migrate");

// The live answer's address, and the ready one's.
const LIVE = "/api/bank/health/live";
const READY = "/api/bank/health/ready";

// The commit the bank runs, so a failure can be tied to a version: Render's
// RENDER_GIT_COMMIT, else APP_REVISION (the canaries set it to the commit they
// test; the Dockerfile's default is "unknown"), else "unknown".
function revision() {
  return (
    String(process.env.RENDER_GIT_COMMIT || "").trim() ||
    String(process.env.APP_REVISION || "").trim() ||
    "unknown"
  );
}

// The live answer: nothing to check, the bank answered.
function liveAnswer() {
  return { status: "live" };
}

// The ready answer: one small question to the database, which both proves it
// answers and counts the migrations it has applied. Returns the HTTP status
// and the body: 200 ready, or 503 saying what is missing. The database's own
// error is written to the server's log, never sent: its text can name hosts
// and ports.
async function checkReady(db, request) {
  const expected = migrationFiles().length;
  const answer = {
    status: "ready",
    database: db.kind,
    migrations: { applied: null, expected },
    revision: revision(),
  };

  // The question. A database that can't answer: 503, and why, in the log.
  let applied;
  try {
    const { rows } = await db.query(
      "SELECT count(*)::int AS applied FROM bank_schema_migrations",
    );
    applied = Number(rows[0].applied);
  } catch (error) {
    console.error(
      `[bank] ready check (${request.requestId}): the database did not answer: ${error.message}`,
    );
    return {
      status: 503,
      body: {
        ...answer,
        status: "not ready",
        code: "DATABASE_UNAVAILABLE",
        message: "The database did not answer.",
      },
    };
  }

  // Fewer migrations applied than there are files: the tables are behind.
  answer.migrations.applied = applied;
  if (applied < expected) {
    return {
      status: 503,
      body: {
        ...answer,
        status: "not ready",
        code: "MIGRATIONS_BEHIND",
        message: `${applied} of ${expected} migrations have run.`,
      },
    };
  }

  // Everything answered.
  return { status: 200, body: answer };
}

module.exports = { LIVE, READY, liveAnswer, checkReady };
