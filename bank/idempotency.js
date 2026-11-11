// Node's crypto, for the request fingerprint.
const crypto = require("crypto");

// Retry-safe money requests ("a more real back end", phase 4). A client that
// is not sure a payment went through -- the network dropped, the page timed
// out -- sends it again with the same Idempotency-Key. The first request claims
// the key and stores its answer; every later one with that key gets the stored
// answer instead of paying a second time.
//
// The key is tied to what was asked: the same key with a different request
// (another amount, another account) is refused with 422, because answering it
// with the first result would tell the client a payment happened that never
// did. Stripe and most payment APIs behave the same way.
//
// Transfers, bill pay and paying a money request keep the keys they already
// had (stored on their own rows, bank/money.js and bank/bills.js); this module
// covers every other money action, and the shop.

// Thrown for a key reused with a different request, and for a key whose first
// request is still running.
class IdempotencyMismatchError extends Error {}
class IdempotencyInProgressError extends Error {}

// A key is at most 100 characters; keys are kept for a day.
const KEY_MAX = 100;
const KEEP_HOURS = 24;

// The request as text with its keys sorted, so the same request written in any
// key order has the same fingerprint.
function stableJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .filter((key) => value[key] !== undefined)
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value === undefined ? null : value);
}

// What was asked, as a SHA-256: the action's scope and the request.
function fingerprint(scope, request) {
  return crypto
    .createHash("sha256")
    .update(`${scope}\n${stableJson(request)}`)
    .digest("hex");
}

// Runs work once per key. Without a key it simply runs. With one:
//   - a new key is claimed, the work runs, and its result is stored;
//   - a key seen before with the same request returns the stored result, with
//     replayed: true;
//   - a key seen before with a different request throws
//     IdempotencyMismatchError;
//   - a key whose first request has not finished throws
//     IdempotencyInProgressError.
// When the work fails, the claim is let go, so a corrected retry with the same
// key can go through.
//
// INTENTIONAL DEFECT (bankIdempotencyMismatch, REPORT): with the flag armed a
// key reused with a different request returns the first result as if all was
// well, so the client believes the second, different payment happened.
async function once(
  db,
  { userId, key, scope, request, mismatchBug = false },
  work,
) {
  if (!key) {
    return { result: await work(), replayed: false };
  }
  // Old keys are cleared as new ones arrive.
  await db.query(
    `DELETE FROM bank_idempotency_keys
      WHERE created_at < now() - make_interval(hours => $1)`,
    [KEEP_HOURS],
  );
  const hash = fingerprint(scope, request);

  // Claim the key; the primary key lets exactly one request win.
  const claimed = await db.query(
    `INSERT INTO bank_idempotency_keys (user_id, key, scope, request_hash)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, key) DO NOTHING
     RETURNING key`,
    [userId, key, scope, hash],
  );

  // Seen before: the same request replays, a different one is refused.
  if (claimed.rows.length === 0) {
    const { rows } = await db.query(
      "SELECT * FROM bank_idempotency_keys WHERE user_id = $1 AND key = $2",
      [userId, key],
    );
    const row = rows[0];
    if (!row) {
      // Cleared between the two statements: claim it afresh.
      return once(db, { userId, key, scope, request, mismatchBug }, work);
    }
    const same = row.scope === scope && row.request_hash === hash;
    if (!same && !mismatchBug) {
      throw new IdempotencyMismatchError("key reused for another request");
    }
    if (row.state !== "done") {
      throw new IdempotencyInProgressError(
        "the first request is still running",
      );
    }
    const result =
      typeof row.result === "string" ? JSON.parse(row.result) : row.result;
    return { result, replayed: true };
  }

  // New: do the work and keep its answer, or let the key go if it failed.
  try {
    const result = await work();
    await db.query(
      `UPDATE bank_idempotency_keys SET state = 'done', result = $3::jsonb
        WHERE user_id = $1 AND key = $2`,
      [userId, key, JSON.stringify(result)],
    );
    return { result, replayed: false };
  } catch (error) {
    await db
      .query(
        "DELETE FROM bank_idempotency_keys WHERE user_id = $1 AND key = $2",
        [userId, key],
      )
      .catch(() => {});
    throw error;
  }
}

// What the routes, GraphQL and the money modules use.
module.exports = {
  IdempotencyInProgressError,
  IdempotencyMismatchError,
  KEY_MAX,
  fingerprint,
  once,
  stableJson,
};
