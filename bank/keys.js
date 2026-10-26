const crypto = require("crypto");
const { hashToken } = require("./auth");

// Personal API keys: a developer's way into /api/bank/* and GraphQL without
// a browser session. A key is created on the Developer page with a name and
// a scope, shown exactly once, and stored only as a hash. Every request made
// with one is checked for scope (a read key may not change anything) and
// counted against a per-minute limit. Keys cannot manage keys: that needs the
// signed-in session, so a leaked key cannot mint more of itself.

const SCOPES = ["read", "write"];
const MAX_ACTIVE_KEYS = 10;
const PREFIX_LENGTH = 12;

function positiveInt(value, fallback) {
  const n = Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

// Requests a key may make in one minute. A setting (the environment, and
// k8s/10-configmap.yaml in the cluster), with this default when unset.
const RATE_LIMIT_PER_MINUTE = positiveInt(process.env.BANK_KEY_RATE_LIMIT, 60);

class TooManyKeysError extends Error {}

// "pbk_" and 32 URL-safe random characters. The prefix identifies the key on
// the page without giving anything away.
function newToken() {
  return `pbk_${crypto.randomBytes(24).toString("base64url")}`;
}

function toKey(row) {
  return {
    id: row.id,
    name: row.name,
    scope: row.scope,
    prefix: row.prefix,
    createdAt: new Date(row.created_at).toISOString(),
    lastUsedAt: row.last_used_at
      ? new Date(row.last_used_at).toISOString()
      : null,
    revokedAt: row.revoked_at ? new Date(row.revoked_at).toISOString() : null,
  };
}

async function listKeys(db, userId) {
  const { rows } = await db.query(
    `SELECT * FROM bank_api_keys WHERE user_id = $1
      ORDER BY (revoked_at IS NULL) DESC, created_at DESC`,
    [userId],
  );
  return rows.map(toKey);
}

// Returns the key's row and the token, which is never stored or shown again.
async function createKey(db, { userId, name, scope }) {
  const active = await db.query(
    `SELECT count(*) AS total FROM bank_api_keys
      WHERE user_id = $1 AND revoked_at IS NULL`,
    [userId],
  );
  if (Number(active.rows[0].total) >= MAX_ACTIVE_KEYS) {
    throw new TooManyKeysError("too many keys");
  }
  const token = newToken();
  const id = crypto.randomUUID();
  await db.query(
    `INSERT INTO bank_api_keys (id, user_id, name, scope, token_hash, prefix)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, userId, name, scope, hashToken(token), token.slice(0, PREFIX_LENGTH)],
  );
  const { rows } = await db.query("SELECT * FROM bank_api_keys WHERE id = $1", [
    id,
  ]);
  return { key: toKey(rows[0]), token };
}

async function revokeKey(db, userId, id) {
  const { rows } = await db.query(
    `UPDATE bank_api_keys SET revoked_at = now()
      WHERE user_id = $1 AND id = $2 AND revoked_at IS NULL
     RETURNING *`,
    [userId, id],
  );
  return rows[0] ? toKey(rows[0]) : null;
}

// The key and its owner for a presented token, or null when the token is
// unknown, revoked, or belongs to a locked account.
async function findActiveByToken(db, token) {
  const { rows } = await db.query(
    `SELECT k.id AS key_id, k.name AS key_name, k.scope AS key_scope,
            u.id, u.email, u.full_name, u.role, u.status, u.is_demo, u.created_at
       FROM bank_api_keys k
       JOIN bank_users u ON u.id = k.user_id
      WHERE k.token_hash = $1 AND k.revoked_at IS NULL AND u.status = 'active'`,
    [hashToken(token)],
  );
  if (!rows[0]) {
    return null;
  }
  const row = rows[0];
  return {
    key: { id: row.key_id, name: row.key_name, scope: row.key_scope },
    userRow: row,
  };
}

// "Last used", written at most once a minute per key.
async function touch(db, keyId) {
  await db.query(
    `UPDATE bank_api_keys SET last_used_at = now()
      WHERE id = $1 AND (last_used_at IS NULL OR last_used_at < now() - interval '60 seconds')`,
    [keyId],
  );
}

// Counts this request against the key's current minute. Allowed while the
// count is within the limit; otherwise says how long until the next minute.
async function rateLimit(db, keyId, limit = RATE_LIMIT_PER_MINUTE) {
  const { rows } = await db.query(
    `INSERT INTO bank_api_key_usage (key_id, minute, count)
     VALUES ($1, date_trunc('minute', now()), 1)
     ON CONFLICT (key_id, minute) DO UPDATE SET count = bank_api_key_usage.count + 1
     RETURNING count, minute`,
    [keyId],
  );
  const count = Number(rows[0].count);
  if (count === 1) {
    // The first request of a new minute sweeps the minutes nobody needs.
    await db.query(
      "DELETE FROM bank_api_key_usage WHERE minute < now() - interval '1 hour'",
    );
  }
  const minuteStart = new Date(rows[0].minute).getTime();
  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((minuteStart + 60_000 - Date.now()) / 1000),
  );
  return {
    allowed: count <= limit,
    limit,
    remaining: Math.max(0, limit - count),
    retryAfterSeconds,
  };
}

module.exports = {
  MAX_ACTIVE_KEYS,
  RATE_LIMIT_PER_MINUTE,
  SCOPES,
  TooManyKeysError,
  createKey,
  findActiveByToken,
  listKeys,
  rateLimit,
  revokeKey,
  touch,
};
