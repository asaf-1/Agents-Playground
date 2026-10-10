const crypto = require("crypto");

// Notifications: what someone else did that this person should know about.
// They are written in the same database transaction as the action, so an
// action never happens without its notification, or the other way round.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function notify(
  tx,
  { userId, kind, title, body = "", link = "", amountCents = null },
) {
  await tx.query(
    `INSERT INTO bank_notifications
       (id, user_id, kind, title, body, link, amount_cents)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [crypto.randomUUID(), userId, kind, title, body, link, amountCents],
  );
}

function toNotification(row) {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    body: row.body,
    link: row.link,
    amountCents: row.amount_cents === null ? null : Number(row.amount_cents),
    read: row.read_at !== null,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

// The latest 30, and how many are unread.
async function listNotifications(db, userId, { countBug = false } = {}) {
  const { rows } = await db.query(
    `SELECT * FROM bank_notifications WHERE user_id = $1
      ORDER BY created_at DESC LIMIT 30`,
    [userId],
  );
  // INTENTIONAL DEFECT (bankNotificationCount, REPORT): counts every
  // notification instead of the unread ones, so reading them never brings
  // the number on the bell down.
  const count = await db.query(
    countBug
      ? "SELECT count(*) AS total FROM bank_notifications WHERE user_id = $1"
      : `SELECT count(*) AS total FROM bank_notifications
          WHERE user_id = $1 AND read_at IS NULL`,
    [userId],
  );
  return {
    notifications: rows.map(toNotification),
    unread: Number(count.rows[0].total),
  };
}

// Only the owner's notification can be marked; anyone else's answers null.
async function markRead(db, userId, id) {
  if (!UUID.test(String(id))) {
    return null;
  }
  const { rows } = await db.query(
    `UPDATE bank_notifications SET read_at = COALESCE(read_at, now())
      WHERE id = $1 AND user_id = $2 RETURNING *`,
    [id, userId],
  );
  return rows[0] ? toNotification(rows[0]) : null;
}

async function markAllRead(db, userId) {
  const { rows } = await db.query(
    `UPDATE bank_notifications SET read_at = now()
      WHERE user_id = $1 AND read_at IS NULL RETURNING id`,
    [userId],
  );
  return rows.length;
}

module.exports = { listNotifications, markAllRead, markRead, notify };
