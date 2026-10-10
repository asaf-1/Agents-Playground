const crypto = require("crypto");
const { UUID } = require("./money");
const { notify } = require("./notify");

// Support tickets: a customer writes to the bank, optionally about one of their
// transactions; Support and Admin answer from the inbox and mark it solved.
// A staff reply sets the ticket to "answered" and notifies the customer; the
// customer's reply sets it back to "open" for staff.

class TicketNotFoundError extends Error {}

function toTicket(row) {
  return {
    id: row.id,
    subject: row.subject,
    status: row.status,
    transactionId: row.transaction_id || null,
    transactionDescription: row.transaction_description || null,
    customer: {
      id: row.user_id,
      fullName: row.customer_name,
      email: row.customer_email,
      isDemo: Boolean(row.customer_is_demo),
    },
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function toMessage(row) {
  return {
    id: row.id,
    body: row.body,
    authorName: row.author_name,
    fromStaff: row.author_role === "support" || row.author_role === "admin",
    createdAt: new Date(row.created_at).toISOString(),
  };
}

const TICKET_SELECT = `
  SELECT t.*, u.full_name AS customer_name, u.email AS customer_email,
         u.is_demo AS customer_is_demo, x.description AS transaction_description
    FROM bank_support_tickets t
    JOIN bank_users u ON u.id = t.user_id
    LEFT JOIN bank_transactions x ON x.id = t.transaction_id`;

async function findTicket(db, id) {
  if (!UUID.test(String(id))) {
    return null;
  }
  const { rows } = await db.query(`${TICKET_SELECT} WHERE t.id = $1`, [id]);
  return rows[0] || null;
}

// The transaction must belong to the customer opening the ticket.
async function ownTransaction(db, userId, transactionId) {
  if (!UUID.test(String(transactionId))) {
    return null;
  }
  const { rows } = await db.query(
    `SELECT x.id FROM bank_transactions x
       JOIN bank_money_accounts a ON a.id = x.account_id
      WHERE x.id = $1 AND a.user_id = $2`,
    [transactionId, userId],
  );
  return rows[0] || null;
}

async function openTicket(
  db,
  { userId, subject, body, transactionId, createdAt },
) {
  const id = crypto.randomUUID();
  await db.transaction(async (tx) => {
    await tx.query(
      `INSERT INTO bank_support_tickets
         (id, user_id, subject, transaction_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, COALESCE($5, now()), COALESCE($5, now()))`,
      [id, userId, subject, transactionId || null, createdAt || null],
    );
    await tx.query(
      `INSERT INTO bank_support_messages (id, ticket_id, author_id, body, created_at)
       VALUES ($1, $2, $3, $4, COALESCE($5, now()))`,
      [crypto.randomUUID(), id, userId, body, createdAt || null],
    );
  });
  return findTicket(db, id);
}

async function listMyTickets(db, userId) {
  const { rows } = await db.query(
    `${TICKET_SELECT} WHERE t.user_id = $1 ORDER BY t.updated_at DESC LIMIT 50`,
    [userId],
  );
  return rows.map(toTicket);
}

// The staff inbox: open first (waiting for staff), then answered, then solved.
async function listAllTickets(db, status) {
  const order = `ORDER BY CASE t.status WHEN 'open' THEN 0 WHEN 'answered' THEN 1 ELSE 2 END,
                          t.updated_at DESC LIMIT 200`;
  const { rows } = status
    ? await db.query(`${TICKET_SELECT} WHERE t.status = $1 ${order}`, [status])
    : await db.query(`${TICKET_SELECT} ${order}`);
  return rows.map(toTicket);
}

async function ticketMessages(db, ticketId) {
  const { rows } = await db.query(
    `SELECT m.*, u.full_name AS author_name, u.role AS author_role
       FROM bank_support_messages m
       JOIN bank_users u ON u.id = m.author_id
      WHERE m.ticket_id = $1
      ORDER BY m.seq`,
    [ticketId],
  );
  return rows.map(toMessage);
}

async function addMessage(
  db,
  { ticket, author, body, statusBug = false, createdAt },
) {
  const fromStaff = author.role === "support" || author.role === "admin";
  // INTENTIONAL DEFECT (bankSupportStatus, REPORT): with the flag armed, the
  // customer's reply leaves the ticket on "answered", so staff never see it
  // come back to the top of their "open" list.
  const status = fromStaff ? "answered" : statusBug ? ticket.status : "open";
  await db.transaction(async (tx) => {
    await tx.query(
      `INSERT INTO bank_support_messages (id, ticket_id, author_id, body, created_at)
       VALUES ($1, $2, $3, $4, COALESCE($5, now()))`,
      [crypto.randomUUID(), ticket.id, author.id, body, createdAt || null],
    );
    await tx.query(
      `UPDATE bank_support_tickets SET status = $2, updated_at = COALESCE($3, now())
        WHERE id = $1`,
      [ticket.id, status, createdAt || null],
    );
    if (fromStaff && ticket.user_id !== author.id) {
      await notify(tx, {
        userId: ticket.user_id,
        kind: "support_reply",
        title: "Support answered you",
        body: ticket.subject,
        link: `/support/${ticket.id}`,
      });
    }
  });
  return findTicket(db, ticket.id);
}

async function solveTicket(db, { ticket }) {
  await db.transaction(async (tx) => {
    await tx.query(
      `UPDATE bank_support_tickets SET status = 'solved', updated_at = now()
        WHERE id = $1`,
      [ticket.id],
    );
    await notify(tx, {
      userId: ticket.user_id,
      kind: "support_solved",
      title: "Your ticket was solved",
      body: ticket.subject,
      link: `/support/${ticket.id}`,
    });
  });
  return findTicket(db, ticket.id);
}

module.exports = {
  TicketNotFoundError,
  addMessage,
  findTicket,
  listAllTickets,
  listMyTickets,
  openTicket,
  ownTransaction,
  solveTicket,
  ticketMessages,
  toTicket,
};
