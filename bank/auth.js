const crypto = require("crypto");
const { promisify } = require("util");

const scrypt = promisify(crypto.scrypt);

// scrypt with Node's recommended cost. Stored as scrypt$N$r$p$salt$hash, so the
// cost can be raised later without breaking old hashes.
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, SCRYPT.keylen, {
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

async function verifyPassword(password, stored) {
  const [scheme, N, r, p, saltText, hashText] = String(stored).split("$");
  if (scheme !== "scrypt" || !saltText || !hashText) {
    return false;
  }
  const expected = Buffer.from(hashText, "base64url");
  const actual = await scrypt(
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

const SESSION_COOKIE = "pb_session";
const SESSION_HOURS = 8;

function newSessionToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

// Render terminates HTTPS in front of the app and says so in
// X-Forwarded-Proto, so the cookie is Secure there and still works on
// http://127.0.0.1 for local runs and tests.
function isHttps(request) {
  return request.headers["x-forwarded-proto"] === "https";
}

function sessionCookie(token, request) {
  const secure = isHttps(request) ? "; Secure" : "";
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_HOURS * 3600}${secure}`;
}

function clearSessionCookie(request) {
  const secure = isHttps(request) ? "; Secure" : "";
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

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

const LOGIN_MAX_FAILURES = positiveInt(process.env.BANK_LOGIN_MAX_FAILURES, 5);
const LOGIN_HOLD_SECONDS = positiveInt(
  process.env.BANK_LOGIN_HOLD_SECONDS,
  900,
);

// Who is calling, for the hold. Behind Render's proxy (and the cluster's
// ingress) the real address is the first entry of X-Forwarded-For; on a laptop
// or in CI it is the socket's.
function clientAddress(request) {
  const forwarded = String(request.headers["x-forwarded-for"] || "")
    .split(",")[0]
    .trim();
  return forwarded || request.socket?.remoteAddress || "unknown";
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
