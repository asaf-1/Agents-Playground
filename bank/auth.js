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

module.exports = {
  SESSION_HOURS,
  clearSessionCookie,
  hashPassword,
  hashToken,
  newSessionToken,
  readSessionToken,
  sessionCookie,
  verifyAgainstDecoy,
  verifyPassword,
};
