// Accounts and sessions for the standalone test runner.
//
// This app is the only thing between a colleague's browser and a GitHub token
// that can start workflow runs. They are given no repository access, no
// pipeline access and no secret - just the ability to sign in here and launch a
// catalogued flow. That makes this file a real access boundary rather than the
// throwaway demo auth the parent repo ships for its own tests: passwords exist
// only as scrypt hashes, secrets are compared in constant time, and failed
// attempts are damped per account.
//
// Sessions live in a process-local Map. A restart signs everyone out, which is
// an acceptable trade for a single-process deployment and means there is no
// session store to secure or to leak. More than one process - or a rolling
// deploy - needs a shared store (Redis, or signed stateless tokens), because a
// request that lands on the other process will not find its session here.
//
// --- How the unauthenticated paths are throttled ---------------------------
//
// Everything in this file that an unauthenticated caller can reach - login,
// signup, the invite-code check - is expensive on purpose: a scrypt derivation
// costs ~100ms of CPU and 16MB, which is what prices offline cracking out of
// reach. That same cost is a weapon pointed back at the process, so three
// independent controls stand in front of it, and each one covers a hole the
// others leave open:
//
//   1. Per-IP token buckets (limiter.js). These stop one host from rotating
//      usernames to spray, and they are what makes guessing the invite code
//      hopeless rather than a matter of minutes.
//   2. Failed-attempt lockouts, in two tiers: one keyed on (username +
//      address), one on the username alone at a far higher threshold and
//      applied only after a password has been checked. Read the long note above
//      the constants before touching either - the shape of this control is the
//      difference between damping an attack and handing a stranger a remote off
//      switch for the administrator's account.
//   3. A concurrency gate around every derivation. Buckets are keyed on an
//      address the caller influences, so keying can be defeated; the gate has
//      no key at all. It bounds how much scrypt work exists at any instant and
//      sheds the rest with a 503, which is what keeps /api/health answering
//      while somebody hammers /api/login.
//
// The derivation itself is the async crypto.scrypt, never scryptSync. Node runs
// this JavaScript on one thread: a synchronous derivation stops the whole
// process - health checks, run dispatch, every other user's request - for its
// full duration, so a stream of anonymous login attempts with no valid
// credentials at all is enough to pin the process. The async form runs on the
// libuv threadpool and leaves the event loop free.

const crypto = require("node:crypto");
const { promisify } = require("node:util");

const { clientIp } = require("./client-ip.js");
const { config } = require("./config.js");
const { createGate, createLimiter } = require("./limiter.js");
const store = require("./store.js");

const SESSION_COOKIE = "tr_session";

// scrypt at these parameters costs roughly 100ms and 16MB per verification.
// That cost is the feature: it prices offline cracking of a leaked users.json
// out of practical reach, and a login pays it exactly once per attempt.
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 };
const SCRYPT_KEYLEN = 64;
const SALT_BYTES = 16;

const USERNAME_PATTERN = /^[A-Za-z0-9._-]{3,32}$/;
const PASSWORD_MIN = 10;
// scrypt is deliberately expensive, so an unbounded password field is a free
// way to burn server CPU. 200 characters is far past any real passphrase.
const PASSWORD_MAX = 200;

// --- Failed sign-in bookkeeping --------------------------------------------
//
// Two tiers, and the split between them is the whole of this control. Both are
// easy to "simplify" back into a defect, so the reasoning is here rather than
// scattered over the call site.
//
// TIER 1 - (username + client address). Eight failures, then fifteen minutes.
//
// Keyed on the address the failures came from as well as the account they were
// aimed at, so the only person a lockout can ever deny is the person producing
// the failures. Keyed on the username alone - which is what this used to be - it
// was a remote off switch for any account whose name you knew: eight wrong
// guesses from anywhere locked the real owner out for fifteen minutes, and
// because LOGIN_LIMIT hands one address eight fresh failures every ~16 seconds
// against a 900-second lockout, one stranger could hold it shut indefinitely
// from a loop. This app creates a single administrator by default and correctly
// refuses to demote or delete the last one, so there was no second admin to call
// adminResetPassword either: the only recovery was restarting the process.
//
// A lockout must never be something one party can inflict on another. That rule
// is what this key encodes.
//
// The residual cost is shared addresses: colleagues behind one office NAT share
// a tier-1 key, so somebody inside that office can spend their colleagues'
// budget. That is the same exposure every per-IP bucket in limiter.js already
// carries, it needs standing inside the network rather than a URL, and it ends
// after fifteen minutes.
//
// TIER 2 - (username), at a far higher threshold.
//
// Tier 1 cannot see an attacker spread across many addresses: every address gets
// its own eight. Tier 2 counts failures against one name from everywhere, which
// is the spray tier 1 misses.
//
// It is consulted only AFTER the password has been verified, and it refuses
// failed attempts alone. That ordering is not a micro-optimisation, it is the
// only thing keeping tier 2 from becoming the defect tier 1 just stopped being:
// a per-username gate checked before verification denies the legitimate owner,
// and it is reachable by anyone from anywhere. So a correct password from an
// address that is not itself locked always succeeds, and a correct password
// never feeds either counter.
//
// What tier 2 buys is therefore narrow, and worth stating plainly so nobody
// later "fixes" it by moving the check earlier: it does not bound CPU (by the
// time it is consulted the derivation has already happened - the per-IP buckets
// and the derivation gate are what bound CPU), and it cannot stop a lucky guess.
// It bounds how long a distributed attacker can go on making progress-free
// guesses against one name, and it puts that fact in the log.
const MAX_FAILURES_PER_ADDRESS = 8;
const LOCKOUT_MS = 15 * 60 * 1000;

// Far above any human's fumbling, far below what a spray needs. Fifty wrong
// passwords for one name inside the window is not a person.
const MAX_FAILURES_PER_USERNAME = 50;
const USERNAME_BRAKE_MS = 15 * 60 * 1000;

// Counts decay wholesale once the window passes with no failure in it. Without
// that, a forgetful colleague accumulates failures over weeks and eventually
// trips a control aimed at an attack that is not happening.
const FAILURE_WINDOW_MS = 15 * 60 * 1000;

// Both maps are keyed on data a caller chooses (a username, an address), so both
// need a ceiling or this bookkeeping becomes the memory-exhaustion vector it was
// added to prevent. Same trade, and same reasoning, as limiter.js's maxEntries.
const MAX_ADDRESS_FAILURE_KEYS = 20_000;
const MAX_USERNAME_FAILURE_KEYS = 10_000;

// How far to look for a droppable entry before falling back to the
// least-recently-touched one. Short on purpose: this runs on an insert.
const FAILURE_EVICTION_SCAN = 8;

// --- Per-IP budgets --------------------------------------------------------
//
// Capacity is the burst a real person needs; refillPerSecond is what an attacker
// is left with once that burst is spent. The bursts are deliberately generous
// because a whole office arrives from one NAT address, and the trickles are
// deliberately slow because none of these actions is something a person repeats.
//
// maxEntries bounds the memory each bucket map can hold. 10,000 distinct
// addresses is far past any legitimate use of this app, and the cap is what
// stops a limiter keyed on attacker-supplied data from becoming a memory
// exhaustion vector of its own.
const MAX_LIMITER_KEYS = 10_000;

// Ten tries, then one every two seconds. Enough for a fumbled password and a
// caps-lock key; at ~100ms of CPU per attempt it also holds one host to a few
// percent of a single core.
const LOGIN_LIMIT = {
  capacity: 10,
  refillPerSecond: 0.5,
  maxEntries: MAX_LIMITER_KEYS,
};

// Signing up is a once-per-person act, so the trickle can be far slower than
// login's. The burst is sized for a team registering together on the day the
// runner goes live, all of them behind one office address.
const SIGNUP_LIMIT = {
  capacity: 8,
  refillPerSecond: 1 / 20,
  maxEntries: MAX_LIMITER_KEYS,
};

// The tightest of the three. The invite code is the one secret a stranger can
// guess, and on a fresh deployment the account it buys is an administrator.
// Eight tries, then one every twenty seconds: a mistyped code is forgiven, a
// search of the keyspace is not.
const INVITE_LIMIT = {
  capacity: 8,
  refillPerSecond: 1 / 20,
  maxEntries: MAX_LIMITER_KEYS,
};

// Administrative password resets are authenticated, so this is not about
// guessing - it is about a stolen admin session being used as a CPU amplifier,
// since every reset is a derivation. Twenty in a burst covers any real
// administrative session; one per second covers nothing else.
const ADMIN_WRITE_LIMIT = {
  capacity: 20,
  refillPerSecond: 1,
  maxEntries: 1_000,
};

// Two derivations at a time.
//
// The number is small on purpose. crypto.scrypt runs on the libuv threadpool,
// which defaults to four threads and is shared with filesystem reads and DNS -
// including the users.json reads and the GitHub lookups this app depends on. Two
// leaves half the pool for that work while still using more than one core, and
// two derivations is ~32MB of scrypt memory rather than an unbounded amount.
//
// It is also plenty: two at ~100ms is ~20 sign-ins per second sustained, orders
// of magnitude above what a handful of colleagues generate.
const DERIVATION_CONCURRENCY = 2;

// Past this many waiting, shed load instead of queueing it. At ~20 derivations
// per second a full queue is under two seconds of wait, so a caller either gets
// served promptly or is told to come back - never left holding a connection
// while the queue grows behind it.
const DERIVATION_QUEUE_MAX = 32;

// The same two roles store.js persists. Keeping the vocabulary identical
// matters: a session claiming a role that users.json does not use would quietly
// fail every role check downstream.
const ADMIN_ROLE = "admin";
const DEFAULT_ROLE = "user";

const PRUNE_INTERVAL_MS = 60 * 1000;

const sessions = new Map();
// Tier 1, keyed by (username + address). Tier 2, keyed by username.
const addressFailures = new Map();
const usernameFailures = new Map();
let lastPruneAt = 0;
let decoyHash = "";
let countWarned = false;

const loginLimiter = createLimiter(LOGIN_LIMIT);
const signupLimiter = createLimiter(SIGNUP_LIMIT);
const inviteLimiter = createLimiter(INVITE_LIMIT);
const adminWriteLimiter = createLimiter(ADMIN_WRITE_LIMIT);

// One gate for every derivation in the process - hashing a new password and
// verifying an existing one draw on the same budget, because they cost the same
// and it is the total that has to be bounded.
const derivationGate = createGate(DERIVATION_CONCURRENCY, {
  maxQueue: DERIVATION_QUEUE_MAX,
  busyMessage:
    "The runner is busy checking other sign-in attempts. Try again in a few seconds.",
});

// Errors carry the HTTP status the request layer should send, so route handlers
// stay free of auth-specific branching.
function fail(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

// Consume one token or refuse the request outright.
//
// The wait hint goes in the message because auth.js does not own the response:
// server.js renders { message } and the number of seconds is the only part a
// person can act on. `retryAfterSeconds` rides along on the error so the request
// layer can also set a Retry-After header if it wants to, without re-deriving it.
function takeOrThrow(limiter, key, what) {
  const decision = limiter.take(key);

  if (decision.allowed) return;

  const seconds = Math.max(1, Math.ceil(decision.retryAfterMs / 1000));
  const error = fail(
    429,
    `Too many ${what} from your network. Try again in ${seconds} second(s).`,
  );

  error.retryAfterSeconds = seconds;

  throw error;
}

// store.js downgrades any role it does not recognise rather than rejecting it,
// so mirror that here: whatever the file says, a session only ever carries one
// of the two known roles, and an unrecognised one lands on the lower privilege.
function normalizeRole(role) {
  return role === ADMIN_ROLE ? ADMIN_ROLE : DEFAULT_ROLE;
}

// store.js offers no single-record lookup, by design: it re-reads the whole
// file on every call so an operator who edits users.json to revoke an account
// has that take effect at once. At a few hundred bytes that read is cheaper
// than the cache invalidation the alternative would need.
//
// A store that cannot be read throws here with no statusCode attached, which is
// deliberate - server.js turns a status-less error into a generic 500 and logs
// the detail, so the users.json path never reaches the client.
function findUser(username) {
  const record = store.readUsers().get(username);

  if (!record || typeof record.hash !== "string" || !record.hash) return null;

  return {
    username: record.username || username,
    hash: record.hash,
    role: normalizeRole(record.role),
  };
}

// sessionInfo() is what the unauthenticated UI bootstraps from, so a users file
// that cannot be read must still render a login page rather than a 500. The
// warning is logged once: this runs on every page load, and a broken store
// would otherwise fill the log with one copy per poll.
function safeCountUsers() {
  try {
    return store.countUsers();
  } catch (error) {
    if (!countWarned) {
      countWarned = true;
      console.warn(`[auth] cannot count accounts: ${error.message}`);
    }

    return 0;
  }
}

// addUser() owns both uniqueness and the role. It refuses a duplicate with its
// own 409 (case-insensitively, which a lookup here would miss), and it derives
// admin-or-user itself precisely so a signup body cannot name its own role.
// Its errors already carry a status code, so they travel up untouched.
function createUser(username, hash) {
  store.addUser({ username, hash });

  // Read back rather than assume: the store decided the role, and a session
  // that disagreed with users.json would be a miserable bug to chase.
  return findUser(username) || { username, hash, role: DEFAULT_ROLE };
}

function isSaneInteger(value, max) {
  return Number.isInteger(value) && value >= 1 && value <= max;
}

const scryptAsync = promisify(crypto.scrypt);

// The single doorway to scrypt in this app, and the reason there is only one:
// every derivation has to be both off the event loop and inside the gate. A
// second path that called crypto.scryptSync directly would reintroduce the
// original defect - one request stalling the whole process - and a second path
// that skipped the gate would let concurrency multiply until the box fell over.
//
// A gate refusal surfaces as an Error with statusCode 503; callers must let it
// through rather than treating it as a failed password. See verifyPassword.
function derive(password, salt, keylen, params) {
  return derivationGate.run(() =>
    scryptAsync(password, salt, keylen, {
      N: params.N,
      r: params.r,
      p: params.p,
    }),
  );
}

// Format: scrypt$N$r$p$<salt-base64>$<derived-base64>. The parameters travel
// with the hash so they can be raised later without invalidating old accounts.
//
// Async since the derivation moved off the main thread. Callers must await it:
// a forgotten await stores "[object Promise]" as a hash, which store.js accepts
// as a non-empty string and nobody can ever sign in against.
async function hashPassword(password) {
  const accepted = assertPassword(password);
  const salt = crypto.randomBytes(SALT_BYTES);
  const derived = await derive(accepted, salt, SCRYPT_KEYLEN, SCRYPT_PARAMS);

  return [
    "scrypt",
    SCRYPT_PARAMS.N,
    SCRYPT_PARAMS.r,
    SCRYPT_PARAMS.p,
    salt.toString("base64"),
    derived.toString("base64"),
  ].join("$");
}

// Async, and the return value is a Promise<boolean>. Every caller must await
// it: an unawaited Promise is truthy, so `if (verifyPassword(...))` would accept
// every password ever submitted. That is why the only call site in this file is
// login(), and why this stays the only place a stored record is checked.
async function verifyPassword(password, stored) {
  if (typeof password !== "string" || password.length > PASSWORD_MAX) {
    return false;
  }

  const parts = String(stored == null ? "" : stored).split("$");

  if (parts.length !== 6 || parts[0] !== "scrypt") return false;

  const [, rawN, rawR, rawP, saltB64, derivedB64] = parts;
  const N = Number(rawN);
  const r = Number(rawR);
  const p = Number(rawP);

  // The parameters come out of a stored record, so bound them: a tampered
  // users.json must not be able to talk this process into a huge derivation.
  if (
    !isSaneInteger(N, 1 << 20) ||
    !isSaneInteger(r, 64) ||
    !isSaneInteger(p, 16)
  ) {
    return false;
  }

  const salt = Buffer.from(saltB64, "base64");
  const expected = Buffer.from(derivedB64, "base64");

  if (salt.length === 0 || expected.length < 16 || expected.length > 128) {
    return false;
  }

  let actual;

  try {
    actual = await derive(password, salt, expected.length, { N, r, p });
  } catch (error) {
    // A gate refusal is not a wrong password. Swallowing it here would answer
    // 401 to a request we never actually checked and - worse - would record a
    // failed attempt against an account nobody was guessing, which hands anyone
    // who can saturate the gate a way to lock real users out.
    if (error && error.statusCode) throw error;

    // Malformed base64, or parameters past the crypto maxmem ceiling. Either
    // way the record is unusable; treat it as a non-match, not a crash.
    return false;
  }

  return crypto.timingSafeEqual(actual, expected);
}

// A stand-in record for a username that does not exist. Verifying a password
// against it runs exactly the same derivation as verifying against a real
// account - same N, r, p and key length - which is what keeps "no such user"
// and "wrong password" indistinguishable by timing as well as by message.
//
// The derived half is random bytes rather than the output of a real derivation.
// It never has to match anything (by design it cannot), so deriving it would buy
// nothing and cost a full derivation on the first login of every process - a
// cost an attacker could aim at a cold start. Built once and reused.
function decoy() {
  if (!decoyHash) {
    decoyHash = [
      "scrypt",
      SCRYPT_PARAMS.N,
      SCRYPT_PARAMS.r,
      SCRYPT_PARAMS.p,
      crypto.randomBytes(SALT_BYTES).toString("base64"),
      crypto.randomBytes(SCRYPT_KEYLEN).toString("base64"),
    ].join("$");
  }

  return decoyHash;
}

function assertUsername(value) {
  const username = typeof value === "string" ? value.trim() : "";

  if (!USERNAME_PATTERN.test(username)) {
    throw fail(
      400,
      "Username must be 3-32 characters, using letters, digits, dot, " +
        "underscore or hyphen.",
    );
  }

  return username;
}

function assertPassword(value) {
  if (typeof value !== "string" || value.length < PASSWORD_MIN) {
    throw fail(400, `Password must be at least ${PASSWORD_MIN} characters.`);
  }

  if (value.length > PASSWORD_MAX) {
    throw fail(400, `Password must be at most ${PASSWORD_MAX} characters.`);
  }

  return value;
}

function constantTimeEquals(supplied, expected) {
  if (typeof supplied !== "string") return false;

  const a = Buffer.from(supplied, "utf8");
  const b = Buffer.from(expected, "utf8");

  // timingSafeEqual throws on unequal lengths, so length has to be settled
  // first. Returning on length alone leaks only the code's length, which is not
  // the secret; the bytes themselves are still compared in constant time.
  if (a.length !== b.length) return false;

  return crypto.timingSafeEqual(a, b);
}

// Rate limited per address, and that limit is the whole of this control's
// strength. Rejecting a wrong code is cheap - it happens before any hashing, so
// nothing on this path slows an attacker down on its own - and a live server
// answered thousands of guesses a second before this bucket existed. The code
// itself only has to survive a few tries a minute now, which is a demand a
// random code meets and a memorable one does not (config.js refuses to stay
// quiet about a short one).
function assertInviteCode(supplied, ip) {
  const expected = config().inviteCode;

  // Fail closed. Invite mode with no code configured must not degrade into open
  // signup just because someone forgot to set TR_INVITE_CODE.
  //
  // Checked before the bucket is touched: this is the operator's mistake, not
  // the caller's, and spending their budget on it would leave a colleague
  // rate-limited for a problem no code they type can fix.
  if (!expected) {
    throw fail(
      403,
      "Sign-up is invite-only and no invite code is configured on the server.",
    );
  }

  // Consumed before the comparison, so a guess costs a token whether it is
  // right or wrong. The comparison stays constant-time either way.
  takeOrThrow(inviteLimiter, ip, "invite code attempts");

  if (!constantTimeEquals(supplied, expected)) {
    throw fail(403, "That invite code is not valid.");
  }

  // A caller who produced the code already holds the secret this bucket exists
  // to protect, so counting their correct attempt against them protects nothing
  // and only punishes the next colleague sharing that office address. Refunded
  // on success alone; every wrong guess still costs.
  inviteLimiter.reset(ip);
}

function sessionTtlMs() {
  const hours = Number(config().sessionHours);
  const resolved = Number.isFinite(hours) && hours > 0 ? hours : 12;

  return resolved * 60 * 60 * 1000;
}

// Lower-cased so "alice" and "Alice" draw on one attempt budget; otherwise case
// variants hand an attacker a fresh set of guesses against the same account.
function usernameFailureKey(username) {
  return username.toLowerCase();
}

// The two halves joined by a newline, because neither half can contain one:
// USERNAME_PATTERN and client-ip.js both refuse it. That is what stops a
// carefully chosen username from colliding with somebody else's key.
function addressFailureKey(username, ip) {
  return `${usernameFailureKey(username)}\n${ip}`;
}

function isBlocked(record, now) {
  return Boolean(record && record.blockedUntil > now);
}

// Failures older than the window are forgotten in one go rather than decayed one
// at a time. This is a brake on bursts, and a rule a person can predict beats
// arithmetic nobody can.
function activeCount(record, now) {
  if (!record || now - record.lastFailureAt > FAILURE_WINDOW_MS) return 0;

  return record.count;
}

// Drops an entry that can no longer deny anybody if one turns up in a short scan
// from the least-recently-touched end, and the least-recently-touched entry
// otherwise.
//
// The fallback does let a caller who can cycle through the cap evict their own
// block. That is unavoidable in bounded memory - it is the same trade
// limiter.js documents - and it is why the derivation gate, which has no per-key
// state to cycle, is what bounds total work. It also costs a login-limiter token
// per key, so the cap is not reachable from one address inside one window.
function evictFailureKey(map, now) {
  let oldest = null;
  let scanned = 0;

  for (const [key, record] of map) {
    if (oldest === null) oldest = key;

    if (!isBlocked(record, now) && activeCount(record, now) === 0) {
      map.delete(key);
      return;
    }

    scanned += 1;

    if (scanned >= FAILURE_EVICTION_SCAN) break;
  }

  if (oldest !== null) map.delete(oldest);
}

// Records one failed attempt against one key and reports whether that key is now
// blocked. Shared by both tiers because the bookkeeping is identical; only the
// key, the threshold and the window differ.
function noteFailure(map, key, { threshold, blockMs, maxKeys }) {
  const now = Date.now();
  const existing = map.get(key);
  const record = existing || { count: 0, blockedUntil: 0, lastFailureAt: 0 };

  // Deleted and re-inserted below, which is what makes iteration order
  // least-recently-used without a second data structure to keep in step.
  if (existing) map.delete(key);
  else if (map.size >= maxKeys) evictFailureKey(map, now);

  // An attempt that is already being refused must never extend the block.
  // Without this the window restarts on every rejected request and a lockout
  // that reads as fifteen minutes never ends - which is precisely how the
  // per-username version of this control became a permanent denial. The record
  // is still re-inserted, so a live block stays clear of eviction.
  if (isBlocked(record, now)) {
    map.set(key, record);

    return {
      blocked: true,
      justBlocked: false,
      remainingMs: record.blockedUntil - now,
    };
  }

  const count = activeCount(record, now) + 1;

  record.count = count;
  record.lastFailureAt = now;

  let justBlocked = false;

  if (count >= threshold) {
    record.blockedUntil = now + blockMs;
    // Zeroed so the next window starts from nothing rather than from a count
    // that is already at the threshold.
    record.count = 0;
    justBlocked = true;
  }

  map.set(key, record);

  return {
    blocked: justBlocked,
    justBlocked,
    remainingMs: justBlocked ? blockMs : 0,
  };
}

function addressLockout(username, ip) {
  const now = Date.now();
  const record = addressFailures.get(addressFailureKey(username, ip));

  if (!isBlocked(record, now)) return { locked: false, remainingMs: 0 };

  return { locked: true, remainingMs: record.blockedUntil - now };
}

// Both tiers, in one call, for an attempt that has already been found wrong.
// Only ever called with a wrong password: a correct one must not feed either
// counter, or the owner's own successful sign-in becomes ammunition against
// them.
function recordFailedAttempt(username, ip) {
  const address = noteFailure(
    addressFailures,
    addressFailureKey(username, ip),
    {
      threshold: MAX_FAILURES_PER_ADDRESS,
      blockMs: LOCKOUT_MS,
      maxKeys: MAX_ADDRESS_FAILURE_KEYS,
    },
  );

  const account = noteFailure(usernameFailures, usernameFailureKey(username), {
    threshold: MAX_FAILURES_PER_USERNAME,
    blockMs: USERNAME_BRAKE_MS,
    maxKeys: MAX_USERNAME_FAILURE_KEYS,
  });

  // Logged on the transition only, and worth logging: tier 2 tripping means
  // failures against one name arrived faster than any person produces them,
  // which is the one signal in this app that says "somebody is working on your
  // accounts". The username is already in this process's logs on every admin
  // action; no password, hash or address is added here.
  if (account.justBlocked) {
    console.warn(
      `[auth] ${MAX_FAILURES_PER_USERNAME} failed sign-ins for "${username}" within ${FAILURE_WINDOW_MS / 60000} minutes, from one or more addresses. Refusing further failed attempts for that name for ${USERNAME_BRAKE_MS / 60000} minutes; a correct password from an address that is not itself locked still works.`,
    );
  }

  return { address, account };
}

// After a correct password. Clears the tier-2 brake for the account and the
// tier-1 record for THIS address, and deliberately not tier-1 records held
// against other addresses: those belong to whoever earned them. Clearing them
// all would let an attacker buy their lockout back by waiting for the real owner
// to sign in, and the owner needs no such refund - their own key is the one just
// cleared, and it was never blocked by anybody else's failures in the first
// place.
function clearFailuresAfterSuccess(username, ip) {
  addressFailures.delete(addressFailureKey(username, ip));
  usernameFailures.delete(usernameFailureKey(username));
}

// Every record for a name, from every address. For the moments when the thing
// those failures were aimed at is gone: a new account, a reset password, a
// deleted one. Then the bookkeeping stands between the owner and a credential
// they were just handed rather than between an attacker and anything at all.
function clearFailures(username) {
  const key = usernameFailureKey(username);

  usernameFailures.delete(key);

  const prefix = `${key}\n`;

  for (const existing of addressFailures.keys()) {
    if (existing.startsWith(prefix)) addressFailures.delete(existing);
  }
}

// One wording for both tiers. The scope is named because "your address" and
// "this account" are different problems with different waits, and neither
// message says whether the account exists: an unknown username accumulates
// failures exactly as a real one does, so the two are indistinguishable here as
// well as in the 401.
function lockoutError(remainingMs, scope) {
  const minutes = Math.max(1, Math.ceil(remainingMs / 60000));

  return fail(
    429,
    `Too many failed sign-in attempts ${scope}. Try again in ${minutes} minute(s).`,
  );
}

// Lazy sweep rather than a timer: no interval keeping the event loop alive, and
// the work is bounded because it runs at most once a minute.
function pruneSessions(force) {
  const now = Date.now();

  if (!force && now - lastPruneAt < PRUNE_INTERVAL_MS) return;

  lastPruneAt = now;

  for (const [id, session] of sessions) {
    if (session.expiresAt <= now) sessions.delete(id);
  }

  // Drop failure bookkeeping once it can no longer deny anyone, so a spray
  // across thousands of invented usernames and addresses does not sit in memory
  // long after it stopped mattering. The hard caps in noteFailure are the
  // backstop; this is the tidy path.
  for (const map of [addressFailures, usernameFailures]) {
    for (const [key, record] of map) {
      if (!isBlocked(record, now) && activeCount(record, now) === 0) {
        map.delete(key);
      }
    }
  }
}

function createSession(user) {
  pruneSessions(true);

  const id = crypto.randomBytes(32).toString("base64url");
  const now = Date.now();

  // The role is captured at sign-in, so a role change in the store takes effect
  // at the user's next login. That is fine here: roles only widen or narrow the
  // UI, they are not the boundary protecting the GitHub token.
  sessions.set(id, {
    username: user.username,
    role: user.role,
    createdAt: now,
    expiresAt: now + sessionTtlMs(),
  });

  return id;
}

function buildCookie(value, maxAgeSeconds) {
  const attributes = [
    `${SESSION_COOKIE}=${value}`,
    "Path=/",
    "HttpOnly",
    // Strict rather than Lax: nothing legitimately links into this app from
    // elsewhere, and starting a run is a state change, so there is no case for
    // sending the session on a cross-site navigation.
    "SameSite=Strict",
    `Max-Age=${maxAgeSeconds}`,
  ];

  if (config().secureCookie) attributes.push("Secure");

  return attributes.join("; ");
}

function issueSession(user) {
  const role = normalizeRole(user.role);

  return {
    username: user.username,
    role,
    cookie: buildCookie(
      createSession({ username: user.username, role }),
      Math.floor(sessionTtlMs() / 1000),
    ),
  };
}

function readCookie(request, name) {
  const header =
    request && request.headers ? request.headers.cookie : undefined;

  if (typeof header !== "string" || !header) return "";

  for (const part of header.split(";")) {
    const separator = part.indexOf("=");

    if (separator <= 0) continue;
    if (part.slice(0, separator).trim() !== name) continue;

    return part.slice(separator + 1).trim();
  }

  return "";
}

// Case-insensitive, exactly as store.addUser() decides it, and the message is
// word-for-word the store's own 409 so the two paths are indistinguishable from
// outside.
//
// This is a cost check, not the uniqueness rule. addUser() remains the authority
// there: it re-reads and re-checks inside one synchronous read-modify-write, so
// two signups racing across the await below still cannot both create the
// account. What this buys is that a duplicate costs a file read instead of a
// file read plus a full scrypt derivation, which is what stopped a stranger from
// buying 100ms of CPU with any name at all.
//
// It discloses nothing new: the 409 that addUser() already raised said the same
// thing, just 100ms later.
//
// store.readUsers() covers both halves of the store, so a name declared in
// TR_USERS is refused here exactly like a name already in the file. It has to
// be: an env account that could be re-created through the signup form would
// hand a stranger a file record shadowed by - and indistinguishable from - the
// operator's own account.
function assertUsernameAvailable(username) {
  const wanted = username.toLowerCase();

  for (const existing of store.readUsers().keys()) {
    if (existing.toLowerCase() === wanted) {
      throw fail(409, `The username "${username}" is already taken.`);
    }
  }
}

// One sentence appended to every "self-signup is unavailable" message, because
// the useful part is not the diagnosis - it is the next step. A colleague can
// neither fix a disk nor edit an environment variable.
const SIGNUP_STORE_HINT =
  "Accounts that already exist are unaffected; ask whoever runs this deployment for an account.";

// Why self-signup cannot work on this deployment, or "" when it can.
//
// Two sources, because neither sees the other's half. config() decides whether
// the store PATH can be written - it stats the file and its nearest existing
// ancestor - and never opens the file. store.signupBlockedReason() decides
// whether the file's CONTENT can be read. A signup needs both, and discovering
// it at the end meant answering a status-less store error, which server.js can
// only render as "The test runner hit an unexpected error." That reads as an
// outage to somebody whose real next step is to ask for an account.
//
// Every string returned here is path-free and length-free by contract: it
// reaches an unauthenticated visitor through sessionInfo() as well as through a
// refused signup. config().errors is the public half of config's diagnostics by
// the same contract; errorDetails carries the values and stays in the log.
function signupStoreProblem() {
  const report = config().errorReports.find(
    (entry) => entry.variable === "TR_USERS_FILE",
  );

  if (report) return `${report.summary} ${SIGNUP_STORE_HINT}`;

  const blocked = store.signupBlockedReason();

  return blocked ? `${blocked} ${SIGNUP_STORE_HINT}` : "";
}

// Takes the request so the per-address limiter has an address to key on; see
// login() for why the token is claimed before anything else happens.
async function signup(request, input) {
  const payload = input && typeof input === "object" ? input : {};
  const ip = clientIp(request);

  takeOrThrow(signupLimiter, ip, "sign-up attempts");

  const mode = config().signupMode;

  if (mode === "invite") {
    // Check the invite first, so probing for taken usernames also needs the
    // code.
    assertInviteCode(payload.inviteCode, ip);
  } else if (mode !== "open") {
    // "off", and anything unrecognised: fail closed. A typo in TR_SIGNUP_MODE
    // must never be the reason this app starts accepting strangers.
    throw fail(
      403,
      "Sign-up is disabled here. An administrator must create your account.",
    );
  }

  // After the invite check, so a stranger without the code learns nothing about
  // this deployment they could not already see, and before the derivation,
  // because a signup that cannot land must not cost 100ms of CPU. 503 rather
  // than 500: the request is well formed and the server is temporarily unable to
  // serve it, which is exactly what a diskless host is.
  const storeProblem = signupStoreProblem();

  if (storeProblem) throw fail(503, storeProblem);

  const username = assertUsername(payload.username);
  const password = assertPassword(payload.password);

  // Before the derivation, deliberately. Hashing first meant every signup - and
  // in "open" mode that means every unauthenticated request to this endpoint -
  // bought a full derivation before anyone checked whether the account could
  // even be created.
  assertUsernameAvailable(username);

  const hash = await hashPassword(password);

  let created;

  try {
    created = createUser(username, hash);
  } catch (error) {
    // A store error carrying a status is a decision (409 taken, 400 shape) and
    // travels untouched. One with no status is ours - a disk that filled between
    // the probe above and this write, a file that changed underneath us - and
    // must not reach the client as a generic 500. The original message names the
    // path, so it goes to the log and not into the response.
    if (error && error.statusCode) throw error;

    console.error(
      `[auth] signup could not write the user store: ${error.message}`,
    );

    throw fail(
      503,
      `This runner could not save the new account. ${SIGNUP_STORE_HINT}`,
    );
  }

  // Sign the new account straight in. Bouncing them to the login form to retype
  // credentials the browser already holds buys no security at all.
  clearFailures(username);

  return issueSession(created);
}

// Takes the request rather than an address string, matching every other
// request-aware function here (currentUser, requireUser, logout, sessionInfo) so
// there is one convention to remember. client-ip.js decides what counts as the
// caller's address.
//
// The per-address token is claimed before the username regex, before the store
// read and before the derivation. Validation is work too, and the point of the
// bucket is to bound the work an unauthenticated caller can ask for - not merely
// to protect the most expensive step of it.
async function login(request, username, password) {
  const ip = clientIp(request);

  takeOrThrow(loginLimiter, ip, "sign-in attempts");

  const name = assertUsername(username);

  // Only the shape is checked here, not the policy: an account created before a
  // policy change must still be able to sign in. The upper bound stays, because
  // that one is the DoS guard rather than a policy rule.
  if (typeof password !== "string" || !password) {
    throw fail(400, "Username and password are required.");
  }

  if (password.length > PASSWORD_MAX) {
    throw fail(400, `Password must be at most ${PASSWORD_MAX} characters.`);
  }

  // Tier 1, and the only lockout consulted before the password is checked. It is
  // safe here precisely because its key includes the caller's own address: the
  // only person it can refuse is somebody who has already failed eight times
  // from this address, and refusing them cheaply - before a 100ms derivation -
  // is half the reason a lockout exists.
  //
  // Nothing is recorded on this path. A refused attempt must not renew the
  // window; see noteFailure.
  const address = addressLockout(name, ip);

  if (address.locked) {
    throw lockoutError(address.remainingMs, "from your address");
  }

  const record = findUser(name);
  // Always run the derivation, even for a name that does not exist, so an
  // unknown account and a wrong password cost the same. The two also share one
  // message: telling an attacker which half was wrong halves their work.
  //
  // Awaited, not merely called: the return value is a Promise now, and an
  // unawaited Promise is truthy - which would make every password correct.
  const passwordOk = await verifyPassword(
    password,
    record ? record.hash : decoy(),
  );

  // Verify first, then decide. Every lockout question that is not tier 1 is
  // asked from here down, so no counter anybody else can fill is ever between
  // this account's owner and their own correct password.
  if (!record || !passwordOk) {
    const outcome = recordFailedAttempt(name, ip);

    // Both tiers report through the same 429 so the two are not worth
    // distinguishing from outside, and tier 1 is reported first: it is the
    // caller's own doing and carries the shorter, more actionable wait.
    if (outcome.address.blocked) {
      throw lockoutError(outcome.address.remainingMs, "from your address");
    }

    if (outcome.account.blocked) {
      throw lockoutError(outcome.account.remainingMs, "for that account");
    }

    throw fail(401, "Invalid username or password.");
  }

  clearFailuresAfterSuccess(name, ip);

  // Note what is deliberately *not* done here: the per-address bucket is not
  // reset on success. Refunding it would hand anyone holding one valid account
  // an unlimited guessing budget against everybody else's, one successful
  // sign-in at a time. A real user does not need the refund - a token comes back
  // every two seconds - so the trade is entirely one-sided.
  return issueSession(record);
}

function logout(request) {
  const id = readCookie(request, SESSION_COOKIE);

  // Drop the server-side session too. Clearing only the cookie would leave a
  // still-valid id usable by anyone who captured it.
  if (id) sessions.delete(id);

  return { cookie: buildCookie("", 0) };
}

function currentUser(request) {
  pruneSessions(false);

  const id = readCookie(request, SESSION_COOKIE);

  if (!id) return null;

  const session = sessions.get(id);

  if (!session) return null;

  if (session.expiresAt <= Date.now()) {
    sessions.delete(id);
    return null;
  }

  // Re-read the account on every request rather than trusting what the session
  // captured at login. Without this, a session outlives the account it belongs
  // to: a deleted user's cookie keeps working until it expires, and - worse - a
  // demoted admin keeps admin powers for the rest of their session. The role
  // must come from the store, which is the only authority on it.
  //
  // findUser() re-reads users.json, so this also honours an operator who edits
  // or empties that file by hand to revoke access immediately.
  // A store that cannot be read must not 500 every authenticated request. Fail
  // closed instead: treat the session as unverifiable, which bounces the user to
  // the login screen while sessionInfo() still renders it.
  let account = null;

  try {
    account = findUser(session.username);
  } catch (error) {
    console.error(
      `[runner] cannot verify session for ${session.username}: ${error.message}`,
    );
    return null;
  }

  if (!account) {
    dropSessionsFor(session.username);
    return null;
  }

  // Sliding expiry: someone watching a 40-minute run should not be signed out
  // mid-run, while an abandoned tab still ages out on its own.
  session.expiresAt = Date.now() + sessionTtlMs();

  // Keep the cached copy in step so anything reading session.role directly sees
  // the current value too.
  session.role = account.role;

  return { username: account.username, role: account.role };
}

function requireUser(request) {
  const user = currentUser(request);

  if (!user) {
    throw fail(401, "Sign in to use the test runner.");
  }

  return user;
}

// Safe to call with no session: this is exactly what the UI asks for first, to
// decide between the login form, the signup form, and the runner itself.
function sessionInfo(request) {
  const settings = config();
  const user = currentUser(request);

  // Whether a signup would actually create an account, and why not.
  //
  // A form that is certain to fail is worse than no form: a colleague picks a
  // password, types the invite code they were handed, and gets back something
  // that reads like the runner is down. signupMode is already public here, so
  // adding "and it is unavailable right now" discloses nothing new about the
  // deployment - and the note itself is path-free by signupStoreProblem()'s
  // contract, which is what makes it safe to answer an anonymous caller.
  //
  // Skipped when the mode is "off": there is no store question to ask about a
  // form nobody is being offered, and this runs on every page load.
  const signupProblem =
    settings.signupMode === "off" ? "" : signupStoreProblem();

  return {
    authenticated: Boolean(user),
    username: user ? user.username : null,
    role: user ? user.role : null,
    accounts: safeCountUsers(),
    signupMode: settings.signupMode,
    signupAvailable: settings.signupMode !== "off" && !signupProblem,
    signupNote: signupProblem,
    sessionHours: sessionTtlMs() / (60 * 60 * 1000),
  };
}

// --- Administration -------------------------------------------------------
//
// Everything below runs on behalf of one administrator against one other
// account, and the recurring hazard here is not privilege escalation - it is an
// administrator quietly removing the last way into their own runner. The guards
// exist for that: they refuse the two edits that cannot be undone from inside
// the app.

// store.js accepts a wider username than signup does, and this is that limit.
// Restated rather than exported because it bounds an argument, not a rule: the
// only job is to refuse an absurd string before it reaches a file read.
const STORE_USERNAME_MAX = 64;

// A revoked account, a new role and a reset password share one requirement:
// whatever that person is holding in their browser stops working now, not
// whenever a 12-hour cookie happens to age out. Sessions are process-local, so
// dropping them here is the whole of it.
//
// Matched case-insensitively, like the lockout counter: usernames are unique
// case-insensitively, so a case variant must never be a way to keep a session
// alive after the account behind it was changed.
//
// Called only after a store write has succeeded. A write that throws - a 404, a
// full disk - must not leave somebody signed out of an account that still exists
// exactly as it did before.
function dropSessionsFor(username) {
  const key = username.toLowerCase();
  let dropped = 0;

  for (const [id, session] of sessions) {
    if (session.username.toLowerCase() === key) {
      sessions.delete(id);
      dropped += 1;
    }
  }

  return dropped;
}

// Forced sweep first, so "online" is never answered on the strength of a session
// that expired an hour ago and has not been pruned yet.
function liveUsernames() {
  pruneSessions(true);

  const live = new Set();

  for (const session of sessions.values()) {
    live.add(session.username.toLowerCase());
  }

  return live;
}

// Authorises against the store, not against the session. createSession captures
// the role at sign-in, which is fine while a role only widens or narrows the UI.
// It is not fine now that an administrator can delete accounts and reset
// passwords: a demoted or deleted administrator would otherwise keep every one
// of those powers until their cookie aged out.
//
// The extra read is also the fail-closed path. A users.json this process cannot
// parse throws here with no statusCode, which server.js turns into a 500, so a
// broken store denies administration rather than granting it.
function requireAdmin(request) {
  const user = requireUser(request);
  const record = findUser(user.username);

  // The account behind this cookie is gone - deleted here, or hand-edited out of
  // users.json. That is much closer to "not signed in" than to "not allowed",
  // and a 401 is also what makes the UI offer a login form instead of a dead
  // page telling them to ask themselves for access.
  if (!record) {
    throw fail(401, "Your account no longer exists. Sign in again.");
  }

  if (record.role !== ADMIN_ROLE) {
    throw fail(403, "Only an administrator can manage accounts.");
  }

  return { username: record.username, role: record.role };
}

// The acting administrator is the entire basis of the self-lockout guard, so an
// actor we cannot name is a wiring bug rather than a user error. This throws
// without a statusCode on purpose: server.js logs it and answers a generic 500,
// which is the right outcome for an administrative write that was about to
// proceed without knowing who asked for it.
function actorName(actor) {
  const source = actor && typeof actor === "object" ? actor.username : actor;
  const name = typeof source === "string" ? source.trim() : "";

  if (!name) {
    throw new Error(
      "An administrative action needs the acting administrator. Pass the user returned by requireAdmin().",
    );
  }

  return name;
}

// Looser than assertUsername, deliberately. That one decides what a *new*
// account may be called; this one names an account that already exists, and the
// store accepts shapes signup does not (shorter names, "@", and whatever an
// operator hand-edited in). Holding an administrator to the signup rules would
// leave those accounts impossible to demote, reset or remove. A name the store
// does not hold comes back as the store 404.
function assertTargetUsername(value) {
  const username = typeof value === "string" ? value.trim() : "";

  if (!username || username.length > STORE_USERNAME_MAX) {
    throw fail(400, "Name the account to act on.");
  }

  return username;
}

// Not lower-cased before comparing. store.js downgrades a role it does not
// recognise, so quietly accepting "Admin" would answer 200 to a promotion that
// did not happen. Better to say which two words are allowed.
function assertRole(value) {
  const role = typeof value === "string" ? value.trim() : "";

  if (role !== ADMIN_ROLE && role !== DEFAULT_ROLE) {
    throw fail(400, `Role must be "${ADMIN_ROLE}" or "${DEFAULT_ROLE}".`);
  }

  return role;
}

// One read serves both guards: whether the target exists at all, the role it
// holds right now, and how many administrators the store currently has.
// store.listUsers() never returns a hash, so nothing sensitive is in scope.
//
// The count includes administrators declared in TR_USERS, which is what makes
// the last-administrator guard correct on a diskless host: an operator who put
// an admin in the environment can demote the file-backed one, because the runner
// still has a way in that no request can take away.
function accountsSnapshot(target) {
  const users = store.listUsers();

  return {
    // Absent is not an error at this level. The store owns "no such user" and
    // raises its own 404 on the write, which keeps one definition in one place.
    record: users.find((entry) => entry.username === target) || null,
    admins: users.filter((entry) => entry.role === ADMIN_ROLE).length,
  };
}

// Compared case-insensitively in the fail-safe direction: usernames are unique
// case-insensitively, so a variant of your own name is either you or nobody, and
// neither is worth handing someone a way around this guard.
//
// Locking yourself out of your own runner is an easy mistake and a miserable one
// to undo - it takes shell access to the host and a hand-edited users.json - so
// it is refused outright rather than confirmed.
function assertNotSelf(actor, target, action) {
  if (actor.toLowerCase() !== target.toLowerCase()) return;

  throw fail(
    409,
    `You cannot ${action} your own account. Ask another administrator to do it for you.`,
  );
}

// Accounts declared in TR_USERS cannot be edited from inside the app: the
// environment is their only definition, so a write here would be a change the
// next restart silently reverts. store.js refuses them too and is the authority
// - this check exists in front of it for two reasons. adminResetPassword would
// otherwise spend a full scrypt derivation on a write that cannot land, and the
// message here can name the action the administrator actually asked for.
function assertNotEnvAccount(target, action) {
  const envName = store.envAccountName(target);

  if (!envName) return;

  throw fail(
    409,
    `"${envName}" is defined in the environment (TR_USERS), so it cannot be ${action} here. Ask whoever runs this deployment to change TR_USERS and restart the runner.`,
  );
}

// The second guard, and not redundant with the first. These functions take the
// actor as an argument rather than deriving it from a request, so they cannot
// assume requireAdmin() vetted it: a script, a bootstrap task or a future route
// may call them with an actor who is not a current administrator, and the last
// administrator has to survive that too.
function assertNotLastAdmin(snapshot, target, verb) {
  if (!snapshot.record || snapshot.record.role !== ADMIN_ROLE) return;
  if (snapshot.admins > 1) return;

  throw fail(
    409,
    `"${target}" is the only administrator, so it cannot be ${verb}. Promote another account to administrator first.`,
  );
}

// Not logged: this is a read, and the UI polls it.
function adminListUsers() {
  const online = liveUsernames();

  // Rebuilt field by field rather than spread, for the same reason
  // store.listUsers() is: this list is one response body away from a browser,
  // and nothing should be able to ride along in it by accident.
  return store.listUsers().map((entry) => ({
    username: entry.username,
    role: normalizeRole(entry.role),
    createdAt: entry.createdAt,
    online: online.has(entry.username.toLowerCase()),
    // Forwarded so the UI can grey out controls the server is going to refuse
    // anyway. It is a fact about where the account is defined, not a secret:
    // this response is admin-only and already lists every account by name.
    envDefined: entry.envDefined === true,
  }));
}

function adminSetRole(actor, username, role) {
  const actingAs = actorName(actor);
  const target = assertTargetUsername(username);
  const nextRole = assertRole(role);

  // First, because it is the most precise diagnosis available: an env account is
  // refused whichever direction the role was moving, and a "last administrator"
  // message about an account defined in the environment would send somebody
  // looking for the wrong fix.
  assertNotEnvAccount(target, "given a different role");

  // Only a demotion can strand the runner; a promotion cannot.
  if (nextRole !== ADMIN_ROLE) {
    // Self first. When both guards apply it is the more precise diagnosis, and
    // it is the one that names the fix.
    assertNotSelf(actingAs, target, "demote");
    assertNotLastAdmin(accountsSnapshot(target), target, "demoted");
  }

  store.setRole(target, nextRole);

  // A session carries the role it was issued with, so without this the new role
  // would not reach the person holding one until they next signed in. That is
  // the wrong direction for a demotion: an account whose privileges were just
  // taken away must not go on using them for another twelve hours.
  const dropped = dropSessionsFor(target);

  console.log(
    `[auth] ${actingAs} set the role of ${target} to ${nextRole}; ${dropped} session(s) ended`,
  );

  return { username: target, role: nextRole };
}

// No self guard here, unlike demote and delete: resetting your own password
// locks nobody out. It ends your own sessions and you sign back in with the new
// password, which is a reasonable thing to want.
//
// Takes the request for the same reason login() and signup() do, though the
// limiter here has a different job. The caller is a vetted administrator, so
// nothing is being guessed; what is being bounded is CPU, because every reset is
// a full derivation. The token is therefore claimed next to the expensive call
// rather than at the top of the function: an actor we cannot name, or a target
// we will not accept, is a bug or a typo and should be answered as such rather
// than shadowed by a 429.
async function adminResetPassword(request, actor, username, password) {
  const actingAs = actorName(actor);
  const target = assertTargetUsername(username);

  // Before the limiter and before the derivation: this reset cannot land, and
  // neither a token nor 100ms of CPU should be spent finding that out.
  assertNotEnvAccount(target, "given a new password");

  takeOrThrow(adminWriteLimiter, clientIp(request), "password resets");

  // hashPassword() applies the same length rules signup does, so an
  // administrator cannot install a password the account owner would have been
  // refused. Only the hash travels any further: the plaintext is never stored,
  // returned or logged, and it is not in the log line below either.
  const hash = await hashPassword(password);

  store.setPasswordHash(target, hash);

  // The password those failures were aimed at no longer exists, so the lockout
  // now stands between the owner and the password they were handed a minute ago
  // rather than between an attacker and anything at all.
  clearFailures(target);

  const dropped = dropSessionsFor(target);

  console.log(
    `[auth] ${actingAs} reset the password for ${target}; ${dropped} session(s) ended`,
  );

  return { username: target };
}

function adminDeleteUser(actor, username) {
  const actingAs = actorName(actor);
  const target = assertTargetUsername(username);

  assertNotEnvAccount(target, "deleted");
  assertNotSelf(actingAs, target, "delete");
  assertNotLastAdmin(accountsSnapshot(target), target, "deleted");

  store.deleteUser(target);

  const dropped = dropSessionsFor(target);

  // So a username reissued later cannot inherit a lockout earned by the account
  // that used to hold it.
  clearFailures(target);

  console.log(
    `[auth] ${actingAs} deleted the account ${target}; ${dropped} session(s) ended`,
  );

  return { username: target };
}

module.exports = {
  SESSION_COOKIE,
  hashPassword,
  verifyPassword,
  signup,
  login,
  logout,
  currentUser,
  requireUser,
  sessionInfo,
  requireAdmin,
  adminListUsers,
  adminSetRole,
  adminResetPassword,
  adminDeleteUser,
};
