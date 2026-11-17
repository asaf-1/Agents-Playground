// Playground Bank's two limits on costly requests (feedback-fixes plan, Part 2),
// built the way the test runner does it (test-runner/src/limiter.js and
// auth.js), but not imported from it: the runner stays a separate app.
//
//   1. Sign-ups per address: a burst, then one more every so many seconds. Off
//      unless BANK_SIGNUP_BURST is set, so local runs and the tests (about 345
//      sign-ups from one address) are not limited.
//   2. A gate on password hashing: scrypt is slow on purpose, so only a few run
//      at once, the rest wait in line, and past the line the answer is "busy,
//      try again" (503) instead of the server falling over.
//
// Every number comes from a setting, with these defaults when it is unset.

// A whole number above zero from a setting, or the fallback.
function positiveInt(value, fallback) {
  const n = Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

// --- The settings ---------------------------------------------------------------

// How many sign-ups one address may make at once; unset means no limit.
const SIGNUP_BURST = positiveInt(process.env.BANK_SIGNUP_BURST, null);
// After the burst, one more sign-up every this many seconds.
const SIGNUP_EVERY_SECONDS = positiveInt(
  process.env.BANK_SIGNUP_EVERY_SECONDS,
  60,
);
// Password hashes (and checks) at once. Node's crypto pool has four threads.
const HASH_CONCURRENCY = positiveInt(process.env.BANK_HASH_CONCURRENCY, 4);
// How many may wait for a free slot before the rest are told "busy".
const HASH_QUEUE = positiveInt(process.env.BANK_HASH_QUEUE, 100);

// The most addresses the sign-up limit remembers; full buckets are dropped first.
const MAX_ADDRESSES = 10_000;

// --- The hashing gate -----------------------------------------------------------

// Thrown when the line for the gate is full; the routes answer 503 with it.
class BusyError extends Error {}

// Runs at most `limit` jobs at once; up to `maxQueue` more wait in arrival
// order; past that, BusyError.
function createGate(limit, maxQueue) {
  let active = 0;
  const waiting = [];

  // A job finished: its slot goes straight to the next one waiting.
  function release() {
    active -= 1;
    const next = waiting.shift();
    if (next) {
      // Counted on handover, so the slot never belongs to nobody.
      active += 1;
      next();
    }
  }

  // Run the job when a slot is free, or wait, or refuse when the line is full.
  async function run(job) {
    if (active >= limit) {
      if (waiting.length >= maxQueue) {
        throw new BusyError(
          "The bank is busy checking other passwords. Try again in a few seconds.",
        );
      }
      await new Promise((resolve) => waiting.push(resolve));
    } else {
      active += 1;
    }
    try {
      return await job();
    } finally {
      release();
    }
  }

  return { run };
}

// One gate for every hash and every check: they cost the same, and it is the
// total that has to stay bounded.
const hashGate = createGate(HASH_CONCURRENCY, HASH_QUEUE);

// --- The sign-up limit ------------------------------------------------------------

// A bucket per address: it holds `burst` sign-ups and refills one every
// `everySeconds`. take() spends one, or says how many seconds until one is back.
function createBucketLimit({
  burst,
  everySeconds,
  maxEntries,
  now = Date.now,
}) {
  const buckets = new Map();
  const refillPerMs = 1 / (everySeconds * 1000);

  // How full one bucket is now.
  function level(entry, at) {
    return Math.min(burst, entry.tokens + (at - entry.at) * refillPerMs);
  }

  // Forget the addresses whose bucket has filled up again (they owe nothing),
  // oldest first, when too many are remembered.
  function prune(at) {
    for (const [key, entry] of buckets) {
      if (buckets.size < maxEntries) return;
      if (level(entry, at) >= burst) buckets.delete(key);
    }
    // Still too many: drop the oldest, so memory stays bounded.
    while (buckets.size >= maxEntries) {
      buckets.delete(buckets.keys().next().value);
    }
  }

  // 0 when this address may sign up now; otherwise the seconds to wait.
  function take(key) {
    const at = now();
    const entry = buckets.get(key) || { tokens: burst, at };
    const tokens = level(entry, at);
    if (tokens >= 1) {
      if (!buckets.has(key)) prune(at);
      buckets.set(key, { tokens: tokens - 1, at });
      return 0;
    }
    buckets.set(key, { tokens, at });
    return Math.max(1, Math.ceil((1 - tokens) / refillPerMs / 1000));
  }

  return { take };
}

// The sign-up limit, or null when BANK_SIGNUP_BURST is not set.
const signupLimit = SIGNUP_BURST
  ? createBucketLimit({
      burst: SIGNUP_BURST,
      everySeconds: SIGNUP_EVERY_SECONDS,
      maxEntries: MAX_ADDRESSES,
    })
  : null;

// What the sign-up page states: the limit, or null when there is none. Public
// on /api/bank/status, because a limit a visitor is held to is stated to them.
function describeLimits() {
  return {
    signup: SIGNUP_BURST
      ? { burst: SIGNUP_BURST, everySeconds: SIGNUP_EVERY_SECONDS }
      : null,
  };
}

// What bank/auth.js, the routes and bank/index.js use.
module.exports = {
  BusyError,
  createBucketLimit,
  createGate,
  describeLimits,
  hashGate,
  signupLimit,
};
