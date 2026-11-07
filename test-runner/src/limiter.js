// Rate limiting and concurrency limiting, with no dependencies.
//
// The two primitives here answer the same question from opposite ends: how much
// expensive work may an unauthenticated caller ask this single-threaded process
// to do? A token bucket bounds how often one caller may ask (createLimiter),
// and a semaphore bounds how many of those requests are served at once and how
// many are allowed to wait (createGate).
//
// Neither is sufficient alone, which is why both exist. The bucket is keyed on
// something the caller influences - a client address - so a caller with many
// addresses can spread across keys. The gate keeps no per-key state at all, so
// nothing a caller sends can spread across it: it is the backstop that holds
// even when the keying is defeated.
//
// Time comes from Date.now() and nothing here starts a timer. A limiter holding
// an interval open would keep the process alive after the server closed and
// every test would have to unref it; instead a bucket is refilled lazily on its
// next take() from elapsed wall-clock time.

// A caller cycling through keys only ever meets buckets that have refilled to
// capacity, so scanning a short window from the least-recently-used end finds
// one that is free to drop without walking the whole map on every insert.
const EVICTION_SCAN_LIMIT = 8;

// How many callers may wait for a slot, and what a refused one is told.
const DEFAULT_QUEUE_MAX = 64;
const DEFAULT_BUSY_MESSAGE =
  "The server is busy right now. Try again in a few seconds.";

// A key we were not given must not become a key that escapes the limiter, so
// every unusable key shares this one name. client-ip.js applies the same rule at
// the other end, for the same reason.
const UNKEYED = "(unkeyed)";

// A setting must be a positive, finite number.
function positiveNumber(value, name) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    // Thrown rather than clamped: these arrive as literals at module load, so a
    // bad one is a programming error that should surface at startup, not a
    // silently generous limit discovered during an attack.
    throw new TypeError(`${name} must be a positive, finite number.`);
  }

  return value;
}

// A token bucket per key: `capacity` requests may burst, then one more becomes
// available every 1/refillPerSecond seconds. Burst plus trickle is the right
// shape for a login form, where a person legitimately fumbles a few attempts in
// a row and an attacker wants thousands in a row.
function createLimiter(options) {
  // The settings: how many may burst, how fast tokens come back, and how many
  // keys to remember.
  const settings = options && typeof options === "object" ? options : {};
  const capacity = positiveNumber(settings.capacity, "capacity");
  const refillPerSecond = positiveNumber(
    settings.refillPerSecond,
    "refillPerSecond",
  );
  const maxEntries = Math.floor(
    positiveNumber(settings.maxEntries, "maxEntries"),
  );

  // A Map iterates in insertion order and every take() re-inserts its key, so
  // iteration starts at the least recently used entry. That is the whole LRU
  // implementation - no second data structure to keep in step.
  const buckets = new Map();

  // A usable key, or the shared one for anything else.
  function normalizeKey(key) {
    if (typeof key === "string" && key !== "") return key;
    if (typeof key === "number" && Number.isFinite(key)) return String(key);

    return UNKEYED;
  }

  // Top the bucket up for the time that passed since it was last used.
  function refill(bucket, now) {
    const elapsedMs = now - bucket.updatedAt;

    // A clock that stepped backwards must not hand out free tokens, so resync
    // the stamp and grant nothing. NTP corrections and VM suspends do this.
    if (elapsedMs <= 0) {
      bucket.updatedAt = now;
      return;
    }

    // Add the tokens earned, up to the capacity.
    bucket.tokens = Math.min(
      capacity,
      bucket.tokens + (elapsedMs / 1000) * refillPerSecond,
    );
    bucket.updatedAt = now;
  }

  // The key here is attacker-controlled, so the map has to be bounded or the
  // limiter becomes the memory-exhaustion vector it was added to prevent. Two
  // ways out, in order of preference:
  //
  //   1. Drop a key that has refilled to capacity. Such a bucket is
  //      indistinguishable from a key we have never seen, so forgetting it
  //      costs nothing whatsoever.
  //   2. Failing that, drop the least recently used key.
  //
  // (2) does let a caller who can cycle through maxEntries distinct keys clear
  // their own bucket. That is unavoidable in bounded memory, and it is exactly
  // why createGate() - which has no per-key state to cycle - is what bounds
  // total CPU rather than this.
  function evictOne(now) {
    // Remember the oldest key, then look at up to 8 of the oldest buckets.
    let lruKey = null;
    let scanned = 0;

    for (const [key, bucket] of buckets) {
      if (lruKey === null) lruKey = key;

      refill(bucket, now);

      // A full bucket is the same as a new one, so drop it and stop.
      if (bucket.tokens >= capacity) {
        buckets.delete(key);
        return;
      }

      scanned += 1;

      if (scanned >= EVICTION_SCAN_LIMIT) break;
    }

    // None was full: drop the oldest.
    if (lruKey !== null) buckets.delete(lruKey);
  }

  // Consumes one token for `key`. Returns whether the caller may proceed and,
  // when it may not, how long until it could - callers turn that into the wait
  // hint a person actually needs.
  function take(key) {
    // The key, and the time now.
    const id = normalizeKey(key);
    const now = Date.now();

    // Its bucket, moved to the newest end; a new key gets a full bucket, after
    // making room.
    let bucket = buckets.get(id);

    if (bucket) {
      // Deleted and re-inserted below, which is what moves it to the
      // most-recently-used end.
      buckets.delete(id);
      refill(bucket, now);
    } else {
      if (buckets.size >= maxEntries) evictOne(now);

      bucket = { tokens: capacity, updatedAt: now };
    }

    // Spend a token if there is one.
    const allowed = bucket.tokens >= 1;

    if (allowed) bucket.tokens -= 1;

    // Put the bucket back as the newest.
    buckets.set(id, bucket);

    // Allowed or not, what is left, and how long until the next token.
    return {
      allowed,
      // Floored, because a fractional token cannot be spent.
      remaining: Math.floor(bucket.tokens),
      retryAfterMs: allowed
        ? 0
        : Math.ceil(((1 - bucket.tokens) / refillPerSecond) * 1000),
    };
  }

  // For the paths that end in success: a colleague who signs in on the third
  // try should not carry the first two around for the next ten minutes.
  function reset(key) {
    buckets.delete(normalizeKey(key));
  }

  // Take a token, forget a key, and how many keys are held.
  return { take, reset, size: () => buckets.size };
}

// An async semaphore. run(fn) runs fn when a slot is free, queues it when one
// is not, and refuses outright once the queue is full. The refusal is the point:
// a queue that grows without bound converts a CPU limit into a memory limit and
// answers every request slowly instead of most of them promptly.
function createGate(maxConcurrent, options) {
  // The settings: how many run at once, how many may wait, and what a refused
  // caller is told.
  const settings = options && typeof options === "object" ? options : {};
  const limit = Math.floor(positiveNumber(maxConcurrent, "maxConcurrent"));
  const maxQueue = Math.floor(
    settings.maxQueue === undefined
      ? DEFAULT_QUEUE_MAX
      : positiveNumber(settings.maxQueue, "maxQueue"),
  );
  const busyMessage =
    typeof settings.busyMessage === "string" && settings.busyMessage
      ? settings.busyMessage
      : DEFAULT_BUSY_MESSAGE;

  // `active` counts admitted callers, including one that has been handed a slot
  // and has not resumed yet. `waiting` holds their resolve functions in arrival
  // order, so the queue is first-in-first-out and nobody starves behind a burst.
  let active = 0;
  const waiting = [];

  // A caller finished: hand its slot to the next one waiting, if any.
  function release() {
    active -= 1;

    const next = waiting.shift();

    if (next) {
      // The slot is counted here, on handover, so the resumed caller must not
      // count it again. Counting it there instead would leave a window in which
      // the slot belongs to nobody and a third caller could claim it as well.
      active += 1;
      next();
    }
  }

  // Run fn when a slot is free, wait in line if not, and refuse with a 503 when
  // the line is full.
  async function run(fn) {
    if (typeof fn !== "function") {
      throw new TypeError("createGate().run(fn) needs a function to run.");
    }

    if (active >= limit) {
      if (waiting.length >= maxQueue) {
        const error = new Error(busyMessage);

        // 503 rather than 429: nothing is wrong with this caller's rate, the
        // server simply has more expensive work in flight than it will hold.
        error.statusCode = 503;
        error.code = "GATE_BUSY";

        throw error;
      }

      // Wait for a slot.
      await new Promise((resolve) => waiting.push(resolve));
    } else {
      active += 1;
    }

    // Run it, and always give the slot back.
    try {
      return await fn();
    } finally {
      // In a finally so a throwing fn cannot leak the slot. One leaked slot is
      // a permanent reduction in capacity; enough of them wedge the process.
      release();
    }
  }

  // Run, plus a look at how busy the gate is.
  return {
    run,
    // Observability only. Nothing decides anything on this - it exists so a
    // diagnosis does not have to guess whether the queue was the problem.
    stats: () => ({
      active,
      queued: waiting.length,
      maxConcurrent: limit,
      maxQueue,
    }),
  };
}

// What the rest of the app uses.
module.exports = { createLimiter, createGate };
