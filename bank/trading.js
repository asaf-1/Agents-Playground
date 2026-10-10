// Buying and selling coin with bank money (phase 3b).
//
// This is the join between the exchange and the bank. A buy takes cents out of
// a real account and gives back atoms of coin; a sell does the reverse. Both
// write a row into bank_transactions, so one history shows a transfer, a bill,
// a loan and a coin purchase together.
//
// Units, kept whole so nothing rounds badly:
//   cents  -- money, as everywhere else in the bank
//   atoms  -- hundred-millionths of a coin, so 0.1 + 0.2 is exactly 0.3
//   micros -- millionths of a dollar, the market's price unit
//
// Nothing here is a fixed table. The price is the customer's own live price,
// the fee comes from how much they have traded, and their own buying nudges
// their market.
const crypto = require("crypto");
const coins = require("./coins");
const market = require("./market");
const { UUID, cents, insertTransaction } = require("./money");
const { notify } = require("./notify");

const ATOMS_PER_COIN = market.ATOMS_PER_COIN;
// atoms = cents / micros * ATOMS_SCALE. Derived once: a cent is 1e4 micros,
// and a coin is 1e8 atoms, so the conversion factor is 1e12.
const ATOMS_SCALE = 1e12;

// A quote is good for 15 seconds. Long enough to read, short enough that "the
// price moved while you were deciding" is a real thing to practise on.
const QUOTE_SECONDS = 15;

// The fee is not a rate card either. It starts at 0.30% and falls towards
// 0.10% as a customer trades more, so an active trader pays less -- and the
// first trade a new customer makes costs them the most.
const FEE_MAX_BP = 30;
const FEE_MIN_BP = 10;
const FEE_VOLUME_SCALE_CENTS = 50_000_000;

const MIN_SPEND_CENTS = 100;
const MAX_SPEND_CENTS = 100_000_000;
// How far back a trade still pushes on the price, and the window the fee tier
// is measured over.
const IMPACT_WINDOW_MS = 48 * 3_600_000;
const VOLUME_WINDOW_MS = 30 * 86_400_000;

class QuoteNotFoundError extends Error {}
class QuoteExpiredError extends Error {}
class QuoteUsedError extends Error {}
class NotEnoughCoinError extends Error {}

// Coin -> money and back. Both round to a whole unit, and both are safe well
// past any balance this bank allows: the largest spend is $1,000,000, which is
// 1e8 cents, and 1e8 / a price in micros stays far inside a float's 15 digits.
function atomsForCents(grossCents, priceMicros) {
  return Math.round((grossCents / priceMicros) * ATOMS_SCALE);
}

function centsForAtoms(atoms, priceMicros) {
  return Math.round((atoms / ATOMS_SCALE) * priceMicros);
}

// What this customer pays per trade, from what they have traded lately.
async function feeBasisPointsFor(db, userId) {
  const { rows } = await db.query(
    `SELECT COALESCE(SUM(abs(gross_cents)), 0) AS volume
       FROM bank_trades
      WHERE user_id = $1 AND created_at >= $2`,
    [userId, new Date(Date.now() - VOLUME_WINDOW_MS).toISOString()],
  );
  const volume = cents(rows[0].volume);
  return (
    FEE_MIN_BP +
    Math.round(
      (FEE_MAX_BP - FEE_MIN_BP) *
        (1 - Math.tanh(volume / FEE_VOLUME_SCALE_CENTS)),
    )
  );
}

// How hard this customer's own recent trading is pushing on each of their
// prices. Buying lifts, selling drops, and the push fades over two days, the
// way a real market absorbs an order. This is what the market module's
// `pressure` argument expects, and it is why a big buy visibly moves the line.
async function pressureFor(db, userId) {
  const { rows } = await db.query(
    `SELECT symbol, side, quantity_atoms, created_at
       FROM bank_trades
      WHERE user_id = $1 AND created_at >= $2`,
    [userId, new Date(Date.now() - IMPACT_WINDOW_MS).toISOString()],
  );
  const now = Date.now();
  const pressures = {};
  for (const row of rows) {
    const age = now - new Date(row.created_at).getTime();
    const weight = Math.max(0, 1 - age / IMPACT_WINDOW_MS);
    const atoms = cents(row.quantity_atoms) * weight;
    pressures[row.symbol] =
      (pressures[row.symbol] || 0) + (row.side === "buy" ? atoms : -atoms);
  }
  return pressures;
}

// The market as this customer sees it, with their own trading already priced
// in. Everything that shows a price to a signed-in customer goes through here.
async function marketFor(db, userId, userKey, atMs) {
  return coins.marketList(db, userKey, atMs, {
    pressures: await pressureFor(db, userId),
  });
}

function toHolding(row) {
  return {
    symbol: row.symbol,
    quantityAtoms: cents(row.quantity_atoms),
    costCents: cents(row.cost_cents),
  };
}

async function findHolding(db, userId, symbol) {
  const { rows } = await db.query(
    "SELECT * FROM bank_holdings WHERE user_id = $1 AND symbol = $2",
    [userId, symbol],
  );
  return rows[0] ? toHolding(rows[0]) : null;
}

async function listHoldings(db, userId) {
  const { rows } = await db.query(
    `SELECT * FROM bank_holdings
      WHERE user_id = $1 AND quantity_atoms > 0
      ORDER BY symbol`,
    [userId],
  );
  return rows.map(toHolding);
}

// Price a trade and remember the price for 15 seconds.
//
// A buy is quoted on money to spend: the fee comes off first, and what is left
// buys coin. A sell is quoted on a quantity: the coin is valued, and the fee
// comes off what the customer receives.
async function quoteTrade(
  db,
  userId,
  userKey,
  { symbol, side, spendCents, quantityAtoms },
  atMs = Date.now(),
  flags = {},
) {
  const coin = await coins.findCoin(db, symbol);
  const pressures = await pressureFor(db, userId);
  const priceMicros = market.priceMicrosAt(
    userKey,
    coin,
    atMs,
    pressures[coin.symbol] || 0,
  );
  const feeBasisPoints = await feeBasisPointsFor(db, userId);

  let grossCents;
  let feeCents;
  let netCents;
  let filledAtoms;

  if (side === "buy") {
    // netCents is what leaves the account: everything the customer asked to
    // spend. The fee comes out of it, and the rest buys coin.
    netCents = spendCents;
    feeCents = Math.round((netCents * feeBasisPoints) / 10_000);
    grossCents = netCents - feeCents;
    filledAtoms = atomsForCents(grossCents, priceMicros);
    if (filledAtoms <= 0) {
      throw new QuoteNotFoundError("that buys nothing at this price");
    }
  } else {
    const holding = await findHolding(db, userId, coin.symbol);
    if (!holding || holding.quantityAtoms < quantityAtoms) {
      throw new NotEnoughCoinError("not enough coin");
    }
    filledAtoms = quantityAtoms;
    grossCents = centsForAtoms(filledAtoms, priceMicros);
    feeCents = Math.round((grossCents * feeBasisPoints) / 10_000);
    // netCents is what arrives in the account: the value minus the fee.
    netCents = grossCents - feeCents;
    if (netCents <= 0) {
      throw new QuoteNotFoundError("that sells for nothing at this price");
    }
  }

  const id = crypto.randomUUID();
  const expiresAt = new Date(atMs + QUOTE_SECONDS * 1000).toISOString();
  await db.query(
    `INSERT INTO bank_trade_quotes
       (id, user_id, symbol, side, spend_cents, quantity_atoms, price_micros,
        gross_cents, fee_cents, net_cents, filled_atoms, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [
      id,
      userId,
      coin.symbol,
      side,
      side === "buy" ? spendCents : null,
      side === "sell" ? quantityAtoms : null,
      priceMicros,
      grossCents,
      feeCents,
      netCents,
      filledAtoms,
      expiresAt,
    ],
  );

  return {
    id,
    symbol: coin.symbol,
    name: coin.name,
    side,
    priceMicros,
    grossCents,
    feeCents,
    feeBasisPoints,
    // INTENTIONAL DEFECT (bankFeeHidden, REPORT): the total shown leaves the
    // fee out, so the customer is told one number and charged (or paid)
    // another. The row in the database keeps the real one, which is what makes
    // the receipt disagree with the quote.
    netCents: flags.bankFeeHidden ? grossCents : netCents,
    filledAtoms,
    expiresAt,
    expiresInSeconds: QUOTE_SECONDS,
  };
}

function toQuote(row) {
  return {
    id: row.id,
    symbol: row.symbol,
    side: row.side,
    priceMicros: cents(row.price_micros),
    grossCents: cents(row.gross_cents),
    feeCents: cents(row.fee_cents),
    netCents: cents(row.net_cents),
    filledAtoms: cents(row.filled_atoms),
    expiresAt: row.expires_at,
    usedAt: row.used_at,
  };
}

// Act on a quote: money moves, coin moves, and both are written in one
// database transaction, so a half-done trade cannot exist.
async function fillQuote(
  db,
  userId,
  { quoteId, accountId },
  flags = {},
  atMs = Date.now(),
) {
  if (!UUID.test(String(quoteId || ""))) {
    throw new QuoteNotFoundError("no such quote");
  }

  return db.transaction(async (tx) => {
    // The quote is CLAIMED, not read and then checked. Reading used_at, acting
    // on it and writing it back later is check-then-act: under Postgres's
    // default READ COMMITTED, two fills of the same quote both see it unused
    // and both go through. One statement that matches only a quote still
    // unused closes that, and the row it returns is the one this call owns.
    const claimed = await tx.query(
      `UPDATE bank_trade_quotes SET used_at = now()
        WHERE id = $1 AND user_id = $2 AND used_at IS NULL
        RETURNING *`,
      [quoteId, userId],
    );
    if (!claimed.rows.length) {
      // Either there is no such quote, or somebody already claimed it. Tell
      // the two apart for a readable error; the claim above already decided.
      const exists = await tx.query(
        "SELECT 1 FROM bank_trade_quotes WHERE id = $1 AND user_id = $2",
        [quoteId, userId],
      );
      throw exists.rows.length
        ? new QuoteUsedError("that quote was already used")
        : new QuoteNotFoundError("no such quote");
    }
    const quote = toQuote(claimed.rows[0]);
    // INTENTIONAL DEFECT (bankQuoteExpired, REPORT): the expiry is not
    // checked, so a quote taken minutes ago still fills at its old price. With
    // a market that moves every second, that is money made or lost for free.
    if (!flags.bankQuoteExpired && new Date(quote.expiresAt).getTime() < atMs) {
      throw new QuoteExpiredError("that price has expired");
    }

    const account = await tx.query(
      "SELECT * FROM bank_money_accounts WHERE id = $1 AND user_id = $2",
      [accountId, userId],
    );
    if (!account.rows.length) {
      throw new QuoteNotFoundError("no such account");
    }

    const held = await tx.query(
      "SELECT * FROM bank_holdings WHERE user_id = $1 AND symbol = $2",
      [userId, quote.symbol],
    );
    const holding = held.rows[0] ? toHolding(held.rows[0]) : null;

    let balanceAfter;
    let costOutCents = 0;

    if (quote.side === "buy") {
      // Checked and written in one statement, so two buys sent together cannot
      // both pass on the same balance.
      const moved = await tx.query(
        `UPDATE bank_money_accounts
            SET balance_cents = balance_cents - $2
          WHERE id = $1 AND balance_cents >= $2
          RETURNING balance_cents`,
        [accountId, quote.netCents],
      );
      if (!moved.rows.length) {
        throw new NotEnoughCoinError("not enough money");
      }
      balanceAfter = cents(moved.rows[0].balance_cents);

      // The coin bought, and what it cost, go onto the running basis. The fee
      // is part of the cost: it is money spent to hold this coin.
      if (holding) {
        await tx.query(
          `UPDATE bank_holdings
              SET quantity_atoms = quantity_atoms + $3,
                  cost_cents = cost_cents + $4,
                  updated_at = now()
            WHERE user_id = $1 AND symbol = $2`,
          [userId, quote.symbol, quote.filledAtoms, quote.netCents],
        );
      } else {
        await tx.query(
          `INSERT INTO bank_holdings
             (id, user_id, symbol, quantity_atoms, cost_cents)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            crypto.randomUUID(),
            userId,
            quote.symbol,
            quote.filledAtoms,
            quote.netCents,
          ],
        );
      }
    } else {
      if (!holding || holding.quantityAtoms < quote.filledAtoms) {
        throw new NotEnoughCoinError("not enough coin");
      }
      // The same share of the cost leaves with the coin, so the average price
      // paid on what is left never drifts.
      costOutCents = Math.round(
        (holding.costCents * quote.filledAtoms) / holding.quantityAtoms,
      );
      await tx.query(
        `UPDATE bank_holdings
            SET quantity_atoms = quantity_atoms - $3,
                cost_cents = cost_cents - $4,
                updated_at = now()
          WHERE user_id = $1 AND symbol = $2`,
        [userId, quote.symbol, quote.filledAtoms, costOutCents],
      );
      const moved = await tx.query(
        `UPDATE bank_money_accounts
            SET balance_cents = balance_cents + $2
          WHERE id = $1 RETURNING balance_cents`,
        [accountId, quote.netCents],
      );
      balanceAfter = cents(moved.rows[0].balance_cents);
    }

    const buying = quote.side === "buy";
    const description = `${buying ? "Bought" : "Sold"} ${quote.symbol}`;
    const transactionId = await insertTransaction(tx, {
      accountId,
      kind: buying ? "crypto_buy" : "crypto_sell",
      amountCents: buying ? -quote.netCents : quote.netCents,
      balanceAfterCents: balanceAfter,
      description,
      counterparty: quote.symbol,
    });

    const tradeId = crypto.randomUUID();
    await tx.query(
      `INSERT INTO bank_trades
         (id, user_id, symbol, account_id, side, quantity_atoms, price_micros,
          gross_cents, fee_cents, net_cents, cost_cents, quote_id,
          transaction_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        tradeId,
        userId,
        quote.symbol,
        accountId,
        quote.side,
        quote.filledAtoms,
        quote.priceMicros,
        quote.grossCents,
        quote.feeCents,
        quote.netCents,
        costOutCents,
        quote.id,
        transactionId,
      ],
    );

    await notify(tx, {
      userId,
      kind: "money_received",
      title: `${buying ? "Bought" : "Sold"} ${formatAtoms(quote.filledAtoms)} ${quote.symbol}`,
      body: buying
        ? `Paid from ${account.rows[0].number}.`
        : `Paid into ${account.rows[0].number}.`,
      link: "/app/portfolio",
      amountCents: buying ? -quote.netCents : quote.netCents,
    });

    return {
      trade: {
        id: tradeId,
        symbol: quote.symbol,
        side: quote.side,
        quantityAtoms: quote.filledAtoms,
        quantity: formatAtoms(quote.filledAtoms),
        accountNumber: account.rows[0].number,
        priceMicros: quote.priceMicros,
        grossCents: quote.grossCents,
        feeCents: quote.feeCents,
        netCents: quote.netCents,
        // What this sale made or lost against what the coin had cost. Zero on
        // a buy: nothing is realised until it is sold.
        realisedCents: buying ? 0 : quote.netCents - costOutCents,
        createdAt: new Date().toISOString(),
      },
      balanceAfterCents: balanceAfter,
    };
  });
}

// Coin quantities for a person to read: trailing zeros trimmed, never in
// exponent form, and never through a float.
function formatAtoms(atoms) {
  const whole = Math.trunc(atoms / ATOMS_PER_COIN);
  const part = String(Math.abs(atoms) % ATOMS_PER_COIN).padStart(8, "0");
  const trimmed = part.replace(/0+$/, "");
  return trimmed ? `${whole}.${trimmed}` : String(whole);
}

// Everything the customer holds, what it is worth right now on their own
// prices, and what that is against what they paid.
async function portfolio(db, userId, userKey, atMs = Date.now(), flags = {}) {
  const [held, pressures] = await Promise.all([
    listHoldings(db, userId),
    pressureFor(db, userId),
  ]);

  // The "0.1 + 0.2 reads as 0.30000000000000004" bug is NOT here. Summing
  // whole atoms and dividing once is exact, so a float version of this sum
  // only goes wrong for some holdings and looks correct for others -- a bug
  // that fires sometimes makes a flaky test, which is worse than no bug. It
  // belongs where a customer types a decimal amount, which is the send and
  // swap screens in phase 3c.
  const positions = [];
  for (const holding of held) {
    const coin = await coins.findCoin(db, holding.symbol);
    const priceMicros = market.priceMicrosAt(
      userKey,
      coin,
      atMs,
      pressures[coin.symbol] || 0,
    );
    const valueCents = centsForAtoms(holding.quantityAtoms, priceMicros);
    const unrealised = valueCents - holding.costCents;

    positions.push({
      symbol: holding.symbol,
      name: coin.name,
      quantityAtoms: holding.quantityAtoms,
      quantity: formatAtoms(holding.quantityAtoms),
      costCents: holding.costCents,
      priceMicros,
      // The average price paid, in the same unit as the live price, so the two
      // can be shown side by side.
      averagePriceMicros:
        holding.quantityAtoms > 0
          ? Math.round(
              (holding.costCents / holding.quantityAtoms) * ATOMS_SCALE,
            )
          : 0,
      valueCents,
      // INTENTIONAL DEFECT (bankProfitSign, REPORT): the sign is flipped, so a
      // gain reads as a loss and a loss as a gain. Everything else about the
      // number is right, which is what makes it easy to miss.
      unrealisedCents: flags.bankProfitSign ? -unrealised : unrealised,
      unrealisedBasisPoints:
        holding.costCents > 0
          ? Math.round((unrealised / holding.costCents) * 10_000)
          : 0,
    });
  }

  const realised = await db.query(
    `SELECT COALESCE(SUM(net_cents - cost_cents), 0) AS total
       FROM bank_trades WHERE user_id = $1 AND side = 'sell'`,
    [userId],
  );

  const valueCents = positions.reduce((sum, row) => sum + row.valueCents, 0);
  const costCents = positions.reduce((sum, row) => sum + row.costCents, 0);

  return {
    positions,
    valueCents,
    costCents,
    unrealisedCents: flags.bankProfitSign
      ? -(valueCents - costCents)
      : valueCents - costCents,
    realisedCents: cents(realised.rows[0].total),
    at: new Date(atMs).toISOString(),
  };
}

async function listTrades(db, userId, limit = 50) {
  const { rows } = await db.query(
    `SELECT t.*, a.number AS account_number
       FROM bank_trades t
       JOIN bank_money_accounts a ON a.id = t.account_id
      WHERE t.user_id = $1
      ORDER BY t.created_at DESC, t.id DESC
      LIMIT $2`,
    [userId, limit],
  );
  return rows.map((row) => ({
    id: row.id,
    symbol: row.symbol,
    side: row.side,
    accountNumber: row.account_number,
    quantityAtoms: cents(row.quantity_atoms),
    quantity: formatAtoms(cents(row.quantity_atoms)),
    priceMicros: cents(row.price_micros),
    grossCents: cents(row.gross_cents),
    feeCents: cents(row.fee_cents),
    netCents: cents(row.net_cents),
    realisedCents:
      row.side === "sell" ? cents(row.net_cents) - cents(row.cost_cents) : 0,
    createdAt: new Date(row.created_at).toISOString(),
  }));
}

module.exports = {
  ATOMS_PER_COIN,
  ATOMS_SCALE,
  MAX_SPEND_CENTS,
  MIN_SPEND_CENTS,
  NotEnoughCoinError,
  QUOTE_SECONDS,
  QuoteExpiredError,
  QuoteNotFoundError,
  QuoteUsedError,
  atomsForCents,
  centsForAtoms,
  feeBasisPointsFor,
  fillQuote,
  formatAtoms,
  listHoldings,
  listTrades,
  marketFor,
  portfolio,
  pressureFor,
  quoteTrade,
};
