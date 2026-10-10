const crypto = require("crypto");
const { UUID, cents, findTransfer, moveMoney } = require("./money");
const { notify } = require("./notify");

// Money requests: a customer asks another customer for money by the payer's
// account number. The payer sees it, then pays (a real transfer) or declines;
// the requester can cancel while it waits. Each answer notifies the other side.

const MAX_PENDING_REQUESTS = 10;

class TooManyRequestsError extends Error {}
class RequestNotPendingError extends Error {}

function toRequest(row) {
  return {
    id: row.id,
    amountCents: cents(row.amount_cents),
    memo: row.memo,
    status: row.status,
    requesterName: row.requester_name,
    toAccountNumber: row.to_number,
    payerAccountNumber: row.payer_account_number,
    transferId: row.transfer_id || null,
    answeredAt: row.answered_at
      ? new Date(row.answered_at).toISOString()
      : null,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

const REQUEST_SELECT = `
  SELECT r.*, u.full_name AS requester_name, a.number AS to_number
    FROM bank_money_requests r
    JOIN bank_users u ON u.id = r.requester_id
    JOIN bank_money_accounts a ON a.id = r.to_account_id`;

async function findRequest(db, id) {
  if (!UUID.test(String(id))) {
    return null;
  }
  const { rows } = await db.query(`${REQUEST_SELECT} WHERE r.id = $1`, [id]);
  return rows[0] || null;
}

async function createRequest(
  db,
  { requesterId, requesterName, toAccount, payerAccount, amountCents, memo },
) {
  const id = crypto.randomUUID();
  await db.transaction(async (tx) => {
    const { rows } = await tx.query(
      `SELECT count(*) AS total FROM bank_money_requests
        WHERE requester_id = $1 AND status = 'pending'`,
      [requesterId],
    );
    if (Number(rows[0].total) >= MAX_PENDING_REQUESTS) {
      throw new TooManyRequestsError("too many pending requests");
    }
    await tx.query(
      `INSERT INTO bank_money_requests
         (id, requester_id, to_account_id, payer_id, payer_account_number,
          amount_cents, memo)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        id,
        requesterId,
        toAccount.id,
        payerAccount.user_id,
        payerAccount.number,
        amountCents,
        memo,
      ],
    );
    await notify(tx, {
      userId: payerAccount.user_id,
      kind: "request_received",
      title: `${requesterName} asked you for money`,
      body: memo || `For ${payerAccount.number}`,
      link: "/bank/requests",
      amountCents,
    });
  });
  return toRequest(await findRequest(db, id));
}

async function listRequests(db, userId) {
  const incoming = await db.query(
    `${REQUEST_SELECT} WHERE r.payer_id = $1
      ORDER BY (r.status = 'pending') DESC, r.created_at DESC LIMIT 50`,
    [userId],
  );
  const outgoing = await db.query(
    `${REQUEST_SELECT} WHERE r.requester_id = $1
      ORDER BY (r.status = 'pending') DESC, r.created_at DESC LIMIT 50`,
    [userId],
  );
  return {
    incoming: incoming.rows.map(toRequest),
    outgoing: outgoing.rows.map(toRequest),
  };
}

// Paying claims the request and moves the money in one transaction: the
// claim only succeeds while it is still pending, so it is paid at most once.
async function payRequest(
  db,
  { request, payerId, fromAccount, key, doublePay },
) {
  const transferId = await db.transaction(async (tx) => {
    // INTENTIONAL DEFECT (bankRequestDoublePay, REPORT): with the flag armed
    // the claim forgets "AND status = 'pending'", so a request that was
    // already paid can be paid again.
    const claim = await tx.query(
      doublePay
        ? `UPDATE bank_money_requests SET status = 'paid', answered_at = now()
            WHERE id = $1 AND payer_id = $2 AND status IN ('pending', 'paid')
            RETURNING *`
        : `UPDATE bank_money_requests SET status = 'paid', answered_at = now()
            WHERE id = $1 AND payer_id = $2 AND status = 'pending'
            RETURNING *`,
      [request.id, payerId],
    );
    if (claim.rows.length === 0) {
      throw new RequestNotPendingError("not pending");
    }
    const { rows } = await tx.query(
      "SELECT * FROM bank_money_accounts WHERE id = $1",
      [request.to_account_id],
    );
    const id = await moveMoney(tx, {
      userId: payerId,
      from: fromAccount,
      to: rows[0],
      amountCents: cents(request.amount_cents),
      memo: request.memo || "Money request",
      key,
      // The requester gets "your request was paid" below instead.
      notifyRecipient: false,
    });
    await tx.query(
      "UPDATE bank_money_requests SET transfer_id = $2 WHERE id = $1",
      [request.id, id],
    );
    await notify(tx, {
      userId: request.requester_id,
      kind: "request_answered",
      title: "Your request was paid",
      body: `From ${fromAccount.number}`,
      link: "/bank/requests",
      amountCents: cents(request.amount_cents),
    });
    return id;
  });
  return {
    request: toRequest(await findRequest(db, request.id)),
    transfer: await findTransfer(db, transferId),
  };
}

async function declineRequest(db, { request, payerId }) {
  await db.transaction(async (tx) => {
    const claim = await tx.query(
      `UPDATE bank_money_requests SET status = 'declined', answered_at = now()
        WHERE id = $1 AND payer_id = $2 AND status = 'pending' RETURNING id`,
      [request.id, payerId],
    );
    if (claim.rows.length === 0) {
      throw new RequestNotPendingError("not pending");
    }
    await notify(tx, {
      userId: request.requester_id,
      kind: "request_answered",
      title: "Your request was declined",
      body: request.memo || `By ${request.payer_account_number}`,
      link: "/bank/requests",
      amountCents: cents(request.amount_cents),
    });
  });
  return toRequest(await findRequest(db, request.id));
}

async function cancelRequest(db, { request, requesterId }) {
  const { rows } = await db.query(
    `UPDATE bank_money_requests SET status = 'cancelled', answered_at = now()
      WHERE id = $1 AND requester_id = $2 AND status = 'pending' RETURNING id`,
    [request.id, requesterId],
  );
  if (rows.length === 0) {
    throw new RequestNotPendingError("not pending");
  }
  return toRequest(await findRequest(db, request.id));
}

module.exports = {
  MAX_PENDING_REQUESTS,
  RequestNotPendingError,
  TooManyRequestsError,
  cancelRequest,
  createRequest,
  declineRequest,
  findRequest,
  listRequests,
  payRequest,
};
