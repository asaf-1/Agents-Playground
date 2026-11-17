// Node's crypto, and a tool to turn scrypt's callback into a promise.
const crypto = require("crypto");
const { promisify } = require("util");

const scrypt = promisify(crypto.scrypt);
// The gate on password hashing: a few at once, the rest in line, then "busy".
const { hashGate } = require("./limits");

// The one doorway to scrypt: every hash and every check waits its turn at the
// gate, so a flood of sign-ins can't take every thread the server has.
function derive(password, salt, keylen, params) {
  return hashGate.run(() => scrypt(password, salt, keylen, params));
}

// scrypt with Node's recommended cost. Stored as scrypt$N$r$p$salt$hash, so the
// cost can be raised later without breaking old hashes.
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

// Hashes a password with a new random salt.
async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = await derive(password, salt, SCRYPT.keylen, {
    N: SCRYPT.N,
    r: SCRYPT.r,
    p: SCRYPT.p,
  });
  return [
    "scrypt",
    SCRYPT.N,
    SCRYPT.r,
    SCRYPT.p,
    salt.toString("base64url"),
    hash.toString("base64url"),
  ].join("$");
}

// Checks a password against its stored hash, in constant time.
async function verifyPassword(password, stored) {
  const [scheme, N, r, p, saltText, hashText] = String(stored).split("$");
  if (scheme !== "scrypt" || !saltText || !hashText) {
    return false;
  }
  const expected = Buffer.from(hashText, "base64url");
  const actual = await derive(
    password,
    Buffer.from(saltText, "base64url"),
    expected.length,
    { N: Number(N), r: Number(r), p: Number(p) },
  );
  return crypto.timingSafeEqual(actual, expected);
}

// Checked when an email isn't found, so a wrong email takes as long as a wrong
// password and the timing doesn't reveal which emails have accounts.
let decoyHash = null;
async function verifyAgainstDecoy(password) {
  decoyHash ??= await hashPassword(crypto.randomUUID());
  await verifyPassword(password, decoyHash);
  return false;
}

// The session cookie's name and how long a session lasts.
const SESSION_COOKIE = "pb_session";
const SESSION_HOURS = 8;

// A new random session token.
function newSessionToken() {
  return crypto.randomBytes(32).toString("base64url");
}

// The SHA-256 of a token: sessions and API keys are stored only as this.
function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

// Render terminates HTTPS in front of the app and says so in
// X-Forwarded-Proto, so the cookie is Secure there and still works on
// http://127.0.0.1 for local runs and tests.
function isHttps(request) {
  return request.headers["x-forwarded-proto"] === "https";
}

// The session cookie: not readable by page scripts, sent only by this site, and
// Secure on HTTPS.
function sessionCookie(token, request) {
  const secure = isHttps(request) ? "; Secure" : "";
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_HOURS * 3600}${secure}`;
}

// The same cookie, expired, for signing out.
function clearSessionCookie(request) {
  const secure = isHttps(request) ? "; Secure" : "";
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

// The session token from the request's cookies, or null.
function readSessionToken(request) {
  const header = request.headers.cookie || "";
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index !== -1 && part.slice(0, index).trim() === SESSION_COOKIE) {
      return part.slice(index + 1).trim() || null;
    }
  }
  return null;
}

// --- The hold on repeated failed log-ins -------------------------------------
//
// After LOGIN_MAX_FAILURES wrong passwords for one email from one client within
// LOGIN_HOLD_SECONDS, that email-and-client pair is held for LOGIN_HOLD_SECONDS
// and then released by itself. Both are settings (the environment, and
// k8s/10-configmap.yaml in the cluster), with these defaults when unset. The
// tests run the server with a short hold so "released by itself" can be seen.
function positiveInt(value, fallback) {
  const n = Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

// The hold's two settings.
const LOGIN_MAX_FAILURES = positiveInt(process.env.BANK_LOGIN_MAX_FAILURES, 5);
const LOGIN_HOLD_SECONDS = positiveInt(
  process.env.BANK_LOGIN_HOLD_SECONDS,
  900,
);

// Who is calling, for the login hold and the sign-up limit. The rule is the
// test runner's (test-runner/src/client-ip.js), copied, not imported:
//   - the socket's address by default: the one address a caller can't choose;
//   - X-Forwarded-For only when BANK_TRUST_PROXY=true (set on Render, whose
//     proxy sits in front), and then only its LAST entry, the one the proxy
//     wrote. The first entry is whatever the caller typed.
// Before 2026-11-16 the first entry was trusted everywhere, so a caller who
// sent a new fake address each time was never held (feedback-fixes plan,
// Part 2; reproduced: 7 wrong passwords, 7 times 401, no hold).
const TRUST_PROXY = process.env.BANK_TRUST_PROXY === "true";

// The shared bucket for a request whose address can't be told.
const UNKNOWN_ADDRESS = "unknown";

// Address-shaped text only, and short, so a header can't put anything else
// into the hold's key.
const ADDRESS_PATTERN = /^[A-Za-z0-9.:%_-]{1,64}$/;

// One address in one spelling: no port, IPv4 not written the IPv6 way, lower
// case. "" when it isn't usable.
function normalizeAddress(value) {
  let address = typeof value === "string" ? value.trim() : "";
  // "[2001:db8::1]:443" and "1.2.3.4:5678": drop the port.
  if (address.startsWith("[")) {
    const close = address.indexOf("]");
    address = close > 1 ? address.slice(1, close) : "";
  } else if (address.split(":").length === 2) {
    address = address.slice(0, address.indexOf(":"));
  }
  // "::ffff:1.2.3.4" is the IPv4 client 1.2.3.4.
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(address);
  if (mapped) address = mapped[1];
  return ADDRESS_PATTERN.test(address) ? address.toLowerCase() : "";
}

// The address the proxy wrote last in X-Forwarded-For.
function forwardedAddress(request) {
  const header = request.headers?.["x-forwarded-for"];
  const value = Array.isArray(header) ? header.join(",") : header;
  if (typeof value !== "string" || !value) return "";
  const hops = value.split(",");
  return normalizeAddress(hops[hops.length - 1]);
}

// The address to count a request against.
function clientAddress(request) {
  if (TRUST_PROXY) {
    const forwarded = forwardedAddress(request);
    if (forwarded) return forwarded;
  }
  return normalizeAddress(request.socket?.remoteAddress) || UNKNOWN_ADDRESS;
}

// --- Devices ------------------------------------------------------------------

// A short, human description of the browser a session was opened from, for the
// Devices page: "Chrome 131 on Windows". Deliberately rough: it exists so a
// customer can tell their own sessions apart, not to fingerprint anyone, and
// the raw User-Agent is never stored.
function describeDevice(userAgent) {
  const ua = String(userAgent || "");
  if (!ua) return "Unknown device";

  let os = "an unknown system";
  if (/Windows/i.test(ua)) os = "Windows";
  else if (/iPhone|iPad/i.test(ua)) os = "iOS";
  else if (/Mac OS X|Macintosh/i.test(ua)) os = "macOS";
  else if (/Android/i.test(ua)) os = "Android";
  else if (/Linux/i.test(ua)) os = "Linux";

  const browsers = [
    [/Edg\/(\d+)/, "Edge"],
    [/OPR\/(\d+)/, "Opera"],
    [/Firefox\/(\d+)/, "Firefox"],
    [/Chrome\/(\d+)/, "Chrome"],
    [/Version\/(\d+).*Safari/, "Safari"],
  ];
  for (const [pattern, name] of browsers) {
    const match = ua.match(pattern);
    if (match) return `${name} ${match[1]} on ${os}`;
  }
  return `A browser on ${os}`;
}

// What the routes use.
module.exports = {
  LOGIN_HOLD_SECONDS,
  LOGIN_MAX_FAILURES,
  SESSION_HOURS,
  clearSessionCookie,
  clientAddress,
  describeDevice,
  hashPassword,
  hashToken,
  newSessionToken,
  readSessionToken,
  sessionCookie,
  verifyAgainstDecoy,
  verifyPassword,
};
