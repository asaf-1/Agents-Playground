// Configuration for the standalone remote test runner.
//
// This app shares nothing with the demo application in the parent repository -
// no modules, no config file, no environment prefix. Every setting arrives as a
// TR_* environment variable, so a deployment is fully described by its env,
// which is the only thing container platforms and CI secret stores hand us
// reliably.
//
// config() re-reads process.env on every call and caches nothing. That costs a
// few microseconds per request and buys two things worth more: a test can flip
// an env var between assertions without module-cache surgery, and there is no
// window in which the process acts on a value the operator has already changed.
//
// Nothing in this module throws. A misconfigured runner must still boot far
// enough to serve a page explaining what is broken - a process that exits on a
// bad env var tells the operator nothing except that it exited. Problems are
// collected for the caller to render, so a caller that needs a working setting
// (a token, a repo) has to check `errors` or `hasToken` before acting on one.
//
// --- Two audiences, two strings --------------------------------------------
//
// Every configuration problem is recorded twice, and the split is not cosmetic.
//
// An operator needs the offending value to fix anything: the path that is not
// writable, the URL that will not parse, how short the invite code is. But
// these strings travel: /api/flows and /api/dashboard hand them to anybody with
// an account, including a plain "user" who is entitled to none of it. The
// character length of TR_INVITE_CODE is a direct hint for guessing the one
// secret a stranger can guess; TR_CATALOG_URL may be a signed link; the users
// file path names the file holding every password hash.
//
// So:
//   * `errors` holds the PUBLIC summary of each problem. It names the variable
//     and the fix, and never the value, its length, or any path. This is the
//     one list that may reach a browser, and it is deliberately the plainly
//     named field so that the safe thing is what a caller reaches for first.
//   * `errorDetails` holds the OPERATOR detail, with the values in it. Admin
//     eyes and the server log only.
//   * `errorReports` pairs them, for a caller that wants to choose by audience.
//
// Details are also written to the log here, once each, so an operator never
// depends on a UI to see them.
//
// Dependency direction is one-way: store.js requires config.js, never the
// reverse. Keep it that way, or the user store and its configuration become a
// cycle.

const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_PORT = 4300;
const DEFAULT_REF = "main";
const DEFAULT_WORKFLOW = "remote-test-runner.yml";
const DEFAULT_CATALOG_PATH = "scripts/test-runner/flow-catalog.json";
const DEFAULT_PIPELINE_CONFIG_PATH = "pipeline.config.json";
const DEFAULT_SESSION_HOURS = 12;

// The app reads two files out of the repository - the flow catalog and
// pipeline.config.json, which owns the environment list - and it has no
// checkout of either, so both are addressed the same three ways: a local file
// for development, a raw URL, and the contents API on cfg.ref.
//
// One set of validators serves both, parameterised by these descriptors rather
// than copied per file. The only real difference between the two is which list
// the operator loses when a value is bad, and that difference belongs in a
// string, not in a second copy of the same URL and path checks that would drift
// the first time one of them is fixed.
const CATALOG_SOURCE = {
  urlVariable: "TR_CATALOG_URL",
  pathVariable: "TR_CATALOG_PATH",
  localVariable: "TR_LOCAL_CATALOG",
  defaultPath: DEFAULT_CATALOG_PATH,
  list: "flow list",
  file: "flow catalog JSON file",
  defaultLabel: "default catalog path",
  fetchLabel: "the catalog",
};

const PIPELINE_CONFIG_SOURCE = {
  urlVariable: "TR_PIPELINE_CONFIG_URL",
  pathVariable: "TR_PIPELINE_CONFIG_PATH",
  localVariable: "TR_LOCAL_PIPELINE_CONFIG",
  defaultPath: DEFAULT_PIPELINE_CONFIG_PATH,
  list: "environment list",
  file: "pipeline config JSON file",
  defaultLabel: "default pipeline config path",
  fetchLabel: "the environment list",
};

// "invite" is the default rather than "open" on purpose. If this runner is ever
// reachable beyond the office network, open signup hands strangers a button
// that burns CI minutes on somebody else account quota.
const DEFAULT_SIGNUP_MODE = "invite";
const SIGNUP_MODES = ["invite", "open", "off"];

// The invite code is the only secret an unauthenticated stranger can guess, and
// guessing it is cheap: a wrong code is refused before any password hashing
// happens, so nothing on the reject path slows an attacker down. A live server
// answered ~2,800 wrong codes per second under test. At that rate a code a human
// chose and can remember falls in minutes, and the payoff is total - store.js
// makes the first account in an empty store an administrator, so on a fresh
// deployment a guessed code is a full administrator, which includes the power to
// start workflow runs with this app's GitHub token.
//
// 24 characters of randomness is the floor at which that rate stops mattering.
const MIN_INVITE_CODE_LENGTH = 24;

// --- TR_USERS --------------------------------------------------------------
//
// Accounts carried in the environment, for a host with no persistent disk.
// Render's free tier is the case that forced this: every restart and every
// redeploy replaces the filesystem, so a disk-backed users.json means every
// account disappears and the next person to sign up becomes the administrator.
// An account in the env survives a restart because the env does.
//
// The pattern is auth.js's sign-in shape, not store.js's looser file shape, and
// deliberately the stricter of the two: store.js accepts names the login form
// rejects ("@", one-character names), and an entry here that cannot be typed
// into the login form is an account nobody can ever use. Worse, an unusable
// entry with the admin role would satisfy the "no administrator" check below
// while leaving the runner with no administrator at all. So it is refused, with
// a reason, rather than quietly created.
//
// Restated rather than imported because both auth.js and store.js require this
// module, and importing either back would make a cycle. It has to stay in step
// with auth.js's USERNAME_PATTERN by hand.
const ENV_USER_PATTERN = /^[A-Za-z0-9._-]{3,32}$/;
const ENV_USER_ROLES = ["admin", "user"];
const DEFAULT_ENV_USER_ROLE = "user";

// config() re-parses TR_USERS on every call, so the list has to stay small
// enough that parsing it is free. A hundred accounts is far past "a handful of
// colleagues", which is the whole scale this app is built for.
const MAX_ENV_USERS = 100;

// scrypt$N$r$p$<salt>$<derived>, the format auth.js writes. Six non-empty
// fields is all this module checks - see looksLikeScryptHash.
const HASH_FIELD_COUNT = 6;
const HASH_ALGORITHM = "scrypt";

// GitHub owner/repo: word characters, dots and hyphens on each side. Anchored,
// because this value is interpolated into API paths.
const REPO_PATTERN = /^[\w.-]+\/[\w.-]+$/;

// A workflow file name, not a path. Rejecting separators here is what stops a
// stray TR_WORKFLOW from walking out of .github/workflows/ in the URL we build.
const WORKFLOW_PATTERN = /^[\w.-]+\.(yml|yaml)$/;

// Details are logged at most once each per process. config() runs on every
// request, so logging on every call would bury the log in copies of one
// problem, and the values in a detail are exactly what an operator scrolls back
// looking for.
const loggedDetails = new Set();
const MAX_LOGGED_DETAILS = 200;

function logDetail(detail) {
  if (loggedDetails.has(detail)) return;

  // Past the cap, forget everything and start over rather than going quiet: a
  // set that stopped accepting entries would silence the newest problem, which
  // is the one an operator is most likely hunting for.
  if (loggedDetails.size >= MAX_LOGGED_DETAILS) loggedDetails.clear();

  loggedDetails.add(detail);
  console.warn(`[config] ${detail}`);
}

// Collects both halves of every problem.
//
// The public summary is built as "<VARIABLE>: <summary>" rather than trusting
// each call site to name the variable in prose. Two reasons: a colleague who
// can act on nothing else can still quote the variable to an operator, and
// server.js de-duplicates its dispatch hints by searching these strings for a
// variable name - a summary that forgot to mention it would show the same
// problem twice in different words.
function createProblems() {
  const reports = [];

  return {
    add(variable, summary, detail) {
      reports.push({ variable, summary: `${variable}: ${summary}`, detail });
      logDetail(detail);
    },
    summaries() {
      return reports.map((report) => report.summary);
    },
    details() {
      return reports.map((report) => report.detail);
    },
    reports() {
      return reports.map((report) => ({ ...report }));
    },
  };
}

// Env values are trimmed everywhere. Copy-pasted tokens and invite codes pick
// up trailing whitespace and newlines constantly, and a credential that fails
// auth because of one invisible character is a miserable afternoon.
function env(name) {
  const raw = process.env[name];

  return typeof raw === "string" ? raw.trim() : "";
}

// Origin and path only, never the query string.
//
// A catalog URL may be a signed link, and the signature lives in the query.
// This is the same rule github.js applies to the strings it returns; it is
// restated here because config.js must not require github.js (github.js
// requires this module, and the pair would be a cycle). Used even in the
// operator detail: a log line gets pasted into a chat window sooner or later.
function urlLabel(value) {
  try {
    const url = new URL(value);

    return `${url.origin}${url.pathname}`;
  } catch {
    // Nothing to redact in a value that is not a URL at all, and the operator
    // needs to see what they actually typed.
    return `"${value}"`;
  }
}

function readPort(problems) {
  const raw = env("TR_PORT");

  if (!raw) return DEFAULT_PORT;

  const port = Number(raw);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    problems.add(
      "TR_PORT",
      `is not a whole number between 1 and 65535, so the runner is listening on its default port ${DEFAULT_PORT}.`,
      `TR_PORT must be a whole number between 1 and 65535 (got "${raw}"). Falling back to ${DEFAULT_PORT}.`,
    );
    return DEFAULT_PORT;
  }

  return port;
}

// An invalid value comes back as "" rather than echoed through. A caller that
// receives a string is entitled to assume it can be used; handing back a value
// we have already proved unusable only moves the failure somewhere less
// obvious. The rejected input is quoted in the operator detail instead.
function readRepo(problems) {
  const repo = env("TR_REPO");

  if (!repo) {
    problems.add(
      "TR_REPO",
      "is not set, so the runner does not know which repository to start runs in. An operator has to set it.",
      'TR_REPO is not set. Set it to "owner/repo" so the runner knows which repository to dispatch workflow runs to.',
    );
    return "";
  }

  if (!REPO_PATTERN.test(repo)) {
    problems.add(
      "TR_REPO",
      'is not in "owner/repo" form, so no run can be started. An operator has to correct it.',
      `TR_REPO must look like "owner/repo", with no protocol, spaces or trailing slash (got "${repo}").`,
    );
    return "";
  }

  return repo;
}

function readWorkflowFile(problems) {
  const workflowFile = env("TR_WORKFLOW");

  if (!workflowFile) return DEFAULT_WORKFLOW;

  if (!WORKFLOW_PATTERN.test(workflowFile)) {
    problems.add(
      "TR_WORKFLOW",
      `is not a single workflow file name ending in .yml or .yaml, so the runner fell back to ${DEFAULT_WORKFLOW}.`,
      `TR_WORKFLOW must be a single workflow file name ending in .yml or .yaml, not a path (got "${workflowFile}"). Falling back to ${DEFAULT_WORKFLOW}.`,
    );
    return DEFAULT_WORKFLOW;
  }

  return workflowFile;
}

// The token is never quoted back, in either half. Even the operator detail
// stays clear of it: a leaked token is the one failure mode this entire app
// exists to prevent, and a log line is a copy of the message with a longer
// life than the response.
function readToken(problems) {
  const token = env("TR_GITHUB_TOKEN");

  if (!token) {
    problems.add(
      "TR_GITHUB_TOKEN",
      "is not set, so no run can be started. An operator has to add a token.",
      "TR_GITHUB_TOKEN is not set. The runner cannot start a workflow run without it: create a fine-grained token with Actions read and write on the target repository.",
    );
    return "";
  }

  // A token wrapped in quotes is the classic .env mistake - the quotes survive
  // into the value, GitHub answers 401, and the value looks fine in a log.
  if (/^["']|["']$/.test(token)) {
    problems.add(
      "TR_GITHUB_TOKEN",
      "is set but malformed, so GitHub is likely to reject it. An operator has to re-enter it.",
      "TR_GITHUB_TOKEN starts or ends with a quote character. Remove the surrounding quotes: the value is used verbatim in the Authorization header.",
    );
  }

  return token;
}

function readSignupMode(problems) {
  const raw = env("TR_SIGNUP_MODE").toLowerCase();

  if (!raw) return DEFAULT_SIGNUP_MODE;

  if (!SIGNUP_MODES.includes(raw)) {
    problems.add(
      "TR_SIGNUP_MODE",
      `is not one of ${SIGNUP_MODES.join(", ")}, so the runner fell back to "${DEFAULT_SIGNUP_MODE}".`,
      `TR_SIGNUP_MODE must be one of ${SIGNUP_MODES.join(", ")} (got "${raw}"). Falling back to "${DEFAULT_SIGNUP_MODE}".`,
    );
    return DEFAULT_SIGNUP_MODE;
  }

  return raw;
}

function readSessionHours(problems) {
  const raw = env("TR_SESSION_HOURS");

  if (!raw) return DEFAULT_SESSION_HOURS;

  const hours = Number(raw);

  // Capped at 30 days. A session that outlives the laptop it was created on is
  // not a convenience, it is an unrevoked credential.
  if (!Number.isFinite(hours) || hours <= 0 || hours > 720) {
    problems.add(
      "TR_SESSION_HOURS",
      `is not a positive number of hours up to 720, so sessions last the default ${DEFAULT_SESSION_HOURS} hours.`,
      `TR_SESSION_HOURS must be a positive number of hours, at most 720 (got "${raw}"). Falling back to ${DEFAULT_SESSION_HOURS}.`,
    );
    return DEFAULT_SESSION_HOURS;
  }

  return hours;
}

// Exactly "true" per the contract, but a near miss is worth shouting about: a
// deployment that meant to set Secure and typed "True" serves its session
// cookie over plaintext, and nothing in the UI would ever reveal it.
function readSecureCookie(problems) {
  const raw = env("TR_SECURE_COOKIE");

  if (raw && raw !== "true" && raw !== "false") {
    problems.add(
      "TR_SECURE_COOKIE",
      'is not exactly "true" or "false", lowercase, so it counts as false and the session cookie is sent without the Secure attribute.',
      `TR_SECURE_COOKIE must be exactly "true" or "false", lowercase (got "${raw}"). Anything else counts as false, which sends the session cookie without the Secure attribute.`,
    );
  }

  return raw === "true";
}

// Same exact-"true" contract as TR_SECURE_COOKIE, and the same reason to shout
// about a near miss - but the wrong direction here is worse than a missing
// cookie attribute. With trustProxy on, X-Forwarded-For decides the rate-limit
// bucket, so switching it on without a proxy that overwrites that header lets
// any caller choose their own bucket and walk past every per-IP limit in the
// app. Off is the safe default, and it stays off unless the value is exactly
// "true".
function readTrustProxy(problems) {
  const raw = env("TR_TRUST_PROXY");

  if (raw && raw !== "true" && raw !== "false") {
    problems.add(
      "TR_TRUST_PROXY",
      'is not exactly "true" or "false", lowercase, so it counts as false and rate limiting stays keyed on the socket address.',
      `TR_TRUST_PROXY must be exactly "true" or "false", lowercase (got "${raw}"). Anything else counts as false, which keeps rate limiting keyed on the socket address.`,
    );
  }

  return raw === "true";
}

function readSourceUrl(problems, source) {
  const value = env(source.urlVariable);

  if (!value) return "";

  let parsed;

  try {
    parsed = new URL(value);
  } catch {
    problems.add(
      source.urlVariable,
      `is not a valid URL, so the ${source.list} is read from the repository instead.`,
      `${source.urlVariable} is not a valid URL (got ${urlLabel(value)}).`,
    );
    return "";
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    problems.add(
      source.urlVariable,
      `is not an http or https URL, so the ${source.list} is read from the repository instead.`,
      `${source.urlVariable} must be an http or https URL (got protocol "${parsed.protocol}").`,
    );
    return "";
  }

  // A /blob/ link serves the GitHub HTML page, not JSON. Everybody makes this
  // mistake once, and the resulting parse error points at the fetch code rather
  // than at the setting that caused it.
  if (parsed.hostname === "github.com" && parsed.pathname.includes("/blob/")) {
    problems.add(
      source.urlVariable,
      `points at a page that returns HTML rather than JSON, so the ${source.list} may be empty.`,
      `${source.urlVariable} points at a github.com /blob/ page, which returns HTML (${urlLabel(value)}). Use the raw.githubusercontent.com URL instead.`,
    );
  }

  return value;
}

// Repository-relative and POSIX-style: this path is resolved by GitHub, not by
// us, so a leading slash or a ".." segment cannot mean anything useful and is
// almost always an absolute local path typed into the wrong variable.
function readSourcePath(problems, source) {
  const value = env(source.pathVariable);

  if (!value) return source.defaultPath;

  const invalid =
    value.startsWith("/") ||
    value.includes("\\") ||
    value.split("/").includes("..");

  if (invalid) {
    problems.add(
      source.pathVariable,
      `is not a repository-relative path, so the runner fell back to its ${source.defaultLabel}.`,
      `${source.pathVariable} must be a repository-relative path using forward slashes, with no ".." segments (got "${value}"). Falling back to ${source.defaultPath}.`,
    );
    return source.defaultPath;
  }

  return value;
}

// Resolved to absolute so every consumer reads the same file no matter what the
// process working directory is, which changes the moment this runs under a
// service manager instead of a terminal.
//
// The resolved path appears in the operator detail only. An absolute path
// describes the host's filesystem layout, which is nobody's business but the
// operator's.
function readLocalSource(problems, source) {
  const raw = env(source.localVariable);

  if (!raw) return "";

  const resolved = path.resolve(raw);

  try {
    if (!fs.statSync(resolved).isFile()) {
      problems.add(
        source.localVariable,
        `does not point at a file, so the ${source.list} is read from the repository instead.`,
        `${source.localVariable} is not a file: ${resolved}. Point it at a ${source.file}.`,
      );
      return "";
    }
  } catch {
    problems.add(
      source.localVariable,
      `points at a file that does not exist, so the ${source.list} is read from the repository instead.`,
      `${source.localVariable} does not exist: ${resolved}. Point it at a ${source.file}, or unset it to fetch ${source.fetchLabel} from the repository.`,
    );
    return "";
  }

  return resolved;
}

function readUsersFile() {
  const raw = env("TR_USERS_FILE");

  if (raw) return path.resolve(raw);

  // The default lives beside this app rather than under the parent repository,
  // so a git clean or a fresh checkout cannot take everybody accounts with it.
  return path.join(__dirname, "..", "data", "users.json");
}

// Shape only, and deliberately incurious beyond that. auth.js owns what a hash
// means and how it is verified; a second opinion here would be a second thing
// to keep in step. The check exists so a truncated paste is reported to the
// operator as a broken entry now, rather than becoming an account that looks
// real in the UI and that nobody can ever sign in to.
function looksLikeScryptHash(value) {
  const parts = value.split("$");

  return (
    parts.length === HASH_FIELD_COUNT &&
    parts[0] === HASH_ALGORITHM &&
    parts.every((part) => part !== "")
  );
}

// Accounts from TR_USERS.
//
// Entry form: "username:hash" or "username:role:hash", role being admin or
// user. Separated by newlines or commas, because both shapes turn up: a hosting
// dashboard's multi-line field takes newlines happily, a docker-compose
// one-liner does not.
//
// A malformed entry is reported and skipped, never fatal. One typo in a list of
// five accounts must not take the whole runner down - and the operator who has
// to fix it may well be locked out of everything else while it is down.
//
// Hashes are never quoted back in either half of a problem. They are password
// hashes: the log is not the place for them, and a length is a hint.
function readEnvUsers(problems) {
  const raw = env("TR_USERS");

  if (!raw) return [];

  const entries = raw
    .split(/[\n,]+/)
    .map((entry) => entry.trim())
    // A "#" line is a comment. Operators annotate multi-line env values, and an
    // annotation should not turn into a broken account.
    .filter((entry) => entry !== "" && !entry.startsWith("#"));

  const accounts = [];
  const seen = new Set();
  const considered = entries.slice(0, MAX_ENV_USERS);

  if (entries.length > considered.length) {
    problems.add(
      "TR_USERS",
      `lists more than ${MAX_ENV_USERS} accounts, and the entries past that limit were ignored.`,
      `TR_USERS lists ${entries.length} entries; only the first ${MAX_ENV_USERS} were read. This value is parsed on every request, so the list is capped. Move the extra accounts into the user store.`,
    );
  }

  considered.forEach((entry, index) => {
    // 1-based: the operator counts entries in their env var, not array slots.
    const position = index + 1;
    const separator = entry.indexOf(":");

    if (separator <= 0) {
      problems.add(
        "TR_USERS",
        `entry ${position} could not be read, so that account does not exist. An operator has to fix the entry.`,
        `TR_USERS entry ${position} is not "username:hash" or "username:role:hash". No account was created for it.`,
      );
      return;
    }

    const username = entry.slice(0, separator).trim();
    let rest = entry.slice(separator + 1).trim();
    let role = DEFAULT_ENV_USER_ROLE;

    // The role field is optional, so it is recognised rather than assumed: a
    // scrypt hash contains no colon, which is what makes "is there a role
    // here?" answerable without ambiguity. Anything else in that position stays
    // part of the hash and fails the shape check below - with a message that
    // names both possibilities, because "admni" lands here.
    const roleSeparator = rest.indexOf(":");

    if (roleSeparator > 0) {
      const candidate = rest.slice(0, roleSeparator).trim().toLowerCase();

      if (ENV_USER_ROLES.includes(candidate)) {
        role = candidate;
        rest = rest.slice(roleSeparator + 1).trim();
      }
    }

    if (!ENV_USER_PATTERN.test(username)) {
      problems.add(
        "TR_USERS",
        `entry ${position} has a username the runner will not accept, so that account does not exist.`,
        `TR_USERS entry ${position} has a username nobody could sign in with ("${username}"). It must be 3-32 characters, using letters, digits, dot, underscore or hyphen - the same shape the sign-in form accepts.`,
      );
      return;
    }

    if (!looksLikeScryptHash(rest)) {
      problems.add(
        "TR_USERS",
        `entry ${position} does not carry a usable password hash, so that account does not exist.`,
        `TR_USERS entry ${position} ("${username}") does not carry a scrypt hash in the form scrypt$N$r$p$salt$derived. Expected "username:hash" or "username:${ENV_USER_ROLES.join("|")}:hash" - a misspelled role lands here too.`,
      );
      return;
    }

    // Case-insensitively, because store.js treats usernames that way: letting
    // "Alice" and "alice" both exist gives two people near-identical logins.
    // The first entry wins, so re-ordering the variable cannot silently change
    // which record is live.
    if (seen.has(username.toLowerCase())) {
      problems.add(
        "TR_USERS",
        `entry ${position} repeats a username listed earlier, and the later entry was ignored.`,
        `TR_USERS entry ${position} repeats the username "${username}". Only the first entry for a name is used; remove the duplicate.`,
      );
      return;
    }

    seen.add(username.toLowerCase());
    accounts.push({ username, role, hash: rest });
  });

  // Recommended, not required: an operator may deliberately run env accounts as
  // plain users and administer through a disk-backed account. But on a host
  // with no disk that combination leaves nobody able to manage accounts, and
  // the first stranger to sign up becomes the administrator instead.
  if (
    accounts.length > 0 &&
    !accounts.some((account) => account.role === "admin")
  ) {
    problems.add(
      "TR_USERS",
      "defines no administrator, so no environment account can manage accounts here. An operator should give one entry the admin role.",
      `TR_USERS defines ${accounts.length} account(s) but none with the admin role. Write one of them as "username:admin:<hash>"; otherwise the only administrator is whoever signs up first into the user store, which a diskless host discards on every restart.`,
    );
  }

  return accounts;
}

// Signup creates the user store on demand, so the thing that must be writable
// is the deepest ancestor directory that exists today - store.js creates the
// rest. This check exists because the alternative is discovering the problem in
// the first colleague failed signup, after they already chose a password.
//
// With accounts in TR_USERS this is no longer "the app is broken". Those
// accounts need no disk at all: they sign in, they start runs, they administer.
// The only thing an unwritable store costs is self-signup, and the message says
// so, because an operator who reads "not writable" as "nothing works" goes
// hunting for a disk they do not need.
function checkUsersFileWritable(usersFile, signupMode, envUserCount, problems) {
  if (signupMode === "off") return;

  const stillWorks =
    envUserCount > 0
      ? ` The ${envUserCount} account(s) from TR_USERS are unaffected - they need no disk - so only self-signup is unavailable.`
      : "";

  try {
    if (fs.existsSync(usersFile)) {
      if (fs.statSync(usersFile).isDirectory()) {
        problems.add(
          "TR_USERS_FILE",
          `points at a directory rather than a file, so nobody can sign up here.${stillWorks}`,
          `TR_USERS_FILE points at a directory: ${usersFile}. It must be the path to a JSON file.${stillWorks}`,
        );
        return;
      }

      fs.accessSync(usersFile, fs.constants.W_OK);
      return;
    }

    let probe = path.dirname(usersFile);

    while (!fs.existsSync(probe)) {
      const parent = path.dirname(probe);

      if (parent === probe) break; // hit the filesystem root, stop walking
      probe = parent;
    }

    if (!fs.existsSync(probe) || !fs.statSync(probe).isDirectory()) {
      problems.add(
        "TR_USERS_FILE",
        `points somewhere the user store cannot be created, so nobody can sign up here.${stillWorks}`,
        `The user store cannot be created at ${usersFile}: ${probe} is not a directory. Set TR_USERS_FILE to a writable location.${stillWorks}`,
      );
      return;
    }

    fs.accessSync(probe, fs.constants.W_OK);
  } catch (error) {
    problems.add(
      "TR_USERS_FILE",
      `names a user store the runner cannot write, so nobody can sign up here.${stillWorks} An operator can set TR_SIGNUP_MODE=off to hide the sign-up form.`,
      `TR_SIGNUP_MODE is "${signupMode}" but the user store is not writable: ${usersFile} (${error.code || error.message}).${stillWorks} Set TR_USERS_FILE to a writable path, add accounts to TR_USERS, or set TR_SIGNUP_MODE=off.`,
    );
  }
}

function config() {
  const problems = createProblems();

  const signupMode = readSignupMode(problems);
  const inviteCode = env("TR_INVITE_CODE");
  const usersFile = readUsersFile();
  const envUsers = readEnvUsers(problems);
  const token = readToken(problems);

  if (signupMode === "invite" && !inviteCode) {
    problems.add(
      "TR_INVITE_CODE",
      'is empty while TR_SIGNUP_MODE is "invite", so nobody can sign up. An operator has to set a code or change the mode.',
      'TR_SIGNUP_MODE is "invite" but TR_INVITE_CODE is empty. Nobody can sign up until a code is set, so set one or switch TR_SIGNUP_MODE to "open" or "off".',
    );
  }

  // The length goes in the operator detail and nowhere else. A length is the
  // most useful single fact an attacker can learn about a secret they are
  // guessing, and this app's invite code buys an administrator on an empty
  // store. The public summary still reports that the code is too weak, because
  // a colleague who can see that can go and ask for it to be replaced - which
  // is the only action available to them, and better than silence.
  if (
    signupMode === "invite" &&
    inviteCode &&
    inviteCode.length < MIN_INVITE_CODE_LENGTH
  ) {
    problems.add(
      "TR_INVITE_CODE",
      "is weaker than this runner requires, so sign-up is not really protected. An operator has to replace it with a long random code.",
      `TR_INVITE_CODE is ${inviteCode.length} characters, which is too short to be a control: a wrong code is rejected in well under a millisecond, so a guessable code is guessed. Use at least ${MIN_INVITE_CODE_LENGTH} random characters - generate one with: node -e "console.log(require('node:crypto').randomBytes(24).toString('base64url'))"`,
    );
  }

  // An invite code set in any other mode is dead configuration, and dead
  // configuration here usually means a mode that was meant to be "invite".
  if (signupMode !== "invite" && inviteCode) {
    problems.add(
      "TR_INVITE_CODE",
      `is set but TR_SIGNUP_MODE is "${signupMode}", so the code is ignored.`,
      `TR_INVITE_CODE is set but TR_SIGNUP_MODE is "${signupMode}", so the code is ignored. Set TR_SIGNUP_MODE=invite to enforce it.`,
    );
  }

  checkUsersFileWritable(usersFile, signupMode, envUsers.length, problems);

  return {
    port: readPort(problems),
    repo: readRepo(problems),
    ref: env("TR_REF") || DEFAULT_REF,
    workflowFile: readWorkflowFile(problems),
    token,
    hasToken: token.length > 0,
    signupMode,
    inviteCode,
    usersFile,
    // Immutable accounts carried in the environment. store.js merges these with
    // the file store and refuses to write, delete or re-role them.
    envUsers,
    sessionHours: readSessionHours(problems),
    secureCookie: readSecureCookie(problems),
    trustProxy: readTrustProxy(problems),
    catalogUrl: readSourceUrl(problems, CATALOG_SOURCE),
    catalogPath: readSourcePath(problems, CATALOG_SOURCE),
    localCatalog: readLocalSource(problems, CATALOG_SOURCE),
    // Where the environment list comes from. Same three sources, same
    // precedence, and the same "a bad value costs you the list, not the app"
    // contract: github.js falls back down the ladder and finally to the
    // built-in `pipeline` environment, which needs no configuration to be
    // correct.
    pipelineConfigUrl: readSourceUrl(problems, PIPELINE_CONFIG_SOURCE),
    pipelineConfigPath: readSourcePath(problems, PIPELINE_CONFIG_SOURCE),
    localPipelineConfig: readLocalSource(problems, PIPELINE_CONFIG_SOURCE),
    // The public list. Safe for any signed-in caller: variables and fixes, no
    // values, no lengths, no paths. Keep it that way - this is the field the
    // HTTP layer reaches for.
    errors: problems.summaries(),
    // Operator-only. Values in here. Admin responses and the log, nothing else.
    errorDetails: problems.details(),
    // Both halves paired, for a caller that chooses by audience.
    errorReports: problems.reports(),
  };
}

module.exports = { config };
