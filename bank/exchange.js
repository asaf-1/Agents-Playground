const crypto = require("crypto");
const coins = require("./coins");
const market = require("./market");
const trading = require("./trading");
const { cents } = require("./money");
const { notify } = require("./notify");

// Limit orders and price alerts: the exchange acting without a click.
//
// A customer says "buy $500 of BTC if it drops to $60,000" or "tell me when
// ETH goes above $4,000". Prices here are a pure function of (customer, coin,
// instant), so nothing has to watch a feed: whenever the customer makes a
// request, the open orders and armed alerts are compared with their price at
// that instant (`sweep`, called from the top of routes.js's handle). An order
// that has crossed is filled through the same quote-and-fill code as a trade
// made by hand, so the fee, the holding, the history row and the trade
// notification are exactly what a manual trade would produce.

const SIDES = ["buy", "sell"];
const DIRECTIONS = ["above", "below"];
const MAX_FILLS_PER_SWEEP = 50;

const FAIL_REASONS = {
  not_enough_money:
    "The account did not hold enough when the price was reached.",
  not_enough_coin: "You no longer held enough coin when the price was reached.",
  too_small: "At that price the order would have bought or sold nothing.",
};

// Has the customer's price reached the order? A buy fills at or below its
// limit, a sell at or above it.
//
// INTENTIONAL DEFECT (bankSellLimitInverted, REPORT): with the flag armed the
// sell comparison points the wrong way, so a sell order fills when the price
// is at or BELOW the limit: the customer asked for at least $X and gets less.
function crosses(
  side,
  priceMicros,
  limitMicros,
  { invertedSellBug = false } = {},
) {
  if (side === "buy") {
    return priceMicros <= limitMicros;
  }
  return invertedSellBug
    ? priceMicros <= limitMicros
    : priceMicros >= limitMicros;
}

function formatPrice(micros) {
  const dollars = micros / market.MICROS_PER_DOLLAR;
  return `$${dollars.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: dollars >= 1 ? 2 : 4,
  })}`;
}

// --- Orders ---------------------------------------------------------------------

const ORDER_SELECT = `
  SELECT o.id, o.user_id, o.symbol, o.account_id, o.side, o.spend_cents,
         o.quantity_atoms, o.limit_micros, o.status, o.fill_price_micros,
         o.trade_id, o.fail_reason, o.created_at, o.filled_at,
         c.name AS coin_name, a.number AS account_number
    FROM bank_orders o
    JOIN bank_coins c ON c.symbol = o.symbol
    JOIN bank_money_accounts a ON a.id = o.account_id`;

function toOrder(row) {
  return {
    id: row.id,
    symbol: row.symbol,
    coinName: row.coin_name,
    accountId: row.account_id,
    accountNumber: row.account_number,
    side: row.side,
    spendCents: row.spend_cents === null ? null : cents(row.spend_cents),
    quantityAtoms:
      row.quantity_atoms === null ? null : cents(row.quantity_atoms),
    quantity:
      row.quantity_atoms === null
        ? null
        : trading.formatAtoms(cents(row.quantity_atoms)),
    limitMicros: cents(row.limit_micros),
    status: row.status,
    fillPriceMicros:
      row.fill_price_micros === null ? null : cents(row.fill_price_micros),
    tradeId: row.trade_id || null,
    failReason: row.fail_reason || null,
    failReasonText: row.fail_reason ? FAIL_REASONS[row.fail_reason] : null,
    createdAt: new Date(row.created_at).toISOString(),
    filledAt: row.filled_at ? new Date(row.filled_at).toISOString() : null,
  };
}

async function findOrder(db, userId, id) {
  const { rows } = await db.query(
    `${ORDER_SELECT} WHERE o.user_id = $1 AND o.id = $2`,
    [userId, id],
  );
  return rows[0] ? toOrder(rows[0]) : null;
}

// Open ones first, newest first.
async function listOrders(db, userId, { symbol } = {}) {
  const { rows } = await db.query(
    `${ORDER_SELECT}
      WHERE o.user_id = $1 AND ($2::text IS NULL OR o.symbol = $2)
      ORDER BY (o.status = 'open') DESC, o.created_at DESC`,
    [userId, symbol || null],
  );
  return rows.map(toOrder);
}

// Every order newest first, a page after a cursor (GraphQL orders), on the
// same keyset terms as transactionsAfter in bank/money.js. Not "open first"
// like listOrders: a page that reorders as orders fill could not be paged.
async function ordersAfter(db, userId, { symbol = null, first, after = null }) {
  const count = await db.query(
    `SELECT count(*) AS total FROM bank_orders
      WHERE user_id = $1 AND ($2::text IS NULL OR symbol = $2)`,
    [userId, symbol],
  );
  const params = [userId, symbol];
  let clause = "o.user_id = $1 AND ($2::text IS NULL OR o.symbol = $2)";
  if (after) {
    params.push(after.at, after.id);
    clause += " AND (o.created_at, o.id) < ($3::timestamptz, $4::uuid)";
  }
  params.push(first + 1);
  const { rows } = await db.query(
    `${ORDER_SELECT.replace("o.created_at, o.filled_at,", "o.created_at, o.filled_at, o.created_at::text AS cursor_at,")}
      WHERE ${clause}
      ORDER BY o.created_at DESC, o.id DESC
      LIMIT $${params.length}`,
    params,
  );
  const page = rows.slice(0, first);
  const last = page[page.length - 1];
  return {
    orders: page.map(toOrder),
    total: Number(count.rows[0].total),
    hasNextPage: rows.length > first,
    last: last ? { at: last.cursor_at, id: last.id } : null,
  };
}

async function createOrder(
  db,
  { userId, coin, account, side, spendCents, quantityAtoms, limitMicros },
) {
  const id = crypto.randomUUID();
  await db.query(
    `INSERT INTO bank_orders
       (id, user_id, symbol, account_id, side, spend_cents, quantity_atoms, limit_micros)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      id,
      userId,
      coin.symbol,
      account.id,
      side,
      side === "buy" ? spendCents : null,
      side === "sell" ? quantityAtoms : null,
      limitMicros,
    ],
  );
  return findOrder(db, userId, id);
}

async function cancelOrder(db, userId, id) {
  const { rows } = await db.query(
    `UPDATE bank_orders SET status = 'cancelled'
      WHERE user_id = $1 AND id = $2 AND status = 'open'
     RETURNING id`,
    [userId, id],
  );
  return rows[0] ? findOrder(db, userId, id) : null;
}

// --- Alerts ---------------------------------------------------------------------

const ALERT_SELECT = `
  SELECT a.id, a.user_id, a.symbol, a.direction, a.limit_micros, a.status,
         a.fired_micros, a.fired_at, a.created_at, c.name AS coin_name
    FROM bank_price_alerts a
    JOIN bank_coins c ON c.symbol = a.symbol`;

function toAlert(row) {
  return {
    id: row.id,
    symbol: row.symbol,
    coinName: row.coin_name,
    direction: row.direction,
    limitMicros: cents(row.limit_micros),
    status: row.status,
    firedMicros: row.fired_micros === null ? null : cents(row.fired_micros),
    firedAt: row.fired_at ? new Date(row.fired_at).toISOString() : null,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

async function findAlert(db, userId, id) {
  const { rows } = await db.query(
    `${ALERT_SELECT} WHERE a.user_id = $1 AND a.id = $2`,
    [userId, id],
  );
  return rows[0] ? toAlert(rows[0]) : null;
}

async function listAlerts(db, userId, { symbol } = {}) {
  const { rows } = await db.query(
    `${ALERT_SELECT}
      WHERE a.user_id = $1 AND ($2::text IS NULL OR a.symbol = $2)
      ORDER BY (a.status = 'armed') DESC, a.created_at DESC`,
    [userId, symbol || null],
  );
  return rows.map(toAlert);
}

async function createAlert(db, { userId, coin, direction, limitMicros }) {
  const id = crypto.randomUUID();
  await db.query(
    `INSERT INTO bank_price_alerts (id, user_id, symbol, direction, limit_micros)
     VALUES ($1, $2, $3, $4, $5)`,
    [id, userId, coin.symbol, direction, limitMicros],
  );
  return findAlert(db, userId, id);
}

async function cancelAlert(db, userId, id) {
  const { rows } = await db.query(
    `UPDATE bank_price_alerts SET status = 'cancelled'
      WHERE user_id = $1 AND id = $2 AND status = 'armed'
     RETURNING id`,
    [userId, id],
  );
  return rows[0] ? findAlert(db, userId, id) : null;
}

// --- The sweep --------------------------------------------------------------------

// Checks every open order and armed alert of this customer against their price
// at `atMs`, fills and fires what has crossed. Called at the top of every
// request the customer makes; cheap when there is nothing open (two indexed
// reads). Each order is claimed with a compare-and-set before any money
// moves, so two requests at once cannot fill it twice.
async function sweep(db, user, { userKey, atMs, flags = {} }) {
  const open = await db.query(
    `${ORDER_SELECT} WHERE o.user_id = $1 AND o.status = 'open'
      ORDER BY o.created_at LIMIT $2`,
    [user.id, MAX_FILLS_PER_SWEEP],
  );
  const armed = await db.query(
    `${ALERT_SELECT} WHERE a.user_id = $1 AND a.status = 'armed'
      ORDER BY a.created_at`,
    [user.id],
  );
  if (open.rows.length === 0 && armed.rows.length === 0) {
    return { filled: 0, fired: 0 };
  }

  const pressures = await trading.pressureFor(db, user.id);
  const coinCache = new Map();
  async function priceOf(symbol) {
    if (!coinCache.has(symbol)) {
      coinCache.set(symbol, await coins.findCoin(db, symbol));
    }
    const coin = coinCache.get(symbol);
    return market.priceMicrosAt(userKey, coin, atMs, pressures[symbol] || 0);
  }

  let filled = 0;
  for (const row of open.rows) {
    const order = toOrder(row);
    const priceMicros = await priceOf(order.symbol);
    if (
      crosses(order.side, priceMicros, order.limitMicros, {
        invertedSellBug: Boolean(flags.bankSellLimitInverted),
      })
    ) {
      if (await fillOrder(db, user, order, { userKey, atMs, priceMicros })) {
        filled += 1;
      }
    }
  }

  let fired = 0;
  for (const row of armed.rows) {
    const alert = toAlert(row);
    const priceMicros = await priceOf(alert.symbol);
    const reached =
      alert.direction === "above"
        ? priceMicros >= alert.limitMicros
        : priceMicros <= alert.limitMicros;
    if (reached && (await fireAlert(db, user, alert, priceMicros))) {
      fired += 1;
    }
  }
  return { filled, fired };
}

async function fillOrder(db, user, order, { userKey, atMs, priceMicros }) {
  // Claim it. If another request got here first, this one does nothing.
  const claimed = await db.query(
    `UPDATE bank_orders SET status = 'filled', filled_at = now(), fill_price_micros = $3
      WHERE id = $1 AND user_id = $2 AND status = 'open'
     RETURNING id`,
    [order.id, user.id, priceMicros],
  );
  if (claimed.rows.length === 0) {
    return false;
  }

  try {
    const quote = await trading.quoteTrade(
      db,
      user.id,
      userKey,
      {
        symbol: order.symbol,
        side: order.side,
        spendCents: order.spendCents ?? undefined,
        quantityAtoms: order.quantityAtoms ?? undefined,
      },
      atMs,
    );
    const result = await trading.fillQuote(
      db,
      user.id,
      { quoteId: quote.id, accountId: order.accountId },
      {},
      atMs,
    );
    await db.query(
      `UPDATE bank_orders SET trade_id = $2, fill_price_micros = $3 WHERE id = $1`,
      [order.id, result.trade.id, quote.priceMicros],
    );
    await notify(db, {
      userId: user.id,
      kind: "order_filled",
      title: `Order filled: ${order.side === "buy" ? "bought" : "sold"} ${result.trade.quantity} ${order.symbol}`,
      body: `At ${formatPrice(quote.priceMicros)}, your limit was ${formatPrice(order.limitMicros)}.`,
      link: "/portfolio",
      amountCents:
        order.side === "buy" ? -result.trade.netCents : result.trade.netCents,
    });
    return true;
  } catch (error) {
    const reason =
      error instanceof trading.NotEnoughCoinError
        ? order.side === "buy"
          ? "not_enough_money"
          : "not_enough_coin"
        : error instanceof trading.QuoteNotFoundError
          ? "too_small"
          : null;
    if (!reason) {
      // Not a trading outcome: put the order back and let the error surface.
      await db.query(
        `UPDATE bank_orders SET status = 'open', filled_at = NULL, fill_price_micros = NULL WHERE id = $1`,
        [order.id],
      );
      throw error;
    }
    await db.query(
      `UPDATE bank_orders SET status = 'failed', fail_reason = $2, trade_id = NULL WHERE id = $1`,
      [order.id, reason],
    );
    await notify(db, {
      userId: user.id,
      kind: "order_failed",
      title: `Order not filled: ${order.side} ${order.symbol} at ${formatPrice(order.limitMicros)}`,
      body: FAIL_REASONS[reason],
      link: `/markets/${order.symbol}`,
    });
    return false;
  }
}

async function fireAlert(db, user, alert, priceMicros) {
  const fired = await db.query(
    `UPDATE bank_price_alerts SET status = 'fired', fired_at = now(), fired_micros = $3
      WHERE id = $1 AND user_id = $2 AND status = 'armed'
     RETURNING id`,
    [alert.id, user.id, priceMicros],
  );
  if (fired.rows.length === 0) {
    return false;
  }
  await notify(db, {
    userId: user.id,
    kind: "price_alert",
    title: `${alert.symbol} is ${alert.direction} ${formatPrice(alert.limitMicros)}`,
    body: `Your price is now ${formatPrice(priceMicros)}.`,
    link: `/markets/${alert.symbol}`,
  });
  return true;
}

module.exports = {
  DIRECTIONS,
  FAIL_REASONS,
  SIDES,
  cancelAlert,
  cancelOrder,
  createAlert,
  createOrder,
  crosses,
  findAlert,
  findOrder,
  listAlerts,
  listOrders,
  ordersAfter,
  sweep,
};
