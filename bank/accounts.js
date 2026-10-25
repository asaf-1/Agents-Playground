const crypto = require("crypto");
const {
  SESSION_HOURS,
  hashPassword,
  hashToken,
  newSessionToken,
} = require("./auth");

// Data access for users, sessions, profiles and settings. Every query passes
// its values as parameters ($1, $2...), never inside the SQL text, so SQL
// injection can't happen.

class EmailTakenError extends Error {}

function toUser(row) {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    role: row.role,
    status: row.status,
    isDemo: row.is_demo,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

function toProfile(row) {
  return {
    phone: row.phone,
    addressLine: row.address_line,
    city: row.city,
    postalCode: row.postal_code,
    country: row.country,
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function toSettings(row) {
  return {
    currency: row.currency,
    locale: row.locale,
    emailAlerts: row.email_alerts,
    statementEmails: row.statement_emails,
  };
}

const USER_COLUMNS =
  "id, email, full_name, role, status, is_demo, created_at, password_hash";

async function findUserByEmail(db, email) {
  const { rows } = await db.query(
    `SELECT ${USER_COLUMNS} FROM bank_users WHERE email = $1`,
    [email],
  );
  return rows[0] || null;
}

async function findUserById(db, id) {
  const { rows } = await db.query(
    `SELECT ${USER_COLUMNS} FROM bank_users WHERE id = $1`,
    [id],
  );
  return rows[0] || null;
}

// A user always gets a profile and settings row, created together.
async function createUser(
  db,
  {
    email,
    fullName,
    password,
    role = "customer",
    status = "active",
    isDemo = false,
    profile = {},
  },
) {
  const id = crypto.randomUUID();
  const passwordHash = await hashPassword(password);
  try {
    await db.transaction(async (tx) => {
      await tx.query(
        `INSERT INTO bank_users (id, email, full_name, password_hash, role, status, is_demo)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [id, email, fullName, passwordHash, role, status, isDemo],
      );
      await tx.query(
        `INSERT INTO bank_profiles (user_id, phone, address_line, city, postal_code, country)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          id,
          profile.phone || "",
          profile.addressLine || "",
          profile.city || "",
          profile.postalCode || "",
          profile.country || "",
        ],
      );
      await tx.query("INSERT INTO bank_settings (user_id) VALUES ($1)", [id]);
    });
  } catch (error) {
    if (error.code === "23505") {
      throw new EmailTakenError("email taken");
    }
    throw error;
  }
  return findUserById(db, id);
}

// device is the short browser description the Devices page shows (see
// describeDevice in auth.js); the raw User-Agent is never stored.
async function createSession(db, userId, device = "") {
  const token = newSessionToken();
  await db.query("DELETE FROM bank_sessions WHERE expires_at < now()");
  await db.query(
    `INSERT INTO bank_sessions (token_hash, user_id, expires_at, device)
     VALUES ($1, $2, now() + make_interval(hours => $3), $4)`,
    [hashToken(token), userId, SESSION_HOURS, device],
  );
  return token;
}

async function findSessionUser(db, token) {
  const tokenHash = hashToken(token);
  const { rows } = await db.query(
    `SELECT u.id, u.email, u.full_name, u.role, u.status, u.is_demo, u.created_at
       FROM bank_sessions s
       JOIN bank_users u ON u.id = s.user_id
      WHERE s.token_hash = $1 AND s.expires_at > now() AND u.status = 'active'`,
    [tokenHash],
  );
  if (rows[0]) {
    // "Last seen" for the Devices page. Written at most once a minute per
    // session, so a busy page does not turn every read into a write.
    await db.query(
      `UPDATE bank_sessions SET last_seen_at = now()
        WHERE token_hash = $1 AND last_seen_at < now() - interval '60 seconds'`,
      [tokenHash],
    );
  }
  return rows[0] || null;
}

async function deleteSession(db, token) {
  await db.query("DELETE FROM bank_sessions WHERE token_hash = $1", [
    hashToken(token),
  ]);
}

// --- Devices --------------------------------------------------------------------

function toSession(row) {
  return {
    id: row.id,
    device: row.device || "Unknown device",
    createdAt: new Date(row.created_at).toISOString(),
    lastSeenAt: new Date(row.last_seen_at).toISOString(),
    current: Boolean(row.current),
  };
}

// Every live session of one customer, newest activity first, with the one
// that asked marked current. The page names sessions by id and never sees a
// token.
async function listSessions(db, userId, currentToken) {
  const { rows } = await db.query(
    `SELECT id, device, created_at, last_seen_at, token_hash = $2 AS current
       FROM bank_sessions
      WHERE user_id = $1 AND expires_at > now()
      ORDER BY last_seen_at DESC, created_at DESC`,
    [userId, hashToken(currentToken || "")],
  );
  return rows.map(toSession);
}

// Ends one of the customer's own sessions. Returns the row it removed, so the
// caller can tell whether it was the current one, or null when the id is not
// one of theirs.
async function deleteSessionById(db, userId, id) {
  const { rows } = await db.query(
    `DELETE FROM bank_sessions WHERE user_id = $1 AND id = $2
     RETURNING id, token_hash`,
    [userId, id],
  );
  return rows[0] || null;
}

// "Log out everywhere else": ends every session of the customer except the one
// that asked. Returns how many it ended.
//
// INTENTIONAL DEFECT (bankEndOthersKeepsOne, REPORT): with the flag armed, the
// most recently used of the other sessions survives. The count the page shows
// is one short, and a device the customer meant to sign out stays signed in.
async function deleteOtherSessions(db, userId, currentToken, { keepOne } = {}) {
  const { rows } = await db.query(
    `DELETE FROM bank_sessions
      WHERE user_id = $1 AND token_hash <> $2
        AND ($3::boolean = false OR id <> (
              SELECT id FROM bank_sessions
               WHERE user_id = $1 AND token_hash <> $2
               ORDER BY last_seen_at DESC, created_at DESC
               LIMIT 1))
     RETURNING id`,
    [userId, hashToken(currentToken || ""), Boolean(keepOne)],
  );
  return rows.length;
}

// --- The hold on repeated failed log-ins -----------------------------------------
// Rows live in bank_login_holds, one per email and client. See auth.js for the
// settings and routes.js for how a log-in uses them.

// The hold in force for this email and client, or null.
async function loginHold(db, email, client) {
  const { rows } = await db.query(
    `SELECT held_until FROM bank_login_holds
      WHERE email = $1 AND client = $2 AND held_until IS NOT NULL AND held_until > now()`,
    [email, client],
  );
  if (!rows[0]) {
    return null;
  }
  const heldUntil = new Date(rows[0].held_until);
  return {
    heldUntil,
    retryAfterSeconds: Math.max(
      1,
      Math.ceil((heldUntil.getTime() - Date.now()) / 1000),
    ),
  };
}

// Counts one more failure. Failures older than the hold window start the count
// over; reaching maxFailures starts a hold of holdSeconds and resets the count,
// so once the hold has passed the customer begins with a clean slate.
async function recordLoginFailure(
  db,
  email,
  client,
  { maxFailures, holdSeconds },
) {
  const { rows } = await db.query(
    `INSERT INTO bank_login_holds (email, client, failures, first_failed_at, held_until)
     VALUES ($1, $2, 1, now(), NULL)
     ON CONFLICT (email, client) DO UPDATE SET
       failures = CASE
         WHEN bank_login_holds.first_failed_at < now() - make_interval(secs => $3) THEN 1
         ELSE bank_login_holds.failures + 1
       END,
       first_failed_at = CASE
         WHEN bank_login_holds.first_failed_at < now() - make_interval(secs => $3) THEN now()
         ELSE bank_login_holds.first_failed_at
       END,
       held_until = NULL
     RETURNING failures`,
    [email, client, holdSeconds],
  );
  const failures = Number(rows[0].failures);
  if (failures < maxFailures) {
    return { failures, heldUntil: null };
  }
  const held = await db.query(
    `UPDATE bank_login_holds
        SET held_until = now() + make_interval(secs => $3), failures = 0, first_failed_at = now()
      WHERE email = $1 AND client = $2
     RETURNING held_until`,
    [email, client, holdSeconds],
  );
  return { failures, heldUntil: new Date(held.rows[0].held_until) };
}

// A successful log-in forgets the failures that came before it.
async function clearLoginHold(db, email, client) {
  await db.query(
    "DELETE FROM bank_login_holds WHERE email = $1 AND client = $2",
    [email, client],
  );
}

async function loadAccount(db, userId) {
  const [user, profile, settings] = await Promise.all([
    findUserById(db, userId),
    db.query("SELECT * FROM bank_profiles WHERE user_id = $1", [userId]),
    db.query("SELECT * FROM bank_settings WHERE user_id = $1", [userId]),
  ]);
  return {
    user: toUser(user),
    profile: toProfile(profile.rows[0]),
    settings: toSettings(settings.rows[0]),
  };
}

async function updateProfile(db, userId, fields) {
  await db.transaction(async (tx) => {
    if (fields.fullName !== undefined) {
      await tx.query(
        "UPDATE bank_users SET full_name = $2, updated_at = now() WHERE id = $1",
        [userId, fields.fullName],
      );
    }
    const columns = {
      phone: "phone",
      addressLine: "address_line",
      city: "city",
      postalCode: "postal_code",
      country: "country",
    };
    const sets = [];
    const values = [userId];
    for (const [key, column] of Object.entries(columns)) {
      if (fields[key] !== undefined) {
        values.push(fields[key]);
        sets.push(`${column} = $${values.length}`);
      }
    }
    if (sets.length > 0) {
      await tx.query(
        `UPDATE bank_profiles SET ${sets.join(", ")}, updated_at = now() WHERE user_id = $1`,
        values,
      );
    }
  });
  return loadAccount(db, userId);
}

async function updateSettings(db, userId, settings) {
  await db.query(
    `UPDATE bank_settings
        SET currency = $2, locale = $3, email_alerts = $4, statement_emails = $5,
            updated_at = now()
      WHERE user_id = $1`,
    [
      userId,
      settings.currency,
      settings.locale,
      settings.emailAlerts,
      settings.statementEmails,
    ],
  );
  return loadAccount(db, userId);
}

async function listUsers(db) {
  const { rows } = await db.query(
    `SELECT ${USER_COLUMNS} FROM bank_users ORDER BY created_at, email`,
  );
  return rows.map(toUser);
}

// Locking a user also ends all of their sessions.
async function updateUserByAdmin(db, userId, { role, status }) {
  await db.transaction(async (tx) => {
    if (role !== undefined) {
      await tx.query(
        "UPDATE bank_users SET role = $2, updated_at = now() WHERE id = $1",
        [userId, role],
      );
    }
    if (status !== undefined) {
      await tx.query(
        "UPDATE bank_users SET status = $2, updated_at = now() WHERE id = $1",
        [userId, status],
      );
      if (status === "locked") {
        await tx.query("DELETE FROM bank_sessions WHERE user_id = $1", [
          userId,
        ]);
      }
    }
  });
  return toUser(await findUserById(db, userId));
}

module.exports = {
  EmailTakenError,
  clearLoginHold,
  createSession,
  createUser,
  deleteOtherSessions,
  deleteSession,
  deleteSessionById,
  findSessionUser,
  findUserByEmail,
  findUserById,
  listSessions,
  listUsers,
  loadAccount,
  loginHold,
  recordLoginFailure,
  toUser,
  updateProfile,
  updateSettings,
  updateUserByAdmin,
};
