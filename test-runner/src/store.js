// The user store: accounts from the environment, plus a JSON file of accounts.
//
// A JSON file is the right size of tool here. This runner is a single process
// serving a handful of colleagues, the whole dataset is a few hundred bytes, and
// a database would add an install step, a connection string and a backup story
// to an app whose entire selling point is `node server.js`.
//
// No locking, and none is needed. Node runs this JavaScript on one thread and
// every function below is synchronous, so a read-modify-write cannot be
// interleaved with another request - the event loop cannot switch tasks in the
// middle of one. That guarantee ends the moment a second process or a worker
// thread writes the same file, which is exactly the point at which this file
// should be replaced rather than patched.
//
// Two rules shape the file half of this:
//   1. A missing file is an empty store, not an error. First boot is normal.
//   2. A file we cannot fully understand is an error, never an empty store.
//      Every write is a full rewrite, so a parse that "recovers" by dropping
//      what it did not recognise would quietly delete real accounts on the next
//      signup. We refuse to read instead, and the file stays untouched.
//
// --- Why there are two sources --------------------------------------------
//
// A file needs a disk, and the host this app is deployed to has none that
// survives a restart: on a free hosting tier every redeploy and every nightly
// restart replaces the filesystem. With only a file, that means every account
// vanishes and the next stranger to sign up becomes the administrator, which is
// not a system anybody can be given a URL to.
//
// So accounts may also be declared in TR_USERS (see config.js), and those
// accounts are IMMUTABLE here. They are never written to the file, never
// deleted, never re-roled and never given a new password by this app - the
// environment is their only definition, and an app that could edit them would be
// writing changes that the next restart silently reverts. Every mutation below
// refuses them with a 409 that says where to make the change instead.
//
// Where a name exists in both places, the environment wins. It has to win one
// way or the other, and the env is the source an operator controls directly;
// letting a file record shadow it would mean a signup on an ephemeral disk could
// take over an operator-declared account.

const fs = require("node:fs");
const path = require("node:path");

const { config } = require("./config.js");

const FILE_VERSION = 1;

// Same shape the auth layer accepts, kept deliberately narrow: these names end
// up in file contents, log lines and the UI.
const USERNAME_PATTERN = /^[A-Za-z0-9._@-]{1,64}$/;
const ROLES = ["admin", "user"];

// Both of these run on every request, so their warnings are logged once per
// distinct name. Unbounded on purpose in neither direction: the set only ever
// holds names from TR_USERS and from the file, both of which are operator-sized.
const shadowWarned = new Set();
const rejectedEnvWarned = new Set();
const fileReadWarned = new Set();
const signupProbeWarned = new Set();

function storeFile() {
  return config().usersFile;
}

function warnOnce(seen, key, message) {
  if (seen.has(key)) return;

  seen.add(key);
  console.warn(message);
}

// The environment half of the store. config.js has already validated the shape
// of every entry; the checks here are the ones that must not be assumed, since
// a record that got past them would end up in an HTTP response or a session.
function envAccounts() {
  const declared = config().envUsers;
  const accounts = new Map();

  if (!Array.isArray(declared)) return accounts;

  for (const entry of declared) {
    const username =
      entry && typeof entry.username === "string" ? entry.username : "";
    const hash = entry && typeof entry.hash === "string" ? entry.hash : "";

    if (!USERNAME_PATTERN.test(username) || hash.trim() === "") {
      warnOnce(
        rejectedEnvWarned,
        username || "(unnamed)",
        `[store] ignoring a TR_USERS entry the store will not accept: "${username}".`,
      );
      continue;
    }

    // First occurrence wins, matching config.js. Silent here rather than
    // reported twice - config.js already told the operator about the duplicate.
    if (accounts.has(username)) continue;

    accounts.set(username, {
      username,
      hash,
      // Downgraded rather than rejected if it is somehow unrecognised: least
      // privilege is the safe direction. config.js reports the typo.
      role: ROLES.includes(entry.role) ? entry.role : "user",
      // These accounts have no creation date - the env has no history. The UI
      // renders an empty value as a dash.
      createdAt: "",
      // The flag every guard below keys on, and the flag listUsers() forwards
      // so the UI can grey out controls the server is going to refuse anyway.
      envDefined: true,
    });
  }

  return accounts;
}

// Case-insensitive, and it returns the env account's own spelling so callers can
// quote the name the operator actually wrote. "" when the name is not an env
// account.
function envAccountName(value) {
  const wanted = (typeof value === "string" ? value.trim() : "").toLowerCase();

  if (!wanted) return "";

  for (const username of envAccounts().keys()) {
    if (username.toLowerCase() === wanted) return username;
  }

  return "";
}

function isEnvAccount(username) {
  return envAccountName(username) !== "";
}

// Reads the file store fresh every call rather than caching it in module state.
// The file is tiny, and a cache would mean an operator editing users.json (to
// revoke an account, say) has no effect until a restart.
//
// File records carry envDefined: false explicitly. A missing flag would read as
// falsy anyway, but a guard that depends on a field being absent is one careless
// spread away from being wrong.
function readFileUsers() {
  const file = storeFile();
  const users = new Map();

  let raw;

  try {
    raw = fs.readFileSync(file, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return users; // first boot: nothing to read

    throw new Error(
      `Could not read the user store ${file}: ${error.code || error.message}`,
    );
  }

  // A zero-byte or whitespace-only file holds no accounts, so there is nothing
  // to protect by refusing it. `touch users.json` before first start is a
  // reasonable thing for an operator to do; treat it as empty.
  if (raw.trim() === "") return users;

  let parsed;

  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `The user store ${file} is not valid JSON (${error.message}). Fix or move the file; the runner will not overwrite it.`,
    );
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(
      `The user store ${file} must contain a JSON object like {"version":1,"users":[]}.`,
    );
  }

  // An unknown version means a newer build wrote fields this one would silently
  // drop on the next write. Refuse rather than downgrade the file.
  if (parsed.version !== undefined && parsed.version !== FILE_VERSION) {
    throw new Error(
      `The user store ${file} is version ${JSON.stringify(parsed.version)}, but this build only understands version ${FILE_VERSION}.`,
    );
  }

  if (!Array.isArray(parsed.users)) {
    throw new Error(
      `The user store ${file} is missing its "users" array. Expected {"version":1,"users":[]}.`,
    );
  }

  parsed.users.forEach((entry, index) => {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(
        `The user store ${file} has a malformed entry at users[${index}]: expected an object.`,
      );
    }

    const { username, hash, role, createdAt } = entry;

    if (typeof username !== "string" || !USERNAME_PATTERN.test(username)) {
      throw new Error(
        `The user store ${file} has an invalid username at users[${index}]. Usernames may contain letters, digits, dot, underscore, at and hyphen, up to 64 characters.`,
      );
    }

    if (typeof hash !== "string" || hash.trim() === "") {
      throw new Error(
        `The user store ${file} has an empty password hash for "${username}" at users[${index}]. Remove the entry or reissue the account.`,
      );
    }

    // A duplicate is ambiguous - we cannot know which record is the live one,
    // and picking either could either restore a revoked account or drop a real
    // one. Make the operator resolve it.
    if (users.has(username)) {
      throw new Error(
        `The user store ${file} lists "${username}" more than once. Remove the duplicate entry.`,
      );
    }

    users.set(username, {
      username,
      hash,
      // An unrecognised role (a hand-edited "Admin", a role from a future
      // build) is downgraded rather than rejected: least privilege is the safe
      // direction, and a typo should not lock everyone out of the runner.
      role: ROLES.includes(role) ? role : "user",
      createdAt: typeof createdAt === "string" ? createdAt : "",
      envDefined: false,
    });
  });

  return users;
}

// Env accounts first, then file accounts, which is also the order the UI shows:
// the accounts an operator declared, then the accounts that grew afterwards.
//
// A file record whose name matches an env account is dropped, not merged. Half
// of one record and half of the other is the one outcome nobody could reason
// about, and the env is the authority - so the file copy is ignored whole, and
// the operator is told once, because an account they can see but cannot edit is
// otherwise a mystery.
function mergeAccounts(envUsers, fileUsers) {
  const merged = new Map(envUsers);
  const claimed = new Set();

  for (const username of envUsers.keys()) {
    claimed.add(username.toLowerCase());
  }

  for (const [username, record] of fileUsers) {
    if (claimed.has(username.toLowerCase())) {
      warnOnce(
        shadowWarned,
        username.toLowerCase(),
        `[store] "${username}" is defined in TR_USERS, so the record of the same name in the user store file is ignored. Remove it from the file, or remove it from TR_USERS.`,
      );
      continue;
    }

    merged.set(username, record);
  }

  return merged;
}

// The whole store, both halves, as the auth layer sees it. Every record has
// username, hash, role, createdAt and envDefined.
//
// A file half this process cannot read is fatal on purpose - server.js turns a
// status-less error into a generic 500 and logs the reason, and refusing to read
// is what keeps a damaged file from being replaced by a freshly built one. That
// guarantee is untouched here: every write path below calls readFileUsers()
// directly and still throws.
//
// For a read, though, there is a better answer when the environment declared
// accounts. Those accounts are not in the file and nothing about them is in
// doubt, so serving them lets an operator sign in and diagnose the store instead
// of finding every request answering 500. On a host with no persistent disk that
// is a plausible first-boot state rather than an exotic one, and it invents no
// privilege: an env account was declared by whoever runs the deployment.
function readUsers() {
  const envUsers = envAccounts();

  let fileUsers;

  try {
    fileUsers = readFileUsers();
  } catch (error) {
    if (envUsers.size === 0) throw error;

    warnOnce(
      fileReadWarned,
      error.message,
      `[store] ${error.message} Serving the ${envUsers.size} account(s) from TR_USERS only; sign-up and account administration stay unavailable until the store is readable.`,
    );

    return envUsers;
  }

  return mergeAccounts(envUsers, fileUsers);
}

// Why self-signup cannot work right now, in words that are safe to hand an
// unauthenticated visitor, or "" when it can.
//
// readUsers() deliberately falls back to the TR_USERS half when the file cannot
// be read. That is right for signing in - an env account needs no disk - and
// wrong for signing up, because a new account has to be written to the file. So
// a signup used to sail past the uniqueness check and a 100ms scrypt derivation
// before addUser() re-read the file and threw a status-less error, which the
// HTTP layer can only render as "The test runner hit an unexpected error." A
// colleague reading that goes hunting for an outage when the true answer is
// "ask an operator for an account".
//
// The returned string carries no path by contract: it is on its way to a browser
// and to a visitor with no account at all. The path goes to the log, once.
function signupBlockedReason() {
  try {
    readFileUsers();
  } catch (error) {
    warnOnce(
      signupProbeWarned,
      error.message,
      `[store] self-signup is unavailable: ${error.message}`,
    );

    return "This runner's user store cannot be read, so it cannot create new accounts.";
  }

  return "";
}

// Counts both halves. This number decides whether the UI offers a sign-up form
// as the first thing a visitor sees, and whether addUser() below treats the next
// account as the founding administrator, so leaving env accounts out of it would
// hand a stranger an admin account on a runner that already has one.
function countUsers() {
  return readUsers().size;
}

// Atomic by construction: the store is written to a sibling temp file and then
// renamed over the real one. Rename within a directory is atomic, so a crash or
// a full disk leaves either the old complete file or the new complete file -
// never a truncated one. Writing in place would trade the whole account list
// for a power cut.
//
// Records are rebuilt field by field, and env accounts are dropped rather than
// trusted not to be here. Every caller below builds its map from
// readFileUsers(), so an env account should never reach this function; if a
// future edit passes the merged map instead, an env account must not be copied
// to disk. That copy would put a password hash in a file the operator never
// wrote, and it would come back to life as an editable account the moment
// TR_USERS changed - the exact confusion the immutability rule exists to avoid.
function writeUsers(users) {
  const file = storeFile();
  const temporaryFile = `${file}.tmp`;

  const records = [];

  for (const record of users.values()) {
    if (record && record.envDefined) continue;

    records.push({
      username: record.username,
      hash: record.hash,
      role: record.role,
      createdAt: record.createdAt,
    });
  }

  const payload = { version: FILE_VERSION, users: records };

  // Two spaces and a trailing newline: this file gets hand-edited and diffed
  // during an incident, and being readable then is worth the extra bytes.
  const json = `${JSON.stringify(payload, null, 2)}\n`;

  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });

    // 0o600 because the file holds password hashes. Windows ignores the mode,
    // so on Windows the containing directory ACL is the real protection.
    fs.writeFileSync(temporaryFile, json, { encoding: "utf8", mode: 0o600 });
    fs.renameSync(temporaryFile, file);
  } catch (error) {
    // Leave no half-written stub behind to confuse the next person looking at
    // the directory. Failing to clean up must not mask the original error.
    try {
      fs.unlinkSync(temporaryFile);
    } catch {
      // Nothing useful to do: the write already failed and is being reported.
    }

    throw new Error(
      `Could not write the user store ${file}: ${error.code || error.message}`,
    );
  }
}

// The one message for "this account lives in the environment". Stated once so
// every path that refuses an env account refuses it the same way, and so the
// person reading it is told where the change actually has to be made.
function envAccountError(username, action) {
  const error = new Error(
    `"${username}" is defined in the environment (TR_USERS), so it cannot be ${action} here. Change TR_USERS on the host and restart the runner.`,
  );

  // 409 rather than 403: the caller is allowed to do this, and to other
  // accounts it would have worked. It is this account that is in the wrong
  // state for the request - the same reasoning as the last-administrator guard.
  error.statusCode = 409;

  return error;
}

function addUser(user) {
  const source = user && typeof user === "object" ? user : {};
  const username =
    typeof source.username === "string" ? source.username.trim() : "";
  const hash = typeof source.hash === "string" ? source.hash.trim() : "";

  if (!USERNAME_PATTERN.test(username)) {
    const error = new Error(
      "Username may contain letters, digits, dot, underscore, at and hyphen, up to 64 characters.",
    );
    error.statusCode = 400;
    throw error;
  }

  if (!hash) {
    const error = new Error("A password hash is required.");
    error.statusCode = 400;
    throw error;
  }

  // This read is also the safety net: a corrupt or unreadable store throws here
  // and the write below never happens, so a damaged file cannot be replaced by
  // a fresh one containing only the newest account.
  const fileUsers = readFileUsers();
  const envUsers = envAccounts();
  const merged = mergeAccounts(envUsers, fileUsers);

  // Compared case-insensitively even though lookups are exact. Letting "Alice"
  // and "alice" both exist gives two people near-identical logins and makes the
  // next support conversation impossible.
  //
  // Both halves are checked, and the message is identical either way. A signup
  // against an env-defined name is a duplicate like any other, and answering it
  // differently would turn this form into a way to enumerate which accounts the
  // operator declared.
  const taken = [...merged.keys()].some(
    (existing) => existing.toLowerCase() === username.toLowerCase(),
  );

  if (taken) {
    const error = new Error(`The username "${username}" is already taken.`);
    error.statusCode = 409;
    throw error;
  }

  // The role is derived here and any role on the incoming object is ignored on
  // purpose. This function is reached from a signup request body, and a body
  // that could name its own role could hand itself admin.
  //
  // First account in an empty store is the admin: whoever stands the runner up
  // needs to be able to administer it, and there is nobody to grant it to them.
  // "Empty" counts both halves - a runner with an administrator in TR_USERS is
  // not empty, and a stranger signing up on it must not be handed admin.
  const role = merged.size === 0 ? "admin" : "user";

  fileUsers.set(username, {
    username,
    hash,
    role,
    createdAt: new Date().toISOString(),
    envDefined: false,
  });

  writeUsers(fileUsers);
}

// Every mutation below goes through here, so there is exactly one definition of
// "no such user", exactly one read-before-write, and exactly one place that
// refuses an account the environment owns. The read matters as much as the
// lookup: like addUser, it throws on a store we cannot parse, so a damaged file
// can never be replaced by a freshly built one that has silently lost every
// account we failed to understand.
//
// Returns the FILE map, never the merged one. What comes back from here is
// about to be handed to writeUsers().
function loadForUpdate(value, action) {
  const username = typeof value === "string" ? value.trim() : "";

  // Before the 404, because an env account does exist - an administrator can
  // see it in the list. Answering "there is no such user" would send them
  // hunting for a bug instead of telling them where the account is defined.
  const envName = envAccountName(username);

  if (envName) throw envAccountError(envName, action);

  const users = readFileUsers();
  const record = username ? users.get(username) : undefined;

  if (!record) {
    // 404 even for a blank or malformed name. The caller asked us to change an
    // account that is not here, and which of those two reasons it is tells an
    // administrator nothing they can act on.
    const error = new Error(`There is no user "${username}".`);
    error.statusCode = 404;
    throw error;
  }

  return { users, record };
}

// The administrative view of the store. Hashes are omitted by construction: the
// returned objects are built field by field rather than copied and pruned,
// because this list is on its way to an HTTP response, and a hash should have to
// be added deliberately to leave this module rather than merely forgotten in it.
//
// Order is env accounts first, then file accounts in creation order - readUsers
// preserves file order and addUser appends - so an administrator watching the
// list sees it grow downwards.
//
// envDefined travels with each row so the UI can show which accounts it cannot
// edit. Without it the buttons look live and every click comes back a 409.
function listUsers() {
  return [...readUsers().values()].map((record) => ({
    username: record.username,
    role: record.role,
    createdAt: record.createdAt,
    envDefined: record.envDefined === true,
  }));
}

function deleteUser(username) {
  const { users, record } = loadForUpdate(username, "deleted");

  users.delete(record.username);

  writeUsers(users);
}

// The role is checked before the store is read, so a bad call costs no file
// read, and a caller that passes "Admin" hears about it rather than quietly
// receiving the downgrade readFileUsers applies to roles it does not recognise.
function setRole(username, role) {
  if (!ROLES.includes(role)) {
    const error = new Error(`Role must be one of: ${ROLES.join(", ")}.`);
    error.statusCode = 400;
    throw error;
  }

  const { users, record } = loadForUpdate(username, "re-roled");

  // Map.set on an existing key keeps that key's position, so rewriting a record
  // does not reshuffle the file and turn a one-field change into a noisy diff.
  users.set(record.username, { ...record, role });

  writeUsers(users);
}

// Deliberately incurious about the hash format: auth.js owns what a hash looks
// like and how it is verified. All this file has to refuse is an empty one,
// which would otherwise write a record readFileUsers rejects on the next boot.
function setPasswordHash(username, hash) {
  const next = typeof hash === "string" ? hash.trim() : "";

  if (!next) {
    const error = new Error("A password hash is required.");
    error.statusCode = 400;
    throw error;
  }

  const { users, record } = loadForUpdate(username, "given a new password");

  users.set(record.username, { ...record, hash: next });

  writeUsers(users);
}

module.exports = {
  readUsers,
  addUser,
  countUsers,
  // Exported so auth.js can refuse a signup that cannot land with an honest
  // reason, before it spends a derivation finding out.
  signupBlockedReason,
  listUsers,
  deleteUser,
  setRole,
  setPasswordHash,
  // Exported so auth.js can refuse an env account with an action-specific
  // message before it spends a scrypt derivation on a reset that cannot land.
  isEnvAccount,
  envAccountName,
};
