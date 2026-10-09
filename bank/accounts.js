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

async function createSession(db, userId) {
  const token = newSessionToken();
  await db.query("DELETE FROM bank_sessions WHERE expires_at < now()");
  await db.query(
    `INSERT INTO bank_sessions (token_hash, user_id, expires_at)
     VALUES ($1, $2, now() + make_interval(hours => $3))`,
    [hashToken(token), userId, SESSION_HOURS],
  );
  return token;
}

async function findSessionUser(db, token) {
  const { rows } = await db.query(
    `SELECT u.id, u.email, u.full_name, u.role, u.status, u.is_demo, u.created_at
       FROM bank_sessions s
       JOIN bank_users u ON u.id = s.user_id
      WHERE s.token_hash = $1 AND s.expires_at > now() AND u.status = 'active'`,
    [hashToken(token)],
  );
  return rows[0] || null;
}

async function deleteSession(db, token) {
  await db.query("DELETE FROM bank_sessions WHERE token_hash = $1", [
    hashToken(token),
  ]);
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
  createSession,
  createUser,
  deleteSession,
  findSessionUser,
  findUserByEmail,
  findUserById,
  listUsers,
  loadAccount,
  toUser,
  updateProfile,
  updateSettings,
  updateUserByAdmin,
};
