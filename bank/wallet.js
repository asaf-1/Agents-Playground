// Wallets: sending coin to another customer, and swapping one coin for
// another (phase 3c).
//
// Neither touches a bank account. A send moves coin from one customer's
// holding to another's; a swap turns one holding into another at the
// customer's own two prices. Money only comes into it as the unit the swap
// fee is measured in.
//
// An address carries a checksum, so a typo can be caught rather than quietly
// sending coin nowhere. That check is the point of this phase.
const crypto = require("crypto");
const coins = require("./coins");
const market = require("./market");
const { cents } = require("./money");
const { notify } = require("./notify");
const trading = require("./trading");

const ATOMS_PER_COIN = market.ATOMS_PER_COIN;

// Crockford's base32: no I, L, O or U, so a written-down address can't turn a
// 1 into an l or a 0 into an O.
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const PREFIX = "pbx1";
const BODY_LENGTH = 10;
const CHECKSUM_LENGTH = 3;

// Roughly what a network fee is worth, in money. The fee itself is charged in
// coin, so the amount of coin changes with the price: a fee on BTC is a tiny
// fraction of a coin, the same fee on a cheap coin is a lot of them.
const SEND_FEE_CENTS = 40;

class BadAmountError extends Error {}
class UnknownAddressError extends Error {}
class BadAddressError extends Error {}
class OwnAddressError extends Error {}
class NotEnoughCoinError extends Error {}
class SameCoinError extends Error {}

// A typed coin amount -> whole atoms.
//
// The correct way reads the digits as text: "0.29" is 29000000 atoms, exactly,
// because the string is split and padded rather than multiplied.
//
// INTENTIONAL DEFECT (bankCryptoFloat, REPORT): the armed path does what looks
// obvious and multiplies the parsed float by 100,000,000. Binary floating point
// cannot hold most decimals exactly, so 0.29 becomes 28999999.999999996 and
// truncates to 28999999 -- the customer is sent one atom less than they typed.
// It is the same family of error as 0.1 + 0.2 coming out as 0.30000000000000004.
function parseQuantity(input, flags = {}) {
  const value = String(input ?? "").trim();
  if (!/^\d*(\.\d{1,8})?$/.test(value) || value === "" || value === ".") {
    throw new BadAmountError("enter an amount, up to eight decimal places");
  }
  if (flags.bankCryptoFloat) {
    return Math.trunc(parseFloat(value) * ATOMS_PER_COIN);
  }
  const [whole, fraction = ""] = value.split(".");
  return (
    Number(whole || "0") * ATOMS_PER_COIN + Number(fraction.padEnd(8, "0"))
  );
}

function encode(value, length) {
  let out = "";
  let left = value;
  for (let i = 0; i < length; i += 1) {
    out = ALPHABET[left % ALPHABET.length] + out;
    left = Math.floor(left / ALPHABET.length);
  }
  return out;
}

// The checksum covers the symbol and the body, so changing either breaks it.
function checksumFor(symbol, body) {
  const digest = crypto
    .createHash("sha256")
    .update(`${symbol.toUpperCase()}:${body}`)
    .digest();
  const value = (digest[0] << 16) | (digest[1] << 8) | digest[2];
  return encode(
    value % Math.pow(ALPHABET.length, CHECKSUM_LENGTH),
    CHECKSUM_LENGTH,
  );
}

// An address is the prefix, the coin, a body drawn from the owner, and the
// checksum: pbx1btc7K2M9QX4RT8ZV.
function addressFor(userId, symbol) {
  const digest = crypto
    .createHash("sha256")
    .update(`wallet:${userId}:${symbol.toUpperCase()}`)
    .digest();
  let body = "";
  for (let i = 0; i < BODY_LENGTH; i += 1) {
    body += ALPHABET[digest[i] % ALPHABET.length];
  }
  return `${PREFIX}${symbol.toLowerCase()}${body}${checksumFor(symbol, body)}`;
}

// Pull an address apart and prove it has not been mistyped. Returns the coin
// and the body, or throws.
function parseAddress(address) {
  const value = String(address || "").trim();
  if (!value.startsWith(PREFIX)) {
    throw new BadAddressError("that doesn't look like an address");
  }
  const rest = value.slice(PREFIX.length);
  // The symbol is whatever sits before the fixed-length tail.
  const tail = BODY_LENGTH + CHECKSUM_LENGTH;
  if (rest.length <= tail) {
    throw new BadAddressError("that address is too short");
  }
  const symbol = rest.slice(0, rest.length - tail).toUpperCase();
  const body = rest.slice(rest.length - tail, rest.length - CHECKSUM_LENGTH);
  const checksum = rest.slice(rest.length - CHECKSUM_LENGTH);

  if (!/^[A-Z]+$/.test(symbol) || !new RegExp(`^[${ALPHABET}]+$`).test(body)) {
    throw new BadAddressError(
      "that address has characters that can't be in one",
    );
  }
  if (checksumFor(symbol, body) !== checksum.toUpperCase()) {
    throw new BadAddressError(
      "that address didn't check out; a character is wrong",
    );
  }
  return { symbol, body };
}

// Every customer has one address per coin, made the first time it is asked
// for. Safe to call repeatedly.
async function ensureWallet(db, userId, symbol) {
  const coin = await coins.findCoin(db, symbol);
  const existing = await db.query(
    "SELECT * FROM bank_wallets WHERE user_id = $1 AND symbol = $2",
    [userId, coin.symbol],
  );
  if (existing.rows.length) {
    return existing.rows[0].address;
  }
  const address = addressFor(userId, coin.symbol);
  await db.query(
    "INSERT INTO bank_wallets (id, user_id, symbol, address) VALUES ($1, $2, $3, $4)",
    [crypto.randomUUID(), userId, coin.symbol, address],
  );
  return address;
}

async function listWallets(db, userId) {
  const all = await coins.listCoins(db);
  const wallets = [];
  for (const coin of all) {
    wallets.push({
      symbol: coin.symbol,
      name: coin.name,
      address: await ensureWallet(db, userId, coin.symbol),
    });
  }
  return wallets;
}

async function findOwner(db, address) {
  const { rows } = await db.query(
    "SELECT user_id, symbol FROM bank_wallets WHERE address = $1",
    [address],
  );
  return rows[0] || null;
}

// The network fee for one coin, in atoms: whatever SEND_FEE_CENTS buys of it
// at the sender's own price, and never less than one atom.
function feeAtomsFor(priceMicros) {
  return Math.max(1, trading.atomsForCents(SEND_FEE_CENTS, priceMicros));
}

// What a send would cost, before anybody commits to it.
async function previewSend(
  db,
  userId,
  userKey,
  { symbol, quantityAtoms },
  atMs = Date.now(),
) {
  const coin = await coins.findCoin(db, symbol);
  const pressures = await trading.pressureFor(db, userId);
  const priceMicros = market.priceMicrosAt(
    userKey,
    coin,
    atMs,
    pressures[coin.symbol] || 0,
  );
  const feeAtoms = feeAtomsFor(priceMicros);
  return {
    symbol: coin.symbol,
    priceMicros,
    quantityAtoms,
    feeAtoms,
    totalAtoms: quantityAtoms + feeAtoms,
    feeCents: trading.centsForAtoms(feeAtoms, priceMicros),
  };
}

// Send coin to another customer's address.
//
// The sender pays the amount plus a network fee; the recipient receives the
// amount. The fee is burned, the way a real network fee goes to miners rather
// than to the other side.
async function send(
  db,
  userId,
  userKey,
  { symbol, toAddress, quantityAtoms, memo = "" },
  flags = {},
  atMs = Date.now(),
) {
  const coin = await coins.findCoin(db, symbol);

  // INTENTIONAL DEFECT (bankBadAddress, REPORT): the address is not checked,
  // so a mistyped one is accepted. The coin leaves the sender and reaches
  // nobody, because no wallet owns that address: practice money, really gone.
  let parsed = null;
  if (!flags.bankBadAddress) {
    parsed = parseAddress(toAddress);
    if (parsed.symbol !== coin.symbol) {
      throw new BadAddressError(
        `that's a ${parsed.symbol} address, not a ${coin.symbol} one`,
      );
    }
  }

  const owner = await findOwner(db, String(toAddress || "").trim());
  if (owner && owner.user_id === userId) {
    throw new OwnAddressError("that's your own address");
  }
  if (!owner && !flags.bankBadAddress) {
    throw new UnknownAddressError("nobody holds that address");
  }

  const pressures = await trading.pressureFor(db, userId);
  const priceMicros = market.priceMicrosAt(
    userKey,
    coin,
    atMs,
    pressures[coin.symbol] || 0,
  );
  const feeAtoms = feeAtomsFor(priceMicros);
  const totalAtoms = quantityAtoms + feeAtoms;

  return db.transaction(async (tx) => {
    const held = await tx.query(
      "SELECT * FROM bank_holdings WHERE user_id = $1 AND symbol = $2",
      [userId, coin.symbol],
    );
    const holding = held.rows[0];
    if (!holding || cents(holding.quantity_atoms) < totalAtoms) {
      throw new NotEnoughCoinError("not enough coin");
    }

    // The cost of what leaves goes with it, so the average price paid on what
    // is left doesn't drift. The fee's cost leaves too: it is gone either way.
    const heldAtoms = cents(holding.quantity_atoms);
    const heldCost = cents(holding.cost_cents);
    const costOut = Math.round((heldCost * totalAtoms) / heldAtoms);

    await tx.query(
      `UPDATE bank_holdings
          SET quantity_atoms = quantity_atoms - $3,
              cost_cents = cost_cents - $4,
              updated_at = now()
        WHERE user_id = $1 AND symbol = $2`,
      [userId, coin.symbol, totalAtoms, costOut],
    );

    // The recipient's cost basis is what the coin was worth when it landed:
    // they did not pay for it, but it has to be worth something to them.
    if (owner) {
      const landedCost = trading.centsForAtoms(quantityAtoms, priceMicros);
      const theirs = await tx.query(
        "SELECT * FROM bank_holdings WHERE user_id = $1 AND symbol = $2",
        [owner.user_id, coin.symbol],
      );
      if (theirs.rows.length) {
        await tx.query(
          `UPDATE bank_holdings
              SET quantity_atoms = quantity_atoms + $3,
                  cost_cents = cost_cents + $4,
                  updated_at = now()
            WHERE user_id = $1 AND symbol = $2`,
          [owner.user_id, coin.symbol, quantityAtoms, landedCost],
        );
      } else {
        await tx.query(
          `INSERT INTO bank_holdings (id, user_id, symbol, quantity_atoms, cost_cents)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            crypto.randomUUID(),
            owner.user_id,
            coin.symbol,
            quantityAtoms,
            landedCost,
          ],
        );
      }
      await notify(tx, {
        userId: owner.user_id,
        kind: "money_received",
        title: `Received ${trading.formatAtoms(quantityAtoms)} ${coin.symbol}`,
        body: memo || "Sent to your wallet.",
        link: "/app/wallet",
      });
    }

    const id = crypto.randomUUID();
    await tx.query(
      `INSERT INTO bank_wallet_sends
         (id, user_id, symbol, to_address, to_user_id, quantity_atoms, fee_atoms, memo)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        id,
        userId,
        coin.symbol,
        String(toAddress || "").trim(),
        owner ? owner.user_id : null,
        quantityAtoms,
        feeAtoms,
        memo,
      ],
    );

    return {
      id,
      symbol: coin.symbol,
      toAddress: String(toAddress || "").trim(),
      quantityAtoms,
      quantity: trading.formatAtoms(quantityAtoms),
      feeAtoms,
      totalAtoms,
      // Null when the address belongs to nobody, which only the planted bug
      // allows. A correct test should notice this.
      delivered: Boolean(owner),
      createdAt: new Date().toISOString(),
    };
  });
}

// Swap one coin straight into another, at the customer's own two prices.
async function swap(
  db,
  userId,
  userKey,
  { fromSymbol, toSymbol, quantityAtoms },
  atMs = Date.now(),
) {
  if (String(fromSymbol).toUpperCase() === String(toSymbol).toUpperCase()) {
    throw new SameCoinError("pick two different coins");
  }
  const from = await coins.findCoin(db, fromSymbol);
  const to = await coins.findCoin(db, toSymbol);
  const pressures = await trading.pressureFor(db, userId);

  const fromPrice = market.priceMicrosAt(
    userKey,
    from,
    atMs,
    pressures[from.symbol] || 0,
  );
  const toPrice = market.priceMicrosAt(
    userKey,
    to,
    atMs,
    pressures[to.symbol] || 0,
  );

  const valueCents = trading.centsForAtoms(quantityAtoms, fromPrice);
  const feeBasisPoints = await trading.feeBasisPointsFor(db, userId);
  const feeCents = Math.round((valueCents * feeBasisPoints) / 10_000);
  const toAtoms = trading.atomsForCents(valueCents - feeCents, toPrice);
  if (toAtoms <= 0) {
    throw new NotEnoughCoinError("that swaps into nothing");
  }

  return db.transaction(async (tx) => {
    const held = await tx.query(
      "SELECT * FROM bank_holdings WHERE user_id = $1 AND symbol = $2",
      [userId, from.symbol],
    );
    const holding = held.rows[0];
    if (!holding || cents(holding.quantity_atoms) < quantityAtoms) {
      throw new NotEnoughCoinError("not enough coin");
    }

    const heldAtoms = cents(holding.quantity_atoms);
    const heldCost = cents(holding.cost_cents);
    const costOut = Math.round((heldCost * quantityAtoms) / heldAtoms);

    await tx.query(
      `UPDATE bank_holdings
          SET quantity_atoms = quantity_atoms - $3,
              cost_cents = cost_cents - $4,
              updated_at = now()
        WHERE user_id = $1 AND symbol = $2`,
      [userId, from.symbol, quantityAtoms, costOut],
    );

    // The cost follows the customer across: they have not spent new money, so
    // what the new coin "cost" them is what the old one had cost.
    const landedCost = costOut;
    const target = await tx.query(
      "SELECT * FROM bank_holdings WHERE user_id = $1 AND symbol = $2",
      [userId, to.symbol],
    );
    if (target.rows.length) {
      await tx.query(
        `UPDATE bank_holdings
            SET quantity_atoms = quantity_atoms + $3,
                cost_cents = cost_cents + $4,
                updated_at = now()
          WHERE user_id = $1 AND symbol = $2`,
        [userId, to.symbol, toAtoms, landedCost],
      );
    } else {
      await tx.query(
        `INSERT INTO bank_holdings (id, user_id, symbol, quantity_atoms, cost_cents)
         VALUES ($1, $2, $3, $4, $5)`,
        [crypto.randomUUID(), userId, to.symbol, toAtoms, landedCost],
      );
    }

    const id = crypto.randomUUID();
    await tx.query(
      `INSERT INTO bank_swaps
         (id, user_id, from_symbol, to_symbol, from_atoms, to_atoms,
          from_price_micros, to_price_micros, value_cents, fee_cents, cost_cents)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        id,
        userId,
        from.symbol,
        to.symbol,
        quantityAtoms,
        toAtoms,
        fromPrice,
        toPrice,
        valueCents,
        feeCents,
        costOut,
      ],
    );

    return {
      id,
      fromSymbol: from.symbol,
      toSymbol: to.symbol,
      fromAtoms: quantityAtoms,
      fromQuantity: trading.formatAtoms(quantityAtoms),
      toAtoms,
      toQuantity: trading.formatAtoms(toAtoms),
      fromPriceMicros: fromPrice,
      toPriceMicros: toPrice,
      valueCents,
      feeCents,
      feeBasisPoints,
      createdAt: new Date().toISOString(),
    };
  });
}

// What a swap would give, before committing to it.
async function previewSwap(
  db,
  userId,
  userKey,
  { fromSymbol, toSymbol, quantityAtoms },
  atMs = Date.now(),
) {
  if (String(fromSymbol).toUpperCase() === String(toSymbol).toUpperCase()) {
    throw new SameCoinError("pick two different coins");
  }
  const from = await coins.findCoin(db, fromSymbol);
  const to = await coins.findCoin(db, toSymbol);
  const pressures = await trading.pressureFor(db, userId);
  const fromPrice = market.priceMicrosAt(
    userKey,
    from,
    atMs,
    pressures[from.symbol] || 0,
  );
  const toPrice = market.priceMicrosAt(
    userKey,
    to,
    atMs,
    pressures[to.symbol] || 0,
  );
  const valueCents = trading.centsForAtoms(quantityAtoms, fromPrice);
  const feeBasisPoints = await trading.feeBasisPointsFor(db, userId);
  const feeCents = Math.round((valueCents * feeBasisPoints) / 10_000);

  return {
    fromSymbol: from.symbol,
    toSymbol: to.symbol,
    fromAtoms: quantityAtoms,
    toAtoms: trading.atomsForCents(valueCents - feeCents, toPrice),
    fromPriceMicros: fromPrice,
    toPriceMicros: toPrice,
    valueCents,
    feeCents,
    feeBasisPoints,
  };
}

async function listSends(db, userId, limit = 50) {
  const { rows } = await db.query(
    `SELECT * FROM bank_wallet_sends
      WHERE user_id = $1 OR to_user_id = $1
      ORDER BY created_at DESC, id DESC
      LIMIT $2`,
    [userId, limit],
  );
  return rows.map((row) => ({
    id: row.id,
    symbol: row.symbol,
    direction: row.user_id === userId ? "out" : "in",
    toAddress: row.to_address,
    quantityAtoms: cents(row.quantity_atoms),
    quantity: trading.formatAtoms(cents(row.quantity_atoms)),
    feeAtoms: cents(row.fee_atoms),
    memo: row.memo,
    delivered: row.to_user_id !== null,
    createdAt: new Date(row.created_at).toISOString(),
  }));
}

async function listSwaps(db, userId, limit = 50) {
  const { rows } = await db.query(
    `SELECT * FROM bank_swaps WHERE user_id = $1
      ORDER BY created_at DESC, id DESC LIMIT $2`,
    [userId, limit],
  );
  return rows.map((row) => ({
    id: row.id,
    fromSymbol: row.from_symbol,
    toSymbol: row.to_symbol,
    fromAtoms: cents(row.from_atoms),
    fromQuantity: trading.formatAtoms(cents(row.from_atoms)),
    toAtoms: cents(row.to_atoms),
    toQuantity: trading.formatAtoms(cents(row.to_atoms)),
    valueCents: cents(row.value_cents),
    feeCents: cents(row.fee_cents),
    createdAt: new Date(row.created_at).toISOString(),
  }));
}

module.exports = {
  ALPHABET,
  BadAddressError,
  BadAmountError,
  NotEnoughCoinError,
  OwnAddressError,
  PREFIX,
  SEND_FEE_CENTS,
  SameCoinError,
  UnknownAddressError,
  addressFor,
  ensureWallet,
  feeAtomsFor,
  listSends,
  listSwaps,
  listWallets,
  parseAddress,
  parseQuantity,
  previewSend,
  previewSwap,
  send,
  swap,
};
