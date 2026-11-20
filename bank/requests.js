// Node's crypto for new ids, the money helpers that move and find transfers,
// notifications, and the error for a key reused for something else.
const crypto = require("crypto");
const {
  UUID,
  cents,
  findTransfer,
  findTransferByKey,
  moveMoney,
} = require("./money");
const { notify } = require("./notify");
const { IdempotencyMismatchError } = require("./idempotency");

// Money requests: a customer asks another customer for money by the payer's
// account number. The payer sees it, then pays (a real transfer) or declines;
// the requester can cancel while it waits. Each answer notifies the other side.

// A customer may have at most 10 requests waiting at once.
const MAX_PENDING_REQUESTS = 10;

// Thrown for an eleventh waiting request, and for answering one that is no
// longer waiting.
class TooManyRequestsError extends Error {}
class RequestNotPendingError extends Error {}

// A database row as the API shows it.
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

// Every request is read with its requester's name and the account it pays into.
const REQUEST_SELECT = `
  SELECT r.*, u.full_name AS requester_name, a.number AS to_number
    FROM bank_money_requests r
    JOIN bank_users u ON u.id = r.requester_id
    JOIN bank_money_accounts a ON a.id = r.to_account_id`;

// One request by its id; null for a bad or unknown id.
async function findRequest(db, id) {
  if (!UUID.test(String(id))) {
    return null;
  }
  const { rows } = await db.query(`${REQUEST_SELECT} WHERE r.id = $1`, [id]);
  return rows[0] || null;
}

// Creates a request and tells the payer, in one transaction.
async function createRequest(
  db,
  { requesterId, requesterName, toAccount, payerAccount, amountCents, memo },
) {
  const id = crypto.randomUUID();
  await db.transaction(async (tx) => {
    // Refuse an eleventh waiting request.
    const { rows } = await tx.query(
      `SELECT count(*) AS total FROM bank_money_requests
        WHERE requester_id = $1 AND status = 'pending'`,
      [requesterId],
    );
    if (Number(rows[0].total) >= MAX_PENDING_REQUESTS) {
      throw new TooManyRequestsError("too many pending requests");
    }
    // Save it, then notify the payer.
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

// A customer's requests: the ones they were asked to pay and the ones they
// sent, waiting ones first.
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

// The answer for a key that already paid something: the first payment again
// when it paid this request from this account (a page whose answer was lost
// presses Pay again with the same key), or IdempotencyMismatchError when the
// key paid something else. null for a new key. The request is read fresh, so
// a press that raced another one sees the payment the other one made.
async function replayPayment(db, { request, payerId, fromAccount, key }) {
  if (!key) return null;
  const existing = await findTransferByKey(db, payerId, key);
  if (!existing) return null;
  const now = await findRequest(db, request.id);
  if (
    !now ||
    now.transfer_id !== existing.id ||
    existing.fromAccountId !== fromAccount.id
  ) {
    throw new IdempotencyMismatchError("key reused for another payment");
  }
  return { request: toRequest(now), transfer: existing, replayed: true };
}

// Paying claims the request and moves the money in one transaction: the
// claim only succeeds while it is still pending, so it is paid at most once.
// The same payment again with the same key gets its first answer back
// (replayed: true), the way a transfer does, instead of "already answered".
async function payRequest(
  db,
  { request, payerId, fromAccount, key, doublePay },
) {
  const again = await replayPayment(db, {
    request,
    payerId,
    fromAccount,
    key,
  });
  if (again) return again;
  let transferId;
  try {
    transferId = await payOnce(db, {
      request,
      payerId,
      fromAccount,
      key,
      doublePay,
    });
  } catch (error) {
    // Two presses with the same key at once: the other one paid, so this one
    // answers as it did.
    if (
      key &&
      (error instanceof RequestNotPendingError || error.code === "23505")
    ) {
      const raced = await replayPayment(db, {
        request,
        payerId,
        fromAccount,
        key,
      });
      if (raced) return raced;
    }
    throw error;
  }
  // The request and its transfer, as they are now.
  return {
    request: toRequest(await findRequest(db, request.id)),
    transfer: await findTransfer(db, transferId),
    replayed: false,
  };
}

// The claim, the money and the notification, in one transaction. Returns the
// new transfer's id.
async function payOnce(db, { request, payerId, fromAccount, key, doublePay }) {
  return db.transaction(async (tx) => {
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
    // Move the money from the payer's account to the requester's.
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
    // Link the transfer to the request, and tell the requester.
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
}

// The payer says no; the requester is told.
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

// The requester takes back a request that is still waiting.
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

// What the routes and GraphQL use.
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
