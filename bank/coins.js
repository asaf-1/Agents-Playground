// The coins, and what one customer's market looks like right now.
//
// The catalogue comes from the database; every price comes from market.js and
// belongs to the customer asking. `userKey` is what makes a market personal:
// the signed-in customer's id, or the run key for a visitor who has not signed
// in, so even a stranger gets a live market of their own rather than a shared
// one.
const market = require("./market");

const DAY_MS = 86_400_000;

// Ranges the coin page offers, and how many points each chart draws.
const RANGES = {
  "1h": { spanMs: 3_600_000, points: 60 },
  "24h": { spanMs: DAY_MS, points: 72 },
  "7d": { spanMs: 7 * DAY_MS, points: 84 },
  "30d": { spanMs: 30 * DAY_MS, points: 90 },
};

class UnknownCoinError extends Error {}

// pg hands bigint and numeric back as strings; every number must come through
// here before it leaves this module.
function toCoin(row) {
  return {
    symbol: row.symbol,
    name: row.name,
    anchorMicros: Number(row.anchor_micros),
    volatility: Number(row.volatility),
    drift: Number(row.drift),
    depthAtoms: Number(row.depth_atoms),
    rank: Number(row.rank),
  };
}

async function listCoins(db) {
  const { rows } = await db.query(
    "SELECT * FROM bank_coins ORDER BY rank, symbol",
  );
  return rows.map(toCoin);
}

async function findCoin(db, symbol) {
  const { rows } = await db.query(
    "SELECT * FROM bank_coins WHERE upper(symbol) = upper($1)",
    [String(symbol || "").trim()],
  );
  if (!rows.length) {
    throw new UnknownCoinError("no such coin");
  }
  return toCoin(rows[0]);
}

// One coin as the markets list shows it: the customer's price now, how it moved
// over a day, and a small series for the row's sparkline.
function quoteFor(userKey, coin, atMs, pressure = 0) {
  const moved = market.changeSince(userKey, coin, atMs, DAY_MS, pressure);
  return {
    symbol: coin.symbol,
    name: coin.name,
    priceMicros: moved.priceMicros,
    changeMicros: moved.changeMicros,
    changeBasisPoints: moved.changeBasisPoints,
    at: new Date(atMs).toISOString(),
  };
}

// The whole markets page for one customer at one instant.
async function marketList(db, userKey, atMs, { pressures = {} } = {}) {
  const coins = await listCoins(db);
  return coins.map((coin) => ({
    ...quoteFor(userKey, coin, atMs, pressures[coin.symbol] || 0),
    spark: market
      .seriesFor(userKey, coin, atMs, DAY_MS, 24, pressures[coin.symbol] || 0)
      .map((point) => point.priceMicros),
  }));
}

// One coin's page: the quote, the chart for the chosen range, and the high and
// low of that range so the page can label the axis without a second request.
async function coinDetail(
  db,
  userKey,
  symbol,
  atMs,
  range = "24h",
  pressure = 0,
) {
  const coin = await findCoin(db, symbol);
  const window = RANGES[range] || RANGES["24h"];
  const series = market.seriesFor(
    userKey,
    coin,
    atMs,
    window.spanMs,
    window.points,
    pressure,
  );
  const prices = series.map((point) => point.priceMicros);
  const moved = market.changeSince(
    userKey,
    coin,
    atMs,
    window.spanMs,
    pressure,
  );

  return {
    ...quoteFor(userKey, coin, atMs, pressure),
    range,
    rangeChangeMicros: moved.changeMicros,
    rangeChangeBasisPoints: moved.changeBasisPoints,
    highMicros: Math.max(...prices),
    lowMicros: Math.min(...prices),
    series,
  };
}

module.exports = {
  DAY_MS,
  RANGES,
  UnknownCoinError,
  coinDetail,
  findCoin,
  listCoins,
  marketList,
  quoteFor,
};
