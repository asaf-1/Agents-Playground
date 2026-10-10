// Playground Bank's market. Every price here is made up, and it is made up
// *per customer*: two people looking at BTC at the same second see different
// numbers, each on its own path. Nothing is a stored price list.
//
// A price is a pure function of (customer, coin, instant). That gives three
// things at once:
//   - it moves on its own, because the instant keeps changing;
//   - it is different for everybody, because the customer is part of the seed;
//   - it can be replayed, because the same three inputs always return the same
//     number. A test pins the instant and gets a stable price; a browser does
//     not pin it and sees a live market.
// Past prices are computed the same way, so a chart needs no price history
// table: ask the function for the last 24 hours and it answers.
//
// Units: a price is in micro-dollars (1,000,000 micros = $1.00), so six
// decimal places -- cents are too coarse for a market, where a penny on a
// $0.39 coin is a 2.5% jump. A quantity of a coin is in 1e-8 units ("atoms").
// Both are integers, so adding 0.1 and 0.2 of a coin is exact, and only the
// display layer ever sees a decimal.

const ATOMS_PER_COIN = 100_000_000;
const MICROS_PER_DOLLAR = 1_000_000;
const MICROS_PER_CENT = 10_000;

// Cheap, stable string hash. Not security: it only has to spread the seed.
function hashSeed(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// A seeded generator, so a seed yields a fixed series of numbers in 0..1.
function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The waves that make a price wander. The periods are deliberately not
// multiples of each other, so the sum never settles into a visible loop: it
// looks like a market rather than a sine wave. Periods are in seconds, from
// about half a minute to about four months, so one function gives both the
// tick-by-tick jitter and the months-long trend under it.
//
// Every wave is bounded, and that is the point: an open-ended trend term
// (anything multiplied by "seconds since 1970") compounds into absurd numbers
// within a few runs. A long wave reads as a trend over any window a customer
// actually looks at, and can never run away.
const WAVE_PERIODS = [
  37, 149, 613, 2477, 9631, 38993, 157733, 637219, 2576941, 10412837,
];

// Everything that makes one customer's view of one coin its own: where their
// price starts, how hard it swings, which way it leans, and where each wave
// begins.
function profileFor(userKey, coin) {
  const random = seededRandom(hashSeed(`${userKey}:${coin.symbol}`));

  // The customer's own starting price, inside a band around the coin's anchor,
  // so nobody opens the page on the same number as anybody else.
  const anchorMicros = Math.round(coin.anchorMicros * (0.72 + random() * 0.56));

  // How much this customer's copy of the coin swings.
  const volatility = coin.volatility * (0.65 + random() * 0.7);

  // Where each wave is when the customer first looks. This is what decides
  // whether their coin is climbing or falling today: same coin, same second,
  // one person is up and another is down.
  const phases = WAVE_PERIODS.map(() => random() * Math.PI * 2);

  // Each wave gets its own weight, so some customers get a jumpy coin and
  // others a calm one. Longer waves carry more of the move, which is what
  // makes the shape read as a trend with noise on top rather than as static.
  // The two longest are the coin's slow trend, and `drift` says how strongly
  // this particular coin trends.
  const trendBoost = 1 + coin.drift * 20;
  const weights = WAVE_PERIODS.map((period, index) => {
    const base = (0.45 + random() * 0.55) * Math.sqrt(period / WAVE_PERIODS[0]);
    const long = index >= WAVE_PERIODS.length - 2 ? trendBoost : 1;
    // The fastest wave is damped: it is jitter, not a move worth reading.
    return base * long * (index === 0 ? 0.6 : 1);
  });
  const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);

  return { anchorMicros, volatility, phases, weights, weightTotal };
}

// The sum of the waves at one instant, normalised to roughly -1..1.
function wander(profile, seconds) {
  let total = 0;
  for (let i = 0; i < WAVE_PERIODS.length; i += 1) {
    total +=
      profile.weights[i] *
      Math.sin((seconds * 2 * Math.PI) / WAVE_PERIODS[i] + profile.phases[i]);
  }
  return total / profile.weightTotal;
}

// What the customer's own trading has done to the price. Buying pushes it up,
// selling pushes it down, and the push fades over the hours after the trade,
// the way a real market absorbs an order. `pressure` is net atoms bought minus
// sold, already weighted by age, and comes from the holdings module in 3b; it
// is 0 while nobody has traded, which is why 3a can ship without it.
function impactMultiplier(coin, pressure) {
  if (!pressure) {
    return 1;
  }
  // A trade worth the coin's whole depth moves it by about 12%; a tenth of the
  // depth by about 1.2%. tanh keeps a huge order from sending it to infinity.
  return 1 + 0.12 * Math.tanh(pressure / coin.depthAtoms);
}

// The price one customer sees for one coin at one instant, in whole micros.
function priceMicrosAt(userKey, coin, atMs, pressure = 0) {
  const profile = profileFor(userKey, coin);
  const move = profile.volatility * wander(profile, atMs / 1000);
  const micros =
    profile.anchorMicros * Math.exp(move) * impactMultiplier(coin, pressure);
  // A price never reaches zero, so the floor is the smallest unit there is.
  return Math.max(1, Math.round(micros));
}

// What a quantity of a coin is worth, rounded to whole cents, because money
// leaving or entering a bank account is always whole cents.
function valueCents(atoms, priceMicros) {
  return Math.round((atoms * priceMicros) / (ATOMS_PER_COIN * MICROS_PER_CENT));
}

// The same price a set time earlier, used for the 24-hour change and for a
// chart. Asking for the past costs nothing: it is the same function with a
// smaller instant.
function changeSince(userKey, coin, atMs, sinceMs, pressure = 0) {
  const now = priceMicrosAt(userKey, coin, atMs, pressure);
  const before = priceMicrosAt(userKey, coin, atMs - sinceMs, pressure);
  return {
    priceMicros: now,
    previousMicros: before,
    changeMicros: now - before,
    // Basis points, so the percentage stays an integer like every rate in the
    // bank: 250 is +2.50%.
    changeBasisPoints:
      before === 0 ? 0 : Math.round(((now - before) / before) * 10_000),
  };
}

// A price series for a chart: `points` evenly spaced samples ending at atMs.
function seriesFor(userKey, coin, atMs, spanMs, points = 48, pressure = 0) {
  const step = Math.max(1, Math.floor(spanMs / Math.max(1, points - 1)));
  const series = [];
  for (let i = points - 1; i >= 0; i -= 1) {
    const at = atMs - i * step;
    series.push({
      at: new Date(at).toISOString(),
      priceMicros: priceMicrosAt(userKey, coin, at, pressure),
    });
  }
  return series;
}

module.exports = {
  ATOMS_PER_COIN,
  MICROS_PER_CENT,
  MICROS_PER_DOLLAR,
  WAVE_PERIODS,
  changeSince,
  hashSeed,
  impactMultiplier,
  priceMicrosAt,
  profileFor,
  seededRandom,
  seriesFor,
  valueCents,
};
