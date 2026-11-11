// Node's crypto for ids, and the money helper that reads bigint columns.
const crypto = require("crypto");
const { cents } = require("./money");

// The audit log and the books check ("a more real back end", phase 4).
//
// The audit log is one line for every staff action and every money action:
// who, what, to which record, through which door (REST or GraphQL), how they
// were signed in (a session or an API key), the request id, and the details
// they sent with anything secret taken out. The database refuses to change or
// delete a line (015_bank_rules.sql), so the log can only grow.
//
// The books check adds up every account's history rows and compares the sum
// with the balance. Every change to a balance writes one history row in the
// same transaction, so the two always agree; an account where they do not is
// money that moved without a record.
//
// The planted bug bankAuditGraphqlGap lives in bank/routes.js, which is where
// a GraphQL request is written to the log.

// Fields that never go into the log, wherever they appear in a request.
const SECRET_FIELDS = new Set([
  "password",
  "currentPassword",
  "newPassword",
  "token",
  "cvv",
]);
// Long text is cut to this many characters in the log.
const MAX_TEXT = 200;
// The most lines one page or one CSV holds.
const MAX_PAGE = 100;
const MAX_CSV_ROWS = 5000;

// A copy of a request with the secrets removed and long text cut short.
function redact(value, depth = 0) {
  if (depth > 4) {
    return "…";
  }
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => redact(item, depth + 1));
  }
  if (value && typeof value === "object") {
    const out = {};
    for (const [key, item] of Object.entries(value)) {
      out[key] = SECRET_FIELDS.has(key) ? "[removed]" : redact(item, depth + 1);
    }
    return out;
  }
  if (typeof value === "string" && value.length > MAX_TEXT) {
    return `${value.slice(0, MAX_TEXT)}…`;
  }
  return value;
}

// --- What counts as an action -------------------------------------------------

// The REST changes that are written to the log: the method, the path, the
// action's name, and where its record's id is found (a part of the path, or a
// field of the answer).
const REST_ACTIONS = [
  {
    method: "POST",
    path: /^\/api\/bank\/accounts$/,
    action: "account.open",
    type: "account",
    from: (m, a) => a.account?.id,
  },
  {
    method: "POST",
    path: /^\/api\/bank\/accounts\/([^/]+)\/deposits$/,
    action: "money.add_funds",
    type: "account",
    from: (m) => m[1],
  },
  {
    method: "POST",
    path: /^\/api\/bank\/transfers$/,
    action: "money.transfer",
    type: "transfer",
    from: (m, a) => a.transfer?.id,
  },
  {
    method: "POST",
    path: /^\/api\/bank\/bill-payments$/,
    action: "money.bill_payment",
    type: "bill_payment",
    from: (m, a) => a.payment?.id,
  },
  {
    method: "POST",
    path: /^\/api\/bank\/scheduled-payments$/,
    action: "money.schedule",
    type: "scheduled_payment",
    from: (m, a) => a.payment?.id,
  },
  {
    method: "POST",
    path: /^\/api\/bank\/requests\/([^/]+)\/pay$/,
    action: "request.pay",
    type: "money_request",
    from: (m) => m[1],
  },
  {
    method: "POST",
    path: /^\/api\/bank\/trades$/,
    action: "crypto.trade",
    type: "trade",
    from: (m, a) => a.trade?.id,
  },
  {
    method: "POST",
    path: /^\/api\/bank\/wallet\/send$/,
    action: "crypto.send",
    type: "wallet_send",
    from: (m, a) => a.id,
  },
  {
    method: "POST",
    path: /^\/api\/bank\/wallet\/swap$/,
    action: "crypto.swap",
    type: "wallet_swap",
    from: (m, a) => a.id,
  },
  {
    method: "POST",
    path: /^\/api\/bank\/cards$/,
    action: "card.create",
    type: "card",
    from: (m, a) => a.card?.id,
  },
  {
    method: "PATCH",
    path: /^\/api\/bank\/cards\/([^/]+)$/,
    action: "card.update",
    type: "card",
    from: (m) => m[1],
  },
  {
    method: "POST",
    path: /^\/api\/bank\/cards\/([^/]+)\/charges$/,
    action: "card.charge",
    type: "card_charge",
    from: (m, a) => a.charge?.id,
  },
  {
    method: "POST",
    path: /^\/api\/bank\/loans$/,
    action: "loan.request",
    type: "loan",
    from: (m, a) => a.loan?.id,
  },
  {
    method: "POST",
    path: /^\/api\/bank\/keys$/,
    action: "key.create",
    type: "api_key",
    from: (m, a) => a.key?.id,
  },
  {
    method: "DELETE",
    path: /^\/api\/bank\/keys\/([^/]+)$/,
    action: "key.revoke",
    type: "api_key",
    from: (m) => m[1],
  },
  {
    method: "POST",
    path: /^\/api\/bank\/shop\/checkout$/,
    action: "shop.checkout",
    type: "shop_order",
    from: (m, a) => a.order?.id,
  },
  {
    method: "PATCH",
    path: /^\/api\/bank\/admin\/users\/([^/]+)$/,
    action: "staff.user_update",
    type: "user",
    from: (m) => m[1],
  },
  {
    method: "PATCH",
    path: /^\/api\/bank\/admin\/loans\/([^/]+)$/,
    action: "staff.loan_decision",
    type: "loan",
    from: (m) => m[1],
  },
  {
    method: "PATCH",
    path: /^\/api\/bank\/admin\/cards\/([^/]+)$/,
    action: "staff.card_freeze",
    type: "card",
    from: (m) => m[1],
  },
  {
    method: "PATCH",
    path: /^\/api\/bank\/admin\/shop\/orders\/([^/]+)$/,
    action: "staff.order_status",
    type: "shop_order",
    from: (m) => m[1],
  },
  {
    method: "POST",
    path: /^\/api\/bank\/admin\/shop\/orders\/([^/]+)\/refund$/,
    action: "staff.order_refund",
    type: "shop_order",
    from: (m) => m[1],
  },
  {
    method: "PATCH",
    path: /^\/api\/bank\/admin\/shop\/products\/([^/]+)$/,
    action: "staff.restock",
    type: "product",
    from: (m) => m[1],
  },
];

// The GraphQL mutations that are written to the log, with the same action
// names as their REST twins, so one action reads the same whichever door it
// came through.
const GRAPHQL_ACTIONS = {
  addFunds: { action: "money.add_funds", type: "account" },
  transfer: { action: "money.transfer", type: "transfer" },
  payBill: { action: "money.bill_payment", type: "bill_payment" },
  payRequest: { action: "request.pay", type: "money_request" },
  trade: { action: "crypto.trade", type: "trade" },
  sendCoin: { action: "crypto.send", type: "wallet_send" },
  swapCoin: { action: "crypto.swap", type: "wallet_swap" },
  getCard: { action: "card.create", type: "card" },
  updateCard: { action: "card.update", type: "card" },
  chargeCard: { action: "card.charge", type: "card_charge" },
  requestLoan: { action: "loan.request", type: "loan" },
  createApiKey: { action: "key.create", type: "api_key" },
  revokeApiKey: { action: "key.revoke", type: "api_key" },
  checkout: { action: "shop.checkout", type: "shop_order" },
  advanceShopOrder: { action: "staff.order_status", type: "shop_order" },
  refundShopOrder: { action: "staff.order_refund", type: "shop_order" },
  restockProduct: { action: "staff.restock", type: "product" },
};

// Every action name, for the page's filter.
const ACTIONS = [
  ...new Set([
    ...REST_ACTIONS.map((entry) => entry.action),
    ...Object.values(GRAPHQL_ACTIONS).map((entry) => entry.action),
  ]),
].sort();

// The REST action for a method and path, with its record's id, or null.
function restAction(method, path, answer) {
  for (const entry of REST_ACTIONS) {
    const match = entry.method === method ? path.match(entry.path) : null;
    if (match) {
      let id = "";
      try {
        id = entry.from(match, answer || {}) || "";
      } catch {
        id = "";
      }
      return {
        action: entry.action,
        targetType: entry.type,
        targetId: String(id),
      };
    }
  }
  return null;
}

// The id of the main record in a GraphQL mutation's answer: the answer's own
// id, or the id of the first object inside it that has one.
function graphqlTargetId(data) {
  if (!data || typeof data !== "object") {
    return "";
  }
  if (typeof data.id === "string") {
    return data.id;
  }
  for (const value of Object.values(data)) {
    if (value && typeof value === "object" && typeof value.id === "string") {
      return value.id;
    }
  }
  return "";
}

// --- Writing and reading ------------------------------------------------------

// Writes one line.
async function record(
  db,
  {
    actor,
    action,
    targetType = "",
    targetId = "",
    door,
    auth,
    requestId,
    details = {},
  },
) {
  await db.query(
    `INSERT INTO bank_audit_log
       (id, actor_user_id, actor_email, actor_role, action, target_type,
        target_id, door, auth, request_id, details)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)`,
    [
      crypto.randomUUID(),
      actor.id,
      actor.email,
      actor.role,
      action,
      targetType,
      String(targetId || ""),
      door,
      auth,
      requestId,
      JSON.stringify(redact(details)),
    ],
  );
}

// A line as the API shows it.
function toEntry(row) {
  return {
    id: row.id,
    actorId: row.actor_user_id,
    actorEmail: row.actor_email,
    actorRole: row.actor_role,
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id,
    door: row.door,
    auth: row.auth,
    requestId: row.request_id,
    details:
      typeof row.details === "string" ? JSON.parse(row.details) : row.details,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

// The filters as a WHERE clause and its values: an action, a door, a person's
// email, and (for the next page) a cursor.
function whereFor({ action, door, actorEmail, after }) {
  const clauses = [];
  const params = [];
  if (action) {
    params.push(action);
    clauses.push(`action = $${params.length}`);
  }
  if (door) {
    params.push(door);
    clauses.push(`door = $${params.length}`);
  }
  if (actorEmail) {
    params.push(String(actorEmail).toLowerCase());
    clauses.push(`actor_email = $${params.length}`);
  }
  const countParams = [...params];
  const countWhere = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  if (after) {
    params.push(after.at, after.id);
    clauses.push(
      `(created_at, id) < ($${params.length - 1}::timestamptz, $${params.length}::uuid)`,
    );
  }
  return {
    where: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "",
    params,
    countWhere,
    countParams,
  };
}

// One page of the log, newest first, after a cursor: the lines, how many match
// in all, whether there is more, and the last line's cursor.
async function listEntries(
  db,
  { first = 50, after = null, action, door, actorEmail } = {},
) {
  const size = Math.min(Math.max(first, 1), MAX_PAGE);
  const { where, params, countWhere, countParams } = whereFor({
    action,
    door,
    actorEmail,
    after,
  });
  const count = await db.query(
    `SELECT count(*) AS total FROM bank_audit_log ${countWhere}`,
    countParams,
  );
  params.push(size + 1);
  const { rows } = await db.query(
    `SELECT *, created_at::text AS cursor_at FROM bank_audit_log ${where}
      ORDER BY created_at DESC, id DESC LIMIT $${params.length}`,
    params,
  );
  const page = rows.slice(0, size);
  const last = page[page.length - 1];
  return {
    entries: page.map(toEntry),
    total: Number(count.rows[0].total),
    hasNextPage: rows.length > size,
    last: last ? { at: last.cursor_at, id: last.id } : null,
  };
}

// The log as CSV rows, newest first, for the download.
async function csvEntries(db, filters = {}) {
  const { where, params } = whereFor({ ...filters, after: null });
  params.push(MAX_CSV_ROWS);
  const { rows } = await db.query(
    `SELECT * FROM bank_audit_log ${where}
      ORDER BY created_at DESC, id DESC LIMIT $${params.length}`,
    params,
  );
  return rows.map(toEntry);
}

// --- The books check ------------------------------------------------------------

// Every account's balance against the sum of its history rows. The demo
// accounts carry a hand-written sample history and can never move money, so
// they are listed as sample data rather than checked.
async function books(db) {
  const { rows } = await db.query(
    `SELECT a.id, a.number, a.balance_cents, u.email, u.is_demo,
            COALESCE(t.total, 0) AS lines_cents
       FROM bank_money_accounts a
       JOIN bank_users u ON u.id = a.user_id
       LEFT JOIN (SELECT account_id, SUM(amount_cents) AS total
                    FROM bank_transactions GROUP BY account_id) t
         ON t.account_id = a.id
      ORDER BY a.number`,
  );
  const checked = rows.filter((row) => !row.is_demo);
  const outOfBalance = checked
    .map((row) => ({
      accountId: row.id,
      accountNumber: row.number,
      ownerEmail: row.email,
      balanceCents: cents(row.balance_cents),
      linesCents: cents(row.lines_cents),
      differenceCents: cents(row.balance_cents) - cents(row.lines_cents),
    }))
    .filter((account) => account.differenceCents !== 0);
  const totalBalanceCents = checked.reduce(
    (sum, row) => sum + cents(row.balance_cents),
    0,
  );
  const totalLinesCents = checked.reduce(
    (sum, row) => sum + cents(row.lines_cents),
    0,
  );
  return {
    balanced: outOfBalance.length === 0,
    checkedAccounts: checked.length,
    sampleAccounts: rows.length - checked.length,
    totalBalanceCents,
    totalLinesCents,
    differenceCents: totalBalanceCents - totalLinesCents,
    outOfBalance,
    checkedAt: new Date().toISOString(),
  };
}

// What the routes and GraphQL use.
module.exports = {
  ACTIONS,
  GRAPHQL_ACTIONS,
  MAX_PAGE,
  books,
  csvEntries,
  graphqlTargetId,
  listEntries,
  record,
  redact,
  restAction,
};
