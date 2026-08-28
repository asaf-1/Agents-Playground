// GitHub Actions client for the remote test runner.
//
// This is the only file in the app that talks to GitHub. Everything else deals
// in plain objects, which keeps the trust boundary in one place: the token is
// read from config here, travels in an Authorization header, and is never
// returned, thrown, or logged. Colleagues using the app get run status and
// artifact names; they never get repository, pipeline, or token access.
//
// The token also carries actions:write on the whole repository, while the
// people using this app have no repository standing at all. So every operation
// that takes a run id - describing a run, reading its logs, cancelling it -
// proves the run belongs to this app's own workflow before returning or doing
// anything. See requireOwnRun: that check is the difference between "the tests
// you started" and "every CI job in the repository". Metadata counts: job names,
// step names and artifact names describe a pipeline as surely as its log text
// does, so a describe call passes the same gate a cancel does.
//
// Three GitHub quirks shape most of the code below:
//
//   1. workflow_dispatch answers 204 with an empty body. There is no run id in
//      the response, so a started run has to be found by polling.
//   2. workflow_dispatch inputs are all strings, and `type: choice` inputs are
//      validated against their declared options. Sending a number, or a value
//      outside the options, is a 422 rather than a run.
//   3. Cancelling answers 202 with an empty body, and the job-logs endpoint
//      answers 302 to a signed URL whose body is a plain text log file. Neither
//      response is JSON.

const fs = require("node:fs");
const { setTimeout: sleep } = require("node:timers/promises");

const { config } = require("./config.js");

const API_ROOT = "https://api.github.com";
// Covers the whole exchange, headers and body, for every request in this file.
// See fetchTimedText for why a headers-only deadline is not a deadline at all.
const REQUEST_TIMEOUT_MS = 15_000;
const USER_AGENT = "agents-playground-test-runner";

// A deadline bounds how long a peer can hold us; it does not bound how much it
// can make us hold. A response that streams quickly and endlessly fills the
// heap well inside 15s, so every body read below stops at a ceiling.
//
// API responses are JSON we parse into objects. The largest real payload here is
// a 100-job listing at a few hundred kilobytes, so this is generous on purpose:
// it exists to catch something pathological, not to second-guess GitHub.
const MAX_API_BODY_BYTES = 8_000_000;

// The UI polls, and the contents API counts against a shared hourly quota, so
// the parsed catalog is held briefly in memory. A minute is short enough that a
// freshly pushed spec shows up without a restart.
const CATALOG_TTL_MS = 60_000;
// A failed lookup is cached for much less: long enough to stop a polling UI
// from hammering a misconfigured repo, short enough that fixing the config
// feels immediate.
const CATALOG_ERROR_TTL_MS = 10_000;

// A repository file is data we did not author, so cap what we are willing to
// parse. The real catalog is ~40 KB and pipeline.config.json is under a
// kilobyte; anything near this ceiling is a wrong URL.
const MAX_REPO_FILE_BYTES = 4_000_000;

// --- Environments ----------------------------------------------------------
//
// The environment list lives in pipeline.config.json, so adding a deployed
// host is a JSON edit and nothing else. The shape is versioned because a run
// that does not understand the file must refuse it rather than silently ignore
// entries somebody just added.
const ENVIRONMENTS_SCHEMA_VERSION = 1;

// `pipeline` means "the run builds the app from the checked-out commit and
// serves it itself". It is an entry rather than an absence so that the absence
// of a deployed URL has a NAME: a run's summary and history row can say
// "environment: pipeline" instead of leaving a blank a reader has to interpret.
// Reserved: exactly one entry may carry it, and its baseURL must be null.
const RESERVED_ENVIRONMENT = "pipeline";

// Same discipline as a flow id, for the same reason: the value is echoed into
// error messages, a run title and a job summary.
const ENVIRONMENT_NAME_PATTERN = /^[a-z0-9][a-z0-9-]{0,31}$/;
const ENVIRONMENT_NAME_MAX = 32;
const ENVIRONMENT_LABEL_MAX = 60;
const ENVIRONMENT_DESCRIPTION_MAX = 400;

const BROWSERS = ["chromium", "firefox", "webkit"];
const DEFAULT_BROWSER = "chromium";
const MAX_SHARDS = 8;
const MAX_RETRIES = 3;
const MAX_WORKERS = 8;
const DEFAULT_WORKERS = 2;
const DEFAULT_RETRIES = 0;
const REASON_MAX_LENGTH = 200;
const ACTOR_MAX_LENGTH = 48;

// A job name renders in a picker tab; a long one would push the strip wide.
const JOB_NAME_MAX = 80;

// Must stay in step with TITLE_REQUESTER_SHAPE in public/app.js. The run title
// is a shared contract between this file, the workflow's `run-name`, and the
// client's parser; a value that fails here must fail there too, or the column
// shows half a name.
const REQUESTED_BY_SHAPE = /^[A-Za-z0-9._-]{1,48}$/;

// Per job, and it is the tail that is kept. A Playwright job's log is mostly
// setup - checkout, npm ci, browser downloads - and everything worth reading
// when a test fails is at the end: the failing assertion, the error, the run
// summary. Cutting the head keeps that, cutting the tail would throw it away.
const MAX_LOG_CHARS = 200_000;

// And a hard ceiling on how much is read off the wire to find that tail. A log
// file has no size limit of its own, and the endpoint that serves it is a blob
// host rather than the API. Far past any Playwright job, small enough that a
// pathological log cannot exhaust memory, and the read stops there rather than
// buffering the whole file and slicing afterwards.
const MAX_LOG_BYTES = 20_000_000;

const STATS_DEFAULT_LIMIT = 50;
const STATS_MAX_LIMIT = 100;
const RECENT_RUN_COUNT = 5;

// Counters the UI has a fixed place for, seeded at zero so a runner nobody has
// used yet renders "0 failures" rather than a missing key. Any other value
// GitHub reports (timed_out, action_required, waiting, ...) is added on sight.
const SEEDED_CONCLUSIONS = ["success", "failure", "cancelled"];
const SEEDED_STATUSES = ["queued", "in_progress", "completed"];

// The runner workflow declares `shards` and `workers` as choice inputs with
// these options, and GitHub rejects anything else. Callers are allowed to ask
// for any value in 1..8; we snap down to the nearest option so an odd number
// costs the user a slightly smaller run instead of a 422 they cannot diagnose.
// Keep in step with .github/workflows/remote-test-runner.yml.
const DISPATCHABLE_SHARDS = [1, 2, 4, 8];
const DISPATCHABLE_WORKERS = [1, 2, 4, 8];

// The workflow's `flow` input is a generated choice list covering group and
// spec flows only; describe-level (suite) flows are reachable through
// `flow_override`, which the workflow prefers over the dropdown. This is the
// value we park in `flow` when the real id has to travel in the override.
const DISPATCH_SAFE_KINDS = ["group", "spec"];
const FALLBACK_DISPATCH_FLOW = "group-sanity";

// Poll schedule for locating the run that a dispatch created. Roughly 15s in
// total: long enough that most runs are found, short enough that a colleague
// clicking "Run" is not left waiting on a request.
const RUN_LOOKUP_DELAYS_MS = [1_500, 2_000, 3_000, 4_000, 4_500];
// Our clock and GitHub's are not the same clock. Widening the "created at or
// after dispatch" window by a few seconds avoids missing the run outright,
// at the cost of a slightly larger window in which another person's run could
// match. See matchDispatchedRun for why that trade is acceptable.
const CLOCK_SKEW_TOLERANCE_MS = 10_000;

const REPO_PATTERN = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;

let catalogCache = null;
let environmentsCache = null;

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

// Every failure carries the HTTP status the API layer should answer with, so
// route handlers never have to guess whether a problem was the caller's fault.
function failure(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

// GitHub answers "Not Found" for a repository you cannot see, a workflow file
// that is not on the branch yet, and a genuinely wrong path - all with the same
// 404 and the same two-word body. On its own that message sends someone hunting
// in the wrong place, so name the things that are actually worth checking.
function explainRunLookupFailure(error) {
  const { repo, ref, workflowFile, hasToken } = config();
  const status = error.statusCode || error.status;

  if (status === 404) {
    const causes = [
      `the workflow "${workflowFile}" has not been pushed to ${ref || "the target branch"} yet`,
      `the repository "${repo}" does not exist or this token cannot see it`,
    ];

    if (!hasToken) {
      causes.push(
        "no token is configured, and a private repository looks identical to a missing one when unauthenticated",
      );
    }

    return `GitHub returned "Not Found" for the run history. Most likely: ${causes.join("; or ")}.`;
  }

  if (status === 401 || status === 403) {
    return `GitHub rejected the token (${status}). Check that TR_GITHUB_TOKEN is valid, not expired, and has Actions read and write on "${repo}".`;
  }

  return error.message;
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

function buildHeaders(token) {
  const headers = {
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
    "user-agent": USER_AGENT,
  };

  // Omitted rather than sent empty: a public repo is still readable without a
  // token, and an empty Bearer header turns a working read into a 401.
  if (token) {
    headers.authorization = `Bearer ${token}`;
  }

  return headers;
}

// Reads a response body to the end, or to a ceiling, whichever comes first.
//
// `keepChars` says how much of it survives: with it set, only the last N
// characters are retained and everything before them is discarded as the stream
// arrives (see MAX_LOG_CHARS for why the tail is the half worth keeping). That
// holds keepChars plus one chunk in memory instead of the whole body, which is
// the difference between reading a large log and buffering one.
//
// `maxBytes` is the wire ceiling. Hitting it reports `capped`, which is a
// stronger statement than `dropped`: a dropped read still ends where the body
// ends, a capped one stops mid-body, so what it holds is the tail of the first
// maxBytes rather than the tail of the file.
async function readCappedText(response, { maxBytes, keepChars = 0 }) {
  // 204s, and some proxy responses, carry no stream at all.
  if (!response.body) {
    return { text: "", dropped: false, capped: false };
  }

  const reader = response.body.getReader();
  // Streaming decode: a multi-byte character split across two chunks has to be
  // held, not mangled, and decoding each chunk in isolation would mangle it.
  const decoder = new TextDecoder("utf-8");

  let text = "";
  let bytesRead = 0;
  let dropped = false;
  let capped = false;

  const trimToTail = () => {
    if (keepChars && text.length > keepChars) {
      text = text.slice(text.length - keepChars);
      dropped = true;
    }
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();

      if (done) {
        // Flushes any bytes the decoder was holding for a split character.
        text += decoder.decode();
        trimToTail();
        break;
      }

      bytesRead += value.byteLength;
      text += decoder.decode(value, { stream: true });
      trimToTail();

      if (bytesRead >= maxBytes) {
        capped = true;
        break;
      }
    }
  } finally {
    // Whether we finished, hit the ceiling, or threw: an abandoned reader keeps
    // the socket and the peer's stream alive, which is the leak this whole
    // function exists to close.
    await reader.cancel().catch(() => {});
  }

  return { text, dropped: dropped || capped, capped };
}

// The single outbound request primitive, and the reason the timeout is now
// honest. `await fetch(...)` resolves when the response HEADERS arrive, so a
// timer cleared at that point disarms itself while the body is still unread:
// every body read in this file used to be untimed. A peer that sends headers and
// then stalls mid-body held the call, its socket, and - through getRunLogs - the
// colleague's own HTTP response open indefinitely. Node's http server sets no
// send-side timeout, so nothing downstream would ever break the tie.
//
// The deadline therefore spans connect, headers and every byte of the body, and
// it is a total deadline rather than an idle one: a peer trickling a byte per
// second defeats an idle timer while still hanging the request waiting on it.
async function fetchTimedText(
  url,
  options = {},
  { maxBytes, keepChars = 0 } = {},
) {
  const controller = new AbortController();
  let timedOut = false;

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });

    const body = await readCappedText(response, { maxBytes, keepChars });

    return {
      status: response.status,
      ok: response.ok,
      headers: response.headers,
      text: body.text,
      truncated: body.dropped,
      capped: body.capped,
    };
  } catch (error) {
    // A mid-body abort surfaces through the stream rather than through fetch(),
    // and not always as a DOMException, so the flag - not the error shape - is
    // what distinguishes our timeout from a network failure. Every caller
    // already branches on `name === "AbortError"`, so keep that shape.
    if (timedOut) {
      const aborted = new Error(
        `Timed out after ${REQUEST_TIMEOUT_MS}ms (headers and body).`,
      );
      aborted.name = "AbortError";
      throw aborted;
    }

    throw error;
  } finally {
    clearTimeout(timer);
  }
}

// Turns GitHub's error body into one readable sentence. GitHub reports the
// headline in `message` and per-field detail in `errors[]`; a 422 from a
// dispatch is almost always in the detail ("Provided value ... is not a valid
// option"), so both are worth keeping.
function describeErrorBody(body, status) {
  if (body && typeof body === "object") {
    const parts = [];

    if (typeof body.message === "string" && body.message.trim()) {
      parts.push(body.message.trim());
    }

    if (Array.isArray(body.errors)) {
      for (const entry of body.errors) {
        const detail =
          typeof entry === "string"
            ? entry
            : entry && typeof entry.message === "string"
              ? entry.message
              : "";

        if (detail && !parts.includes(detail)) {
          parts.push(detail);
        }
      }
    }

    if (parts.length) {
      return parts.join(" ");
    }
  }

  if (typeof body === "string" && body.trim()) {
    return body.trim().slice(0, 300);
  }

  return `GitHub responded with HTTP ${status}.`;
}

function parseBody(text) {
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    // Not JSON: an HTML error page from a proxy, most likely. Hand the text
    // back so describeErrorBody can quote a truncated version of it.
    return text;
  }
}

// The JSON sibling of fetchTimedText: same deadline, same ceiling, and the
// parse happens in here. Nothing in this file hands a caller a raw Response,
// because a Response is precisely the object whose body is still unread and
// therefore still untimed.
async function fetchTimedJson(url, options = {}) {
  const result = await fetchTimedText(url, options, {
    maxBytes: MAX_API_BODY_BYTES,
  });

  return {
    ...result,
    // A capped body is a truncated one. Parsing it would fail with a message
    // about malformed JSON when the real problem is size, so leave it to the
    // caller, which checks `capped` first.
    body: result.capped ? null : parseBody(result.text),
  };
}

// Single entry point for authenticated API calls. Nothing here ever puts the
// token into a message: `path` is a relative API path we build ourselves, and
// the token only exists as a header value.
async function githubRequest(path, { method = "GET", body = null } = {}) {
  const { token } = config();
  const headers = buildHeaders(token);
  const init = { method, headers };

  if (body !== null) {
    headers["content-type"] = "application/json";
    init.body = JSON.stringify(body);
  }

  let result;

  try {
    result = await fetchTimedJson(`${API_ROOT}${path}`, init);
  } catch (error) {
    if (error && error.name === "AbortError") {
      // "complete" rather than "respond": the deadline now covers the body, so
      // this fires for a peer that answered and then stalled as well as for one
      // that never answered at all.
      throw failure(
        504,
        `GitHub did not complete the response within ${REQUEST_TIMEOUT_MS / 1000}s.`,
      );
    }

    // Network-level failure (DNS, TLS, offline). The cause chain can be long
    // and unhelpful, so surface one line and mark it as upstream.
    throw failure(
      502,
      `Could not reach GitHub: ${error && error.message ? error.message : "network error"}`,
    );
  }

  // Truncated JSON is not data we can reason about, and treating a partial
  // payload as the whole answer is how an empty jobs list becomes "no jobs".
  if (result.capped) {
    throw failure(
      502,
      `GitHub's response was larger than this runner will read (${MAX_API_BODY_BYTES.toLocaleString("en-US")} bytes).`,
    );
  }

  if (result.status === 204) {
    return null;
  }

  if (!result.ok) {
    // A 403 with no quota left is a rate limit, not a permission problem, and
    // saying so saves someone rechecking a token that is fine.
    const exhausted =
      result.status === 403 &&
      result.headers.get("x-ratelimit-remaining") === "0";

    const message = exhausted
      ? "GitHub API rate limit reached. Wait for the quota to reset and try again."
      : describeErrorBody(result.body, result.status);

    const error = failure(result.status, message);
    error.status = result.status;
    throw error;
  }

  return result.body;
}

// ---------------------------------------------------------------------------
// Config guards
// ---------------------------------------------------------------------------

// Path segments are built from configuration, not from request bodies, but they
// still end up in a URL. Validating the shape keeps a typo like
// "owner/repo/extra" from producing a request against an unintended endpoint.
function requireRepo(cfg) {
  if (!cfg.repo) {
    throw failure(
      501,
      "No repository configured. Set TR_REPO to owner/repo and restart the runner.",
    );
  }

  if (!REPO_PATTERN.test(cfg.repo)) {
    throw failure(500, `TR_REPO is not a valid owner/repo value: ${cfg.repo}`);
  }

  const [owner, repo] = cfg.repo.split("/");

  return `${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
}

function workflowSegment(cfg) {
  if (!cfg.workflowFile) {
    throw failure(
      501,
      "No workflow configured. Set TR_WORKFLOW to the runner workflow file name.",
    );
  }

  return encodeURIComponent(cfg.workflowFile);
}

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

// The flow list is read from the catalog file the pipeline commits on every
// push, which is why this app needs no checkout of the repository and still
// offers newly added specs. Treat every field as untrusted: it arrives over
// the network and is rendered straight into the UI.
function normalizeFlow(raw) {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const id = typeof raw.id === "string" ? raw.id.trim() : "";

  if (!id) {
    return null;
  }

  const maxShards = Number.isFinite(raw.maxShards)
    ? Math.min(Math.max(Math.trunc(raw.maxShards), 1), MAX_SHARDS)
    : 1;

  return {
    id,
    kind: typeof raw.kind === "string" ? raw.kind : "spec",
    name: typeof raw.name === "string" && raw.name.trim() ? raw.name : id,
    description: typeof raw.description === "string" ? raw.description : "",
    area: typeof raw.area === "string" ? raw.area : "",
    runner: typeof raw.runner === "string" ? raw.runner : "playwright",
    path: typeof raw.path === "string" ? raw.path : null,
    grep: typeof raw.grep === "string" ? raw.grep : null,
    testCount: Number.isFinite(raw.testCount) ? raw.testCount : null,
    maxShards,
    tags: Array.isArray(raw.tags)
      ? raw.tags.filter((tag) => typeof tag === "string")
      : [],
    warning: typeof raw.warning === "string" ? raw.warning : null,
    // Carried through for display only. The runner workflow derives what it
    // actually executes from the catalog in the repository, not from us.
    specs: Array.isArray(raw.specs)
      ? raw.specs.filter((spec) => typeof spec === "string")
      : [],
    needsApp: raw.needsApp !== false,
  };
}

function normalizeCatalog(parsed) {
  // Accept a bare array as well as the documented envelope; a catalog generator
  // that changes shape should degrade to "no totals", not to "no flows".
  const rawFlows = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed && parsed.flows)
      ? parsed.flows
      : null;

  if (!rawFlows) {
    throw new Error("catalog JSON has no flows array");
  }

  const flows = [];
  const seen = new Set();

  for (const raw of rawFlows) {
    const flow = normalizeFlow(raw);

    if (flow && !seen.has(flow.id)) {
      seen.add(flow.id);
      flows.push(flow);
    }
  }

  if (!flows.length) {
    throw new Error("catalog JSON contains no usable flows");
  }

  const totals =
    parsed && typeof parsed.totals === "object" && parsed.totals !== null
      ? parsed.totals
      : null;

  return { flows, totals };
}

// ---------------------------------------------------------------------------
// Repository files
// ---------------------------------------------------------------------------
//
// Two files are read out of the repository and neither needs a checkout: the
// flow catalog, and pipeline.config.json, which owns the environment list. Both
// are addressed the same way - a local file, then a configured raw URL, then the
// contents API on cfg.ref - so the transport below is shared and each caller
// supplies only its own parser and its own nouns. A copied ladder would drift
// the first time one of them was fixed.

function parseRepoJson(text, origin, noun) {
  if (text.length > MAX_REPO_FILE_BYTES) {
    throw new Error(`${origin} returned more data than ${noun} should be`);
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${origin} is not valid JSON: ${error.message}`);
  }
}

// A configured URL may itself be a signed or tokenised link, so error messages
// quote only its origin and path. Same reasoning as never echoing the GitHub
// token.
function safeUrlLabel(value, fallback) {
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`;
  } catch {
    return fallback;
  }
}

// Why a local file could not be read, without saying where it lives. An
// absolute path describes the host's filesystem layout, and the TR_LOCAL_*
// variables are development conveniences that have no business leaking that
// into a response every account holder can read.
//
// A parse failure quotes no path (its origin label is a fixed literal), so that
// message travels as it is; only the filesystem errors, which embed the path,
// are reduced to their code.
function localSourceFailure(error, variable) {
  if (error && error.code) {
    return `${variable} could not be read (${error.code})`;
  }

  return error && error.message ? error.message : "could not be read";
}

async function readUrlText(fileUrl, label, noun) {
  let result;

  try {
    result = await fetchTimedText(
      fileUrl,
      { headers: { accept: "application/json", "user-agent": USER_AGENT } },
      // One byte past the limit already proves the file is too big, and reading
      // no further means a hostile or misconfigured URL cannot stream the heap
      // full before the parser gets to refuse it.
      { maxBytes: MAX_REPO_FILE_BYTES + 1 },
    );
  } catch (error) {
    if (error && error.name === "AbortError") {
      throw new Error(
        `${label} did not send a complete response within ${REQUEST_TIMEOUT_MS / 1000}s`,
      );
    }

    throw new Error(`${label} could not be reached`);
  }

  if (!result.ok) {
    throw new Error(`${label} responded with HTTP ${result.status}`);
  }

  // Same verdict the parser would reach, reached before the bytes are held
  // rather than after.
  if (result.capped) {
    throw new Error(`${label} returned more data than ${noun} should be`);
  }

  return result.text;
}

async function readGithubText(cfg, repoPath) {
  const repoSegment = requireRepo(cfg);
  const pathSegment = repoPath
    .split("/")
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("/");

  const payload = await githubRequest(
    `/repos/${repoSegment}/contents/${pathSegment}?ref=${encodeURIComponent(cfg.ref)}`,
  );

  if (!payload || typeof payload.content !== "string") {
    throw new Error(
      `${repoPath} on ${cfg.ref} is not a file the contents API can return`,
    );
  }

  // Files above 1 MB come back with encoding "none" and an empty body. Both
  // real files are far smaller, so this only fires if someone repointed a path.
  if (payload.encoding !== "base64") {
    throw new Error(
      `${repoPath} is too large for the contents API (encoding: ${payload.encoding})`,
    );
  }

  return Buffer.from(payload.content, "base64").toString("utf8");
}

// Walks the three sources in order and returns the first that parses, or the
// list of reasons none did. Never throws: the callers turn a total failure into
// a diagnosis the UI can render, which is the difference between a colleague
// self-serving and a colleague asking.
async function loadRepoFile(cfg, spec) {
  const attempts = [];

  if (spec.localPath) {
    try {
      return {
        value: spec.parse(
          fs.readFileSync(spec.localPath, "utf8"),
          spec.localOrigin,
        ),
        source: "local",
        attempts,
      };
    } catch (error) {
      // Fall through rather than fail hard: the TR_LOCAL_* variables are a
      // developer convenience, and a stale path should not take the app
      // offline. The reason is kept so it appears in the combined diagnosis.
      //
      // Not error.message: a Node filesystem error quotes the absolute path it
      // failed on, and this string is returned to every signed-in user. The
      // operator gets the path in the log, the response gets the reason.
      console.warn(`[runner] ${spec.localVariable} unusable: ${error.message}`);
      attempts.push(
        `local file: ${localSourceFailure(error, spec.localVariable)}`,
      );
    }
  }

  if (spec.url) {
    const label = safeUrlLabel(spec.url, spec.urlFallbackLabel);

    try {
      return {
        value: spec.parse(await readUrlText(spec.url, label, spec.noun), label),
        source: "url",
        attempts,
      };
    } catch (error) {
      attempts.push(`${spec.urlLabel}: ${error.message}`);
    }
  }

  try {
    return {
      value: spec.parse(
        await readGithubText(cfg, spec.repoPath),
        spec.repoPath,
      ),
      source: "github",
      attempts,
    };
  } catch (error) {
    attempts.push(`GitHub contents API: ${error.message}`);
  }

  return { value: null, source: "none", attempts };
}

// Configuration problems explain most read failures, so lead with them.
//
// cfg.errors is the PUBLIC half of config()'s diagnostics by contract: it names
// the variable and the fix and carries no value, no length and no path. That
// matters here because this string is returned by /api/flows to any signed-in
// account, administrator or not. The operator's half is cfg.errorDetails, which
// config.js writes to the log - never join that in here.
function readFailureMessage(cfg, attempts) {
  const configErrors = Array.isArray(cfg.errors) ? cfg.errors : [];

  return [...configErrors, ...attempts].join(" | ");
}

function catalogSpec(cfg) {
  return {
    localPath: cfg.localCatalog,
    localVariable: "TR_LOCAL_CATALOG",
    localOrigin: "local catalog",
    url: cfg.catalogUrl,
    urlLabel: "catalog URL",
    urlFallbackLabel: "the configured catalog URL",
    repoPath: cfg.catalogPath,
    noun: "a catalog",
    parse: (text, origin) =>
      normalizeCatalog(parseRepoJson(text, origin, "a catalog")),
  };
}

// Never throws. A blank flow list with a reason attached lets the UI render a
// diagnosis ("token missing", "wrong branch") instead of an empty page.
async function getFlows() {
  const now = Date.now();

  if (catalogCache && now < catalogCache.expiresAt) {
    return catalogCache.error
      ? { flows: [], totals: null, source: "none", error: catalogCache.error }
      : {
          flows: catalogCache.flows,
          totals: catalogCache.totals,
          source: "cache",
          error: null,
        };
  }

  const cfg = config();
  const loaded = await loadRepoFile(cfg, catalogSpec(cfg));

  if (loaded.value) {
    const { flows, totals } = loaded.value;

    catalogCache = {
      flows,
      totals,
      error: null,
      expiresAt: now + CATALOG_TTL_MS,
    };

    return { flows, totals, source: loaded.source, error: null };
  }

  const message = readFailureMessage(cfg, loaded.attempts);

  catalogCache = {
    flows: [],
    totals: null,
    error: message,
    expiresAt: now + CATALOG_ERROR_TTL_MS,
  };

  return { flows: [], totals: null, source: "none", error: message };
}

// ---------------------------------------------------------------------------
// Environments
// ---------------------------------------------------------------------------
//
// A SECOND copy of the environment rules lives in
// scripts/test-runner/catalog.js, and the duplication is deliberate: this app
// ships as a standalone deployment with no parent repository on disk, which is
// already why this file keeps its own normalizeTargetUrl and normalizeBrowser
// instead of importing that module. The copy here is ADVISORY - a fast, clear
// 400 for the obvious mistakes. The remote runner's `plan` job owns the
// authoritative check, because that job has the checkout and its refusal stops
// the run before a single shard exists.

// The one environment that is correct with no configuration at all: no deployed
// host is involved, so there is nothing a stale or missing config could get
// wrong about it.
function builtInEnvironment() {
  return {
    name: RESERVED_ENVIRONMENT,
    label: "Pipeline build (this run)",
    description:
      "The run builds the app from the checked-out commit and serves it itself. No deployed host is involved.",
    baseURL: null,
  };
}

function normalizeEnvironmentEntry(raw, origin, seen) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(
      `${origin} -> environments.entries contains an entry that is not an object.`,
    );
  }

  const name = typeof raw.name === "string" ? raw.name.trim() : "";

  if (!ENVIRONMENT_NAME_PATTERN.test(name)) {
    throw new Error(
      `${origin} -> environments.entries has an entry named "${cleanText(String(raw.name), ENVIRONMENT_NAME_MAX)}". Expected lowercase letters, digits and hyphens, up to ${ENVIRONMENT_NAME_MAX} characters.`,
    );
  }

  if (seen.has(name)) {
    throw new Error(
      `${origin} declares environment "${name}" twice. Names have to be unique.`,
    );
  }

  seen.add(name);

  // An ABSENT key and an explicit null are deliberately not the same answer.
  // null says "there is no deployed URL, and that is the point"; absent says
  // somebody started an edit and did not finish it. A half-written `staging`
  // must never quietly run against a locally built app and report green under
  // the deployed environment's name - that false provenance is the whole thing
  // this feature exists to remove.
  const missing =
    !Object.prototype.hasOwnProperty.call(raw, "baseURL") ||
    (typeof raw.baseURL === "string" && !raw.baseURL.trim());

  if (missing) {
    throw new Error(
      `${origin} -> environment "${name}" has no baseURL. Give it an absolute http(s) URL, or set "baseURL": null to mean the pipeline builds and serves the app itself.`,
    );
  }

  let baseURL = null;

  if (raw.baseURL !== null) {
    try {
      // The same validator a typed target URL goes through, so a host reached
      // from the config and a host typed into the form normalize to one string.
      // Two runs of the same suite against the same host must not disagree in
      // their report headers.
      baseURL = normalizeTargetUrl(raw.baseURL);
    } catch (error) {
      throw new Error(
        `${origin} -> environment "${name}" has an invalid baseURL: ${error.message}`,
      );
    }
  }

  if (name === RESERVED_ENVIRONMENT && baseURL) {
    throw new Error(
      `${origin} declares environment "${RESERVED_ENVIRONMENT}" with a baseURL; that name is reserved for the build-it-here case and its baseURL must be null.`,
    );
  }

  return {
    name,
    label: cleanText(raw.label, ENVIRONMENT_LABEL_MAX) || name,
    description: cleanText(raw.description, ENVIRONMENT_DESCRIPTION_MAX),
    baseURL,
  };
}

function normalizeEnvironments(parsed, origin) {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${origin} is not a JSON object`);
  }

  const raw = parsed.environments;

  // No `environments` block at all gets the same answer as no file at all: the
  // built-in single-entry set. A config written before this feature existed is
  // not a lie - there is nothing in it to misread - and refusing it would take
  // the picker offline for the one environment that never needed configuring.
  //
  // A block that is PRESENT and wrong is a different thing entirely and fails
  // below, unconditionally, even when the run would have used the default and
  // never read a URL: the likely cause is an operator midway through adding a
  // real host, and running the default while reporting success would hide
  // exactly the edit they are trying to test.
  if (raw === undefined || raw === null) {
    return { default: RESERVED_ENVIRONMENT, entries: [builtInEnvironment()] };
  }

  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`${origin} -> environments must be an object.`);
  }

  if (raw.schemaVersion !== ENVIRONMENTS_SCHEMA_VERSION) {
    throw new Error(
      `${origin} -> environments.schemaVersion is ${JSON.stringify(raw.schemaVersion)}; this runner understands version ${ENVIRONMENTS_SCHEMA_VERSION} only.`,
    );
  }

  if (!Array.isArray(raw.entries) || !raw.entries.length) {
    throw new Error(
      `${origin} -> environments.entries must be a non-empty array.`,
    );
  }

  const seen = new Set();
  const entries = raw.entries.map((entry) =>
    normalizeEnvironmentEntry(entry, origin, seen),
  );

  // The config owns the default so it can move later without a code change,
  // which is why nothing downstream hardcodes "pipeline" as the selection.
  const fallback = typeof raw.default === "string" ? raw.default.trim() : "";
  const names = entries.map((entry) => entry.name);

  if (!names.includes(fallback)) {
    throw new Error(
      `${origin} -> environments.default is ${JSON.stringify(raw.default)}, which is not one of: ${names.join(", ")}.`,
    );
  }

  return { default: fallback, entries };
}

function environmentsSpec(cfg) {
  return {
    localPath: cfg.localPipelineConfig,
    localVariable: "TR_LOCAL_PIPELINE_CONFIG",
    localOrigin: "local pipeline config",
    url: cfg.pipelineConfigUrl,
    urlLabel: "pipeline config URL",
    urlFallbackLabel: "the configured pipeline config URL",
    repoPath: cfg.pipelineConfigPath,
    noun: "a pipeline config",
    parse: (text, origin) =>
      normalizeEnvironments(
        parseRepoJson(text, origin, "a pipeline config"),
        origin,
      ),
  };
}

// Never throws - same contract as getFlows(). An unreadable list must not take
// the runner offline: the plan job has the checkout and resolves the default
// correctly on its own, so the worst an outage here can do is make the picker
// less informative. It returns no entries rather than a fabricated `pipeline`
// one on purpose - a hardcoded entry would be the one that still looks fine at
// the exact moment the app cannot know anything, and the UI must not pretend.
async function getEnvironments() {
  const now = Date.now();

  if (environmentsCache && now < environmentsCache.expiresAt) {
    return environmentsCache.error
      ? {
          default: "",
          entries: [],
          source: "none",
          error: environmentsCache.error,
        }
      : {
          default: environmentsCache.value.default,
          entries: environmentsCache.value.entries,
          source: "cache",
          error: null,
        };
  }

  const cfg = config();
  const loaded = await loadRepoFile(cfg, environmentsSpec(cfg));

  if (loaded.value) {
    environmentsCache = {
      value: loaded.value,
      error: null,
      expiresAt: now + CATALOG_TTL_MS,
    };

    return {
      default: loaded.value.default,
      entries: loaded.value.entries,
      source: loaded.source,
      error: null,
    };
  }

  const message = readFailureMessage(cfg, loaded.attempts);

  environmentsCache = {
    value: null,
    error: message,
    expiresAt: now + CATALOG_ERROR_TTL_MS,
  };

  return { default: "", entries: [], source: "none", error: message };
}

// ---------------------------------------------------------------------------
// Option validation
// ---------------------------------------------------------------------------

// Anything that reaches GitHub is validated here first. A rejected value is a
// 400 with the allowed range spelled out, so the UI can show it verbatim.
function parseInteger(value, name) {
  if (typeof value === "number") {
    if (!Number.isInteger(value)) {
      throw failure(400, `${name} must be a whole number.`);
    }

    return value;
  }

  if (typeof value === "string" && /^-?\d{1,4}$/.test(value.trim())) {
    return Number.parseInt(value.trim(), 10);
  }

  throw failure(400, `${name} must be a whole number.`);
}

function boundedInteger(value, { name, min, max, fallback }) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const parsed = parseInteger(value, name);

  if (parsed < min || parsed > max) {
    throw failure(400, `${name} must be between ${min} and ${max}.`);
  }

  return parsed;
}

// Forgiving sibling of boundedInteger, for values where an out-of-range request
// has an obvious sensible answer instead of being a caller mistake.
function clampInteger(value, { min, max, fallback }) {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && /^\d{1,4}$/.test(value.trim())
        ? Number.parseInt(value.trim(), 10)
        : NaN;

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(Math.max(Math.trunc(parsed), min), max);
}

// Snap down to a value the workflow's choice input will accept.
function snapToOption(value, options) {
  let chosen = options[0];

  for (const option of options) {
    if (option <= value) {
      chosen = option;
    }
  }

  return chosen;
}

function normalizeBrowser(value) {
  if (value === undefined || value === null || value === "") {
    return DEFAULT_BROWSER;
  }

  if (typeof value !== "string" || !BROWSERS.includes(value)) {
    throw failure(400, `browser must be one of: ${BROWSERS.join(", ")}.`);
  }

  return value;
}

function normalizeTargetUrl(value) {
  if (value === undefined || value === null || value === "") {
    return "";
  }

  if (typeof value !== "string") {
    throw failure(400, "targetUrl must be a URL string.");
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return "";
  }

  let parsed;

  try {
    parsed = new URL(trimmed);
  } catch {
    throw failure(
      400,
      "targetUrl must be an absolute URL, for example https://staging.example.com.",
    );
  }

  // Only http(s): the runner points a browser at this, and a file: or data:
  // URL would be a way to aim the job at the runner's own filesystem.
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw failure(400, "targetUrl must use http or https.");
  }

  // Deliberately not rejecting localhost. It is useless from a GitHub-hosted
  // runner, but it is valid against a self-hosted one, and guessing wrong here
  // would block a legitimate setup.
  return parsed.toString();
}

// Free text that ends up in a job summary. Control characters are stripped
// because the summary is Markdown assembled by the workflow, and a stray
// newline or escape sequence there is at best noise.
function cleanText(value, maxLength) {
  if (typeof value !== "string") {
    return "";
  }

  return value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

// A job's name as a person should see it.
//
// The runner workflow names its test job with a template:
//
//   name: ${{ needs.plan.outputs.flow_name }} (${{ matrix.shard }}/${{ needs.plan.outputs.shard_count }})
//
// GitHub resolves that at run time - but only if there is something to resolve.
// Cancel a run before the `plan` job publishes its outputs and the job comes back
// with the template ITSELF as its name, so the log picker showed a tab reading
// "${{ needs.plan.outputs.flow_name }} (${{ matrix.shard }}/...)". Found by
// cancelling a run, which is exactly the case that produces it.
//
// An unresolved expression is not a name, so it is not shown as one. The shard
// numbers are recoverable from the template's own text often enough to be worth
// trying, and when they are not, "Tests" beats a wall of punctuation.
function jobDisplayName(name) {
  const text = typeof name === "string" ? name.trim() : "";

  if (!text) return "job";
  if (!text.includes("${{")) return cleanText(text, JOB_NAME_MAX);

  // "... (2/8)" survives interpolation failure when the matrix value itself did
  // resolve, which happens when only the `plan` outputs are missing.
  const shard = text.match(/\((\d+)\/(\d+)\)\s*$/);
  if (shard) return `Tests (${shard[1]}/${shard[2]})`;

  return "Tests";
}

function actorLabel(actor) {
  if (typeof actor === "string") {
    return cleanText(actor, ACTOR_MAX_LENGTH) || "unknown user";
  }

  if (actor && typeof actor === "object") {
    const name = actor.username || actor.name || actor.email || "";
    return cleanText(String(name), ACTOR_MAX_LENGTH) || "unknown user";
  }

  return "unknown user";
}

// The gate that decides whether a base URL means anything for this flow at all.
// Keyed off the catalog's own fields rather than a list of runner names, so a
// future non-browser runner is covered without another edit here.
function flowOpensBrowser(flow) {
  return flow.needsApp !== false && flow.runner !== "vitest";
}

function runnerLabel(flow) {
  return typeof flow.runner === "string" && flow.runner
    ? flow.runner
    : "a non-browser runner";
}

// Blank resolves to the configured default, never to a hardcoded "pipeline":
// the config owns the default so it can move without a code change.
//
// An unknown name is refused with the list of valid ones rather than coerced to
// the nearest match, the same trust boundary findFlow() applies to a flow id and
// for the same reason - a caller-supplied environment name is untrusted
// vocabulary that ends up in a run title and a job summary.
function resolveEnvironment(environments, value) {
  const asked = typeof value === "string" ? value.trim() : "";
  const entries =
    environments && Array.isArray(environments.entries)
      ? environments.entries
      : [];

  // No list to check against. The built-in `pipeline` entry is still valid,
  // because it asserts no URL and so needs no configuration to be correct; any
  // other name is a specific claim about a specific host, and startRun refuses
  // those with a 503 before reaching here.
  if (!entries.length) {
    if (asked && asked !== RESERVED_ENVIRONMENT) {
      throw failure(
        503,
        `The environment list is unavailable, so "${cleanText(asked, ENVIRONMENT_NAME_MAX)}" cannot be validated.`,
      );
    }

    return builtInEnvironment();
  }

  const name = asked || environments.default;

  // Shape first, so a hostile or oversized value never reaches the next message
  // verbatim.
  if (!ENVIRONMENT_NAME_PATTERN.test(name)) {
    throw failure(
      400,
      `Invalid environment name: "${cleanText(name, ENVIRONMENT_NAME_MAX)}". Expected lowercase letters, digits, and hyphens.`,
    );
  }

  const entry = entries.find((candidate) => candidate.name === name);

  if (!entry) {
    throw failure(
      400,
      `Unknown environment: ${name}. Configured environments: ${entries
        .map((candidate) => candidate.name)
        .join(", ")}.`,
    );
  }

  return entry;
}

function normalizeOptions(flow, options, environments) {
  if (
    options !== undefined &&
    options !== null &&
    typeof options !== "object"
  ) {
    throw failure(400, "options must be an object.");
  }

  const given = options || {};

  // Blank shards means "use the flow's own maximum", matching the workflow and
  // the CLI. Someone picking the full regression suite and pressing Run should
  // get the parallel run the flow was tuned for, not a one-shard crawl.
  const requestedShards = boundedInteger(given.shards, {
    name: "shards",
    min: 1,
    max: MAX_SHARDS,
    fallback: flow.maxShards,
  });

  const shards = snapToOption(
    Math.min(requestedShards, flow.maxShards),
    DISPATCHABLE_SHARDS,
  );

  const workers = snapToOption(
    boundedInteger(given.workers, {
      name: "workers",
      min: 1,
      max: MAX_WORKERS,
      fallback: DEFAULT_WORKERS,
    }),
    DISPATCHABLE_WORKERS,
  );

  const targetUrl = normalizeTargetUrl(given.targetUrl);
  const environment = resolveEnvironment(environments, given.environment);
  const environmentBaseUrl = environment.baseURL || "";

  // Supplying both is an error, never a silent override. The caller named a
  // place and then typed a different place; whichever one is dropped, the run's
  // title, its job summary and this app's history row will claim the
  // environment name while the browser talked to the other host. A green run
  // labelled "staging" that never touched staging is the most damaging artifact
  // this system can emit, because somebody will cite it as evidence.
  //
  // A typed URL alongside an environment whose baseURL is null is NOT a
  // conflict: that is today's behaviour and the case the field exists for - a
  // preview deployment, a colleague's tunnel, a one-off host that will never
  // earn a config entry. The `pipeline` entry asserts no URL, so there is
  // nothing for the typed URL to contradict.
  if (targetUrl && environmentBaseUrl) {
    throw failure(
      400,
      `Both an environment and a target URL were given: environment "${environment.name}" resolves to ${environmentBaseUrl}, target URL is ${targetUrl}. Pick one — supply a target URL only for a host that has no environment entry.`,
    );
  }

  const baseUrl = targetUrl || environmentBaseUrl;

  // A base URL from ANY source, on a flow that opens no browser, fails here.
  // Not a warning and not a silent ignore: the artifact a silent ignore produces
  // is the worst one available - a passing run whose title and summary say
  // "staging" while not one byte crossed the network to staging. The default
  // environment carries no URL, so the blank every caller sends still runs a
  // browserless flow without complaint.
  if (baseUrl && !flowOpensBrowser(flow)) {
    throw failure(
      400,
      targetUrl
        ? `A target URL cannot apply to flow ${flow.id}: it runs under ${runnerLabel(flow)} and never opens a browser, so no base URL is used. Clear the target URL and run again.`
        : `Environment "${environment.name}" cannot apply to flow ${flow.id}: it runs under ${runnerLabel(flow)} and never opens a browser, so no base URL is used. Re-run with the default environment.`,
    );
  }

  return {
    shards,
    workers,
    browser: normalizeBrowser(given.browser),
    retries: boundedInteger(given.retries, {
      name: "retries",
      min: 0,
      max: MAX_RETRIES,
      fallback: DEFAULT_RETRIES,
    }),
    // Only ever what the caller typed. The environment's own baseURL must not
    // be copied in here: `target_url` and `environment` both travel to the
    // workflow, and the plan job treats two non-empty values as the conflict
    // above - so a run against a configured environment would refuse itself.
    targetUrl,
    // Recorded so the plan artifact, the job summary and this app's status line
    // all name the environment a run claimed, rather than leaving a blank a
    // reader has to interpret.
    environment: environment.name,
    // The URL the browser will actually be pointed at - "" when the pipeline
    // builds and serves the app itself. For display and for the check above;
    // never dispatched.
    baseUrl,
    reason: cleanText(given.reason, REASON_MAX_LENGTH),
  };
}

// ---------------------------------------------------------------------------
// Run outcome classification
// ---------------------------------------------------------------------------

// GitHub answers "did the workflow finish, and with what conclusion". That is
// not the question anyone opens this app to ask, which is "are the tests
// broken". A cancelled run, a runner that never started, a checkout that 503'd,
// a job that hit its time limit - each of those arrives as a non-success
// conclusion, and not one of them is a broken test. Showing them as test
// failures sends a colleague to debug a spec that never executed, and drags down
// a success rate that is supposed to describe test health.
//
// So every run is sorted into exactly one outcome, and only "failed" ever means
// a test failed:
//
//   passed | failed | infra | cancelled | running | queued
//
// outcomeNote carries the one-sentence reason for every outcome except passed
// and failed, which need none. outcomePrecise records whether the verdict used
// job detail: a "failure" conclusion is genuinely ambiguous from the run alone,
// so a list-level answer admits it rather than pretending otherwise. See
// refineFailureOutcome, and getStats for what the success rate is computed over.

// GitHub's pre-start statuses. Anything else that is not "completed" is a run
// already doing work, so it reads as "running".
const QUEUED_STATUSES = new Set(["queued", "waiting", "pending"]);

// Conclusion -> outcome, with the sentence a reader gets. "failure" is absent on
// purpose: it is the one conclusion that cannot be decided from the run alone.
const CONCLUSION_OUTCOMES = {
  success: { outcome: "passed", note: "" },
  cancelled: {
    outcome: "cancelled",
    note: "This run was cancelled before it finished, so it says nothing about the tests.",
  },
  timed_out: {
    outcome: "infra",
    note: "The run exceeded its time limit and was stopped, so the tests never finished.",
  },
  startup_failure: {
    outcome: "infra",
    note: "The runner never started the job, so no tests ran.",
  },
  stale: {
    outcome: "infra",
    note: "GitHub marked this run stale, so its jobs never produced a result.",
  },
  action_required: {
    outcome: "infra",
    note: "The run stopped waiting for a manual approval, so the tests did not run.",
  },
  neutral: {
    outcome: "infra",
    note: "The run finished without a pass or fail verdict, so it is not a test result.",
  },
  skipped: {
    outcome: "infra",
    note: "The run was skipped, so no tests ran.",
  },
};

// The workflow's own scaffolding, matched by exact job name. Matched from this
// side rather than the test side because the test job is named at run time from
// the flow name and the shard ("Sanity smoke (1/1)"), so there is no fixed
// string to match there - and no such name can collide with these, because the
// shard suffix is always present. Keep in step with the job names in
// .github/workflows/remote-test-runner.yml.
const SCAFFOLDING_JOB_NAMES = new Set(["plan", "report"]);

// Job conclusions that mean "this job broke". "cancelled" is deliberately not
// among them: fail-fast and a cancelled run stop sibling jobs, and a job that
// was stopped never reached a verdict of its own to report.
const BROKEN_JOB_CONCLUSIONS = new Set([
  "failure",
  "timed_out",
  "startup_failure",
]);

// Everything a run's own fields can tell us, which is all that is available at
// list level. Job detail refines one case only; see refineFailureOutcome.
function classifyOutcome(status, conclusion) {
  const runStatus = typeof status === "string" ? status : "";
  const runConclusion = typeof conclusion === "string" ? conclusion : "";

  if (runStatus !== "completed") {
    return QUEUED_STATUSES.has(runStatus)
      ? {
          outcome: "queued",
          outcomeNote: "This run is waiting for a runner and has not started.",
          outcomePrecise: true,
        }
      : {
          outcome: "running",
          outcomeNote:
            "This run is still in progress, so it has no result yet.",
          outcomePrecise: true,
        };
  }

  // The ambiguous one. GitHub reports "failure" for a failed assertion and for a
  // failed npm install alike, so this is a provisional verdict: outcomePrecise
  // false is the flag that says "inferred from the run, not from its jobs".
  if (runConclusion === "failure") {
    return { outcome: "failed", outcomeNote: "", outcomePrecise: false };
  }

  const known = CONCLUSION_OUTCOMES[runConclusion];

  if (known) {
    return {
      outcome: known.outcome,
      outcomeNote: known.note,
      outcomePrecise: true,
    };
  }

  // "completed" with no conclusion happens for a moment while GitHub settles a
  // run. It is not evidence a test failed, and neither is a conclusion GitHub
  // has added since this was written, so both land in infra rather than being
  // guessed into a verdict.
  if (!runConclusion) {
    return {
      outcome: "infra",
      outcomeNote:
        "The run is marked completed but GitHub has not reported a conclusion for it yet.",
      outcomePrecise: true,
    };
  }

  return {
    outcome: "infra",
    // Quoted through cleanText because it is rendered in the UI: GitHub authored
    // the value, but nothing in this file renders a remote string unfiltered.
    outcomeNote: `GitHub reported an unrecognised conclusion ("${cleanText(runConclusion, 40)}"), so this run is not counted as a test result.`,
    outcomePrecise: true,
  };
}

// A reusable-workflow call prefixes a job name with the caller's ("ci / Plan"),
// so the comparison is on the last path segment. A templated test job name can
// contain a slash too ("Sanity smoke (1/1)"), which is harmless: its last
// segment is never "plan" or "report".
function jobBaseName(job) {
  const name = typeof job.name === "string" ? job.name.toLowerCase() : "";
  const segments = name.split("/");

  return segments[segments.length - 1].trim();
}

function isScaffoldingJob(job) {
  return SCAFFOLDING_JOB_NAMES.has(jobBaseName(job));
}

// The refinement, available only where the job list is known - which is getRun.
//
// A run whose conclusion is "failure" is a TEST failure only if a job from the
// test matrix failed. When the only casualties are Plan or Report, the pipeline
// broke around the tests rather than the tests breaking, and reporting "failed"
// would point the reader at specs that are fine. Note that Report fails on
// purpose whenever the test matrix did not succeed, so a failed Report on its
// own really does mean the reporting stage itself broke.
//
// Called only for an outcome of "failed", and every answer it gives is precise:
// it is looking at the jobs.
function refineFailureOutcome(jobs) {
  const broken = jobs.filter(
    (job) =>
      typeof job.conclusion === "string" &&
      BROKEN_JOB_CONCLUSIONS.has(job.conclusion),
  );

  const brokenTestJobs = broken.filter((job) => !isScaffoldingJob(job));
  const testFailures = brokenTestJobs.filter(
    (job) => job.conclusion === "failure",
  );

  if (testFailures.length) {
    return { outcome: "failed", outcomeNote: "", outcomePrecise: true };
  }

  // A test job that timed out, never started, or was stopped ran no assertions,
  // so it has no verdict to report either - that is the runner failing, not the
  // suite. "cancelled" counts here even though it is not a broken conclusion: an
  // unfinished shard is the reason the Report job then fails on purpose, and
  // without this the run would be described as failing "after the tests".
  const unfinishedTestJob =
    brokenTestJobs[0] ||
    jobs.find(
      (job) => !isScaffoldingJob(job) && job.conclusion === "cancelled",
    );

  if (unfinishedTestJob) {
    return {
      outcome: "infra",
      outcomeNote: `A test job did not finish (${cleanText(unfinishedTestJob.conclusion, 40)}), so this run produced no test verdict.`,
      outcomePrecise: true,
    };
  }

  if (broken.length) {
    const planBroke = broken.some((job) => jobBaseName(job) === "plan");

    return {
      outcome: "infra",
      outcomeNote: planBroke
        ? "The pipeline failed before the tests ran: the Plan job did not complete."
        : "The tests are not the problem: the pipeline failed after them, while reporting.",
      outcomePrecise: true,
    };
  }

  // Failed with nothing in it failing. A workflow-level error - a bad matrix
  // expression, a concurrency cancellation racing the conclusion - reads like
  // this, and none of them are a test result.
  return {
    outcome: "infra",
    outcomeNote:
      "The run failed but no job in it reported a failure, so this is a pipeline problem rather than a test result.",
    outcomePrecise: true,
  };
}

// ---------------------------------------------------------------------------
// Run mapping
// ---------------------------------------------------------------------------

function mapRun(raw) {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  return {
    id: raw.id,
    runNumber: raw.run_number ?? null,
    status: raw.status ?? null,
    conclusion: raw.conclusion ?? null,
    // Derived here, beside the raw fields it comes from, so listRuns, getRun and
    // getStats all describe a run the same way and nothing downstream has to
    // re-answer "is this actually a test failure".
    ...classifyOutcome(raw.status, raw.conclusion),
    event: raw.event ?? null,
    displayTitle: raw.display_title ?? raw.name ?? null,
    headBranch: raw.head_branch ?? null,
    createdAt: raw.created_at ?? null,
    updatedAt: raw.updated_at ?? null,
    htmlUrl: raw.html_url ?? null,
    // The dispatching identity is the app's token owner, not the colleague who
    // pressed the button; attribution for that lives in the run's reason input.
    actor: raw.actor && raw.actor.login ? raw.actor.login : null,
  };
}

function mapJob(raw) {
  return {
    id: raw.id,
    name: typeof raw.name === "string" ? raw.name : "",
    status: raw.status ?? null,
    conclusion: raw.conclusion ?? null,
    startedAt: raw.started_at ?? null,
    completedAt: raw.completed_at ?? null,
    htmlUrl: raw.html_url ?? null,
    steps: Array.isArray(raw.steps)
      ? raw.steps.map((step) => ({
          number: step.number ?? null,
          name: typeof step.name === "string" ? step.name : "",
          status: step.status ?? null,
          conclusion: step.conclusion ?? null,
        }))
      : [],
  };
}

// Artifact bytes need an authenticated request that redirects to a signed blob
// URL, so the app does not proxy downloads. Names and sizes are enough for the
// UI to show what a run produced and point at the run page to fetch it.
function mapArtifact(raw) {
  return {
    id: raw.id,
    name: typeof raw.name === "string" ? raw.name : "",
    sizeInBytes: Number.isFinite(raw.size_in_bytes) ? raw.size_in_bytes : 0,
    expired: raw.expired === true,
  };
}

// ---------------------------------------------------------------------------
// Run identity and ownership
// ---------------------------------------------------------------------------

// A run id arrives from a URL path and goes back out in one, so its shape is
// checked before it can be interpolated anywhere. Kept as a string rather than
// parsed: GitHub run ids are already eleven digits and JSON numbers stop being
// exact above 2^53, so there is nothing to gain by converting.
function requireRunId(runId) {
  const raw = typeof runId === "number" ? String(runId) : runId;

  if (typeof raw !== "string" || !/^\d{1,19}$/.test(raw.trim())) {
    throw failure(400, "A numeric run id is required.");
  }

  return raw.trim();
}

// `path` on a run is the workflow's repository path, for example
// ".github/workflows/remote-test-runner.yml", and its last segment is exactly
// what TR_WORKFLOW names. `workflow_url` is only a fallback for a response that
// omits `path`.
//
// A run we cannot positively identify counts as somebody else's. This is a
// security guard, so the unknown case fails closed.
function runBelongsToWorkflow(raw, workflowFile) {
  if (!workflowFile) {
    return false;
  }

  for (const candidate of [raw.path, raw.workflow_url]) {
    if (typeof candidate !== "string") {
      continue;
    }

    const segments = candidate.split("/").filter(Boolean);

    if (segments[segments.length - 1] === workflowFile) {
      return true;
    }
  }

  return false;
}

// The gate in front of every by-id operation: reading a run's detail, reading
// its logs, cancelling it. The token can do all three across the whole
// repository; a signed-in colleague is not a collaborator and has no business
// touching anything but this app's own workflow. So the run is fetched and
// identified first, and only then acted on or described.
//
// A run from another workflow is reported as a missing run - same status, same
// wording, nothing about the workflow it really belongs to. Saying "that run is
// not yours" would confirm the id exists and name what it was, which is the
// information the guard is there to withhold.
async function requireOwnRun(repoSegment, cfg, id) {
  const notFound = () => failure(404, `Run ${id} was not found.`);

  let raw;

  try {
    raw = await githubRequest(`/repos/${repoSegment}/actions/runs/${id}`);
  } catch (error) {
    // GitHub's own 404 body is the word "Not Found", which does not match the
    // sentence below - and a difference in wording is a difference an attacker
    // can measure. An id that exists in another workflow and an id that exists
    // nowhere have to answer identically, so the upstream 404 is restated in
    // our words. Every other status (401, 403, 429, 5xx) is a fact about this
    // runner rather than about the run, and is left alone so an operator can
    // still diagnose it.
    const status = error && (error.statusCode || error.status);

    throw status === 404 ? notFound() : error;
  }

  if (
    !raw ||
    typeof raw !== "object" ||
    !runBelongsToWorkflow(raw, cfg.workflowFile)
  ) {
    throw notFound();
  }

  return raw;
}

// ---------------------------------------------------------------------------
// Starting a run
// ---------------------------------------------------------------------------

// Builds the flow-identifying inputs. Group and spec ids are in the workflow's
// generated choice list and can travel in `flow` directly; suite ids are not,
// so they go in `flow_override`, which the workflow prefers whenever it is set.
// `flow` still has to carry a valid option because GitHub validates choices.
function flowInputs(flow) {
  if (DISPATCH_SAFE_KINDS.includes(flow.kind)) {
    return { flow: flow.id, flow_override: "" };
  }

  return { flow: FALLBACK_DISPATCH_FLOW, flow_override: flow.id };
}

// workflow_dispatch returns 204 with no body, so the only way to name the run
// we just started is to look at the workflow's recent runs and pick one created
// at or after the dispatch.
//
// This is a heuristic, not an identity check. Two colleagues dispatching the
// same workflow within the same few seconds can both match the same run, so the
// id returned here may belong to the other person's run. It is used for
// convenience only — to deep-link the run that was probably just started — and
// the UI's run list is the source of truth either way. Returning null is always
// a valid answer.
async function matchDispatchedRun(
  cfg,
  repoSegment,
  workflowFile,
  dispatchedAt,
) {
  const threshold = dispatchedAt - CLOCK_SKEW_TOLERANCE_MS;

  for (const delay of RUN_LOOKUP_DELAYS_MS) {
    await sleep(delay);

    let payload;

    try {
      payload = await githubRequest(
        `/repos/${repoSegment}/actions/workflows/${workflowFile}/runs?per_page=10&event=workflow_dispatch`,
      );
    } catch {
      // The dispatch already succeeded. A hiccup while looking for the run is
      // not worth failing the request the colleague is waiting on.
      continue;
    }

    const runs = Array.isArray(payload && payload.workflow_runs)
      ? payload.workflow_runs
      : [];

    const candidates = runs
      .filter((run) => {
        const createdAt = Date.parse(run && run.created_at);

        if (!Number.isFinite(createdAt) || createdAt < threshold) {
          return false;
        }

        // Narrows the window a little when the ref is a branch name; a SHA or
        // tag ref will not match head_branch, so this is a filter, not a rule.
        return !run.head_branch || !cfg.ref || run.head_branch === cfg.ref;
      })
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));

    if (candidates.length) {
      return mapRun(candidates[0]);
    }
  }

  return null;
}

// The request is validated before the deployment is. A caller who asks for a
// flow that does not exist must be told that, whether or not this runner has a
// token - checking configuration first meant an unknown flow came back as "no
// token configured", which sends the reader off to fix an env var that was
// never the problem. Validation order here is: what was asked, then whether we
// can act on it.
async function startRun(flowId, options, actor) {
  const cfg = config();

  if (typeof flowId !== "string" || !flowId.trim()) {
    throw failure(400, "A flow id is required.");
  }

  const requestedId = flowId.trim();
  const given = options && typeof options === "object" ? options : {};
  const [catalog, environments] = await Promise.all([
    getFlows(),
    getEnvironments(),
  ]);

  if (!catalog.flows.length) {
    // Without a catalog we cannot tell a valid flow from a typo, and dispatching
    // an unvalidated id just moves the failure into a CI job nobody can see.
    throw failure(
      503,
      `The flow catalog is unavailable, so runs cannot be validated: ${catalog.error || "unknown reason"}`,
    );
  }

  const flow = catalog.flows.find((entry) => entry.id === requestedId);

  if (!flow) {
    throw failure(400, `Unknown flow: ${requestedId}`);
  }

  // Deliberately asymmetric with the flow catalog above. A flow id cannot be
  // validated without the catalog, so an unreadable catalog blocks every
  // dispatch. The default environment is valid with no config at all, so an
  // unreadable environment list blocks only a caller who NAMED a non-default
  // one: that is a specific claim about a specific host, and dispatching it
  // unvalidated would move the failure into a CI job nobody can see. A blank
  // (or the reserved `pipeline`, which asserts no URL) still runs.
  const askedEnvironment =
    typeof given.environment === "string" ? given.environment.trim() : "";

  if (
    environments.error &&
    askedEnvironment &&
    askedEnvironment !== RESERVED_ENVIRONMENT
  ) {
    throw failure(
      503,
      `The environment list is unavailable, so "${cleanText(askedEnvironment, ENVIRONMENT_NAME_MAX)}" cannot be validated: ${environments.error}`,
    );
  }

  const resolved = normalizeOptions(flow, options, environments);

  // Read-only browsing works against a public repo without credentials, but
  // dispatching never does. Say so plainly instead of forwarding a 404.
  if (!cfg.hasToken) {
    throw failure(
      501,
      "This runner has no GitHub token configured, so it cannot start runs. Set TR_GITHUB_TOKEN (actions:write on the target repository) and restart.",
    );
  }

  const repoSegment = requireRepo(cfg);
  const workflowFile = workflowSegment(cfg);
  const who = actorLabel(actor);

  // Attribution travels in the reason because that is what the workflow prints
  // in its job summary. Without it, every run looks like it was started by the
  // token owner, and nobody with repository access can answer "who ran this".
  const attributedReason = resolved.reason
    ? `${who} via test runner: ${resolved.reason}`
    : `${who} via test runner`;

  // ...and it travels a second time, in `requested_by`, because the reason does
  // not survive. GitHub returns dispatch inputs to nobody: the reason reaches
  // the browser only in the response to our own POST, so a reload loses it and
  // "Started by" falls back to "unknown". The run TITLE is the one caller-written
  // string GitHub hands back with run metadata, and the workflow's `run-name`
  // interpolates this input into it.
  //
  // Sent only when the name has an account's shape. The workflow renders
  // "<flow> · requested by <value>" and app.js only accepts a whitespace-free
  // token there, so a value like actorLabel()'s "unknown user" fallback would
  // produce a title the client correctly refuses to read a name out of. Omitting
  // the input instead makes `run-name` fall back to github.actor, which is the
  // honest answer for a run this app did not attribute.
  const requestedBy = REQUESTED_BY_SHAPE.test(who) ? who : "";

  // Every input is a string on purpose: workflow_dispatch rejects numbers and
  // booleans outright, and the failure is a 422 with no useful detail.
  const inputs = {
    ...flowInputs(flow),
    target_url: resolved.targetUrl,
    // The NAME, not the URL. The plan job resolves it against the checked-out
    // pipeline.config.json and publishes the URL to the shards, so the
    // environment is resolved exactly once per run, in one job, from one file.
    // Sent even when it is the default, so the run records the environment the
    // person actually saw in the picker rather than whatever the plan job's copy
    // of the config happens to default to.
    environment: resolved.environment,
    shards: String(resolved.shards),
    browser: resolved.browser,
    retries: String(resolved.retries),
    workers: String(resolved.workers),
    reason: attributedReason,
  };

  // Conditionally, not unconditionally: workflow_dispatch takes the input as a
  // string, and an empty one is truthy enough for `inputs.requested_by && ...`
  // in the workflow expression to render "requested by " with nothing after it.
  if (requestedBy) inputs.requested_by = requestedBy;

  const dispatchedAt = Date.now();

  await githubRequest(
    `/repos/${repoSegment}/actions/workflows/${workflowFile}/dispatches`,
    { method: "POST", body: { ref: cfg.ref, inputs } },
  );

  const run = await matchDispatchedRun(
    cfg,
    repoSegment,
    workflowFile,
    dispatchedAt,
  );

  return {
    run,
    flow,
    options: { ...resolved, attributedReason },
    // Somewhere to send the colleague when the run has not appeared yet.
    workflowUrl: `https://github.com/${cfg.repo}/actions/workflows/${cfg.workflowFile}`,
  };
}

// ---------------------------------------------------------------------------
// Reading runs
// ---------------------------------------------------------------------------

async function listRuns(limit) {
  const cfg = config();
  const repoSegment = requireRepo(cfg);
  const workflowFile = workflowSegment(cfg);

  // Clamped rather than rejected: a page size is a display preference, and a
  // polling UI asking for too many runs should get a sane page, not a 400.
  const perPage = clampInteger(limit, { min: 1, max: 50, fallback: 15 });

  // Rethrown with an explanation rather than GitHub's bare "Not Found", which
  // is identical for an unpushed workflow, an invisible repository, and a wrong
  // path. The status is preserved so the caller still maps it correctly.
  let payload;

  try {
    payload = await githubRequest(
      `/repos/${repoSegment}/actions/workflows/${workflowFile}/runs?per_page=${perPage}`,
    );
  } catch (error) {
    const explained = failure(
      error.statusCode || error.status || 502,
      explainRunLookupFailure(error),
    );
    explained.status = error.status;
    throw explained;
  }

  const runs = Array.isArray(payload && payload.workflow_runs)
    ? payload.workflow_runs.map(mapRun).filter(Boolean)
    : [];

  return { runs };
}

async function getRun(runId) {
  const cfg = config();

  const id = requireRunId(runId);
  const repoSegment = requireRepo(cfg);

  // Same reason as in cancelRun and getRunLogs: the ownership check below is
  // only meaningful when there is a configured workflow to compare against, so
  // an unconfigured runner is a plain 501 rather than a guard that silently
  // refuses every run.
  workflowSegment(cfg);

  // The guard belongs here as much as it does in front of cancel and logs, and
  // it used to be missing: this function went straight from requireRunId to
  // issuing its requests, and server.js routes GET /api/runs/<anything> to it
  // for any signed-in user. That handed a colleague with no repository standing
  // a way to enumerate run ids and read display_title, head_branch, event,
  // actor and html_url, plus every job name, step name and artifact name of
  // PR-validation and deploy pipelines. Metadata is not a lesser disclosure
  // than log text; it is the map.
  //
  // So the run is identified before anything is requested about it, which costs
  // one round trip: the run first, then jobs and artifacts. Fetching all three
  // at once would put the jobs and artifacts of somebody else's run on the wire
  // before we knew whose run it was, and a guard that reads the data it is
  // meant to withhold is not a guard.
  const raw = await requireOwnRun(repoSegment, cfg, id);
  const run = mapRun(raw);

  if (!run) {
    throw failure(404, `Run ${id} was not found.`);
  }

  // Jobs and artifacts are supporting detail: a run whose jobs endpoint is
  // briefly unavailable should still render, so neither rejection propagates.
  const [jobsResult, artifactsResult] = await Promise.allSettled([
    githubRequest(`/repos/${repoSegment}/actions/runs/${id}/jobs?per_page=100`),
    githubRequest(
      `/repos/${repoSegment}/actions/runs/${id}/artifacts?per_page=100`,
    ),
  ]);

  // Whether the job list is *known*, not whether it has entries: an empty list
  // is a truthful answer for a run that has scheduled nothing yet, and that is a
  // different fact from "the jobs endpoint did not answer". The refinement below
  // may only speak when the list is known.
  const jobsKnown =
    jobsResult.status === "fulfilled" &&
    Array.isArray(jobsResult.value && jobsResult.value.jobs);

  const jobs = jobsKnown ? jobsResult.value.jobs.map(mapJob) : [];

  const artifacts =
    artifactsResult.status === "fulfilled" &&
    Array.isArray(artifactsResult.value && artifactsResult.value.artifacts)
      ? artifactsResult.value.artifacts.map(mapArtifact)
      : [];

  // This is the one place a "failure" conclusion can be resolved into what
  // actually happened, because it is the only place the jobs are in hand. At
  // list level all we have is the word "failure", which covers a failed
  // assertion and a failed npm ci equally.
  //
  // Without the job list there is nothing to refine with, so the provisional
  // verdict stands with outcomePrecise still false. That is the honest answer;
  // guessing would be a confident wrong one.
  const refined =
    jobsKnown && run.outcome === "failed"
      ? { ...run, ...refineFailureOutcome(jobs) }
      : run;

  return { run: refined, jobs, artifacts };
}

// ---------------------------------------------------------------------------
// Cancelling a run
// ---------------------------------------------------------------------------

async function cancelRun(runId, actor) {
  const cfg = config();

  const id = requireRunId(runId);
  const repoSegment = requireRepo(cfg);

  // Not interpolated into any path here, but the ownership check below compares
  // against it, so an unconfigured workflow has to be a plain 501 rather than a
  // guard that quietly refuses everything.
  workflowSegment(cfg);

  if (!cfg.hasToken) {
    throw failure(
      501,
      "This runner has no GitHub token configured, so it cannot cancel runs. Set TR_GITHUB_TOKEN (actions:write on the target repository) and restart.",
    );
  }

  const raw = await requireOwnRun(repoSegment, cfg, id);

  // Cancelling a finished run is not harmful, just meaningless - GitHub answers
  // 409 for it too. Saying so beats reporting success for an act that did
  // nothing and leaving the reader to wonder why the run still says "failure".
  if (raw.status === "completed") {
    throw failure(
      409,
      `Run ${id} has already completed, so there is nothing to cancel.`,
    );
  }

  const who = actorLabel(actor);

  await githubRequest(`/repos/${repoSegment}/actions/runs/${id}/cancel`, {
    method: "POST",
  });

  // The one audit line this app writes. A run that stops mid-flight looks like
  // a failure to whoever reads the pipeline next, and nothing on GitHub's side
  // records which colleague asked - the run is attributed to the token owner.
  // Actor and run id only; the token is never part of a log line.
  console.log(`[github] run ${id} cancelled by ${who}`);

  return {
    cancelled: true,
    runId: id,
    // GitHub answers 202 with an empty body and unwinds the run
    // asynchronously, so the truthful answer is the status the run had when we
    // asked. Polling picks up "completed" / "cancelled" moments later.
    status: raw.status ?? null,
  };
}

// ---------------------------------------------------------------------------
// Run logs
// ---------------------------------------------------------------------------

// A job with no readable log is the normal case, not an error: most of the life
// of a run somebody is watching is spent with jobs that have not started yet.
function logNoteForStatus(status) {
  if (status === 404) {
    return "No logs yet - the job has not started";
  }

  if (status === 410) {
    return "Logs expired";
  }

  if (status === 403) {
    return "Logs are not readable with this runner's GitHub permissions";
  }

  return `Logs could not be read (GitHub responded with HTTP ${status})`;
}

// Fetched as text, never parsed as JSON: this endpoint answers 302 to a signed
// blob URL and the body at the end of that redirect is a plain log file.
//
// Two things stay inside this function. The signed URL, because it grants log
// access to whoever holds it for as long as it lives - it is never returned or
// logged. And the token: Node's fetch drops the Authorization header when a
// redirect crosses origins, so the credential does not travel on to the storage
// host that actually serves the bytes.
//
// Resolves rather than rejects. One job without logs must not cost the caller
// the logs of every other job in the run.
async function fetchJobLog(repoSegment, jobId) {
  const { token } = config();
  const headers = buildHeaders(token);

  // buildHeaders asks for JSON, which is not what comes back here.
  headers.accept = "*/*";

  let result;

  try {
    result = await fetchTimedText(
      `${API_ROOT}/repos/${repoSegment}/actions/jobs/${jobId}/logs`,
      { headers, redirect: "follow" },
      // The tail is all we keep, so the read holds MAX_LOG_CHARS rather than the
      // whole log, and stops outright at MAX_LOG_BYTES. This is the read that
      // most needed a real deadline: it streams from a signed blob host, not
      // from the API, and it used to be entirely untimed once headers arrived.
      { maxBytes: MAX_LOG_BYTES, keepChars: MAX_LOG_CHARS },
    );
  } catch (error) {
    return {
      text: "",
      truncated: false,
      note:
        error && error.name === "AbortError"
          ? `Logs did not download within ${REQUEST_TIMEOUT_MS / 1000}s`
          : "Logs could not be downloaded",
    };
  }

  if (!result.ok) {
    return {
      text: "",
      truncated: false,
      note: logNoteForStatus(result.status),
    };
  }

  // Two different truncations, and the reader can promise less about one of
  // them: a trimmed read still ends at the real end of the log, a capped read
  // stopped mid-file, so what it holds is the tail of the first MAX_LOG_BYTES
  // and not the tail of the job. Say which one happened.
  const note = result.capped
    ? `Log is larger than ${MAX_LOG_BYTES.toLocaleString("en-US")} bytes; showing part of it, not the end`
    : result.truncated
      ? `Showing the last ${MAX_LOG_CHARS.toLocaleString("en-US")} characters`
      : null;

  return { text: result.text, truncated: result.truncated, note };
}

async function getRunLogs(runId) {
  const cfg = config();

  const id = requireRunId(runId);
  const repoSegment = requireRepo(cfg);

  // Same reason as in cancelRun: the ownership check is only meaningful when
  // there is a configured workflow to compare against.
  workflowSegment(cfg);

  // The guard runs before a single log byte is requested. Log text is the most
  // revealing thing this app can hand out - other workflows print environment
  // detail, internal hostnames and deployment steps into theirs.
  await requireOwnRun(repoSegment, cfg, id);

  const payload = await githubRequest(
    `/repos/${repoSegment}/actions/runs/${id}/jobs?per_page=100`,
  );

  const rawJobs = Array.isArray(payload && payload.jobs)
    ? payload.jobs.filter((raw) => raw && typeof raw === "object")
    : [];

  // Concurrent because a sharded run has one job per shard, and a serial walk
  // would multiply the wait by the shard count while a colleague watches a
  // spinner. The runner workflow tops out at eight shards plus its setup and
  // report jobs, so this is a handful of requests rather than a hundred.
  //
  // Waiting on all of them still means the slowest job sets the response time -
  // this resolves when the last log does, not when the first does. What bounds
  // that is REQUEST_TIMEOUT_MS inside fetchTimedText, now that it covers the
  // body: before, a single job whose log stalled mid-stream left this unsettled
  // for good and the colleague's HTTP response never completed.
  //
  // allSettled, not all: one job's failure must not cost the caller the logs of
  // every other job. fetchJobLog already resolves rather than rejects, so a
  // rejection here means something unforeseen - and the contract is per-job
  // notes, so it is reported as one.
  const settled = await Promise.allSettled(
    rawJobs.map((raw) =>
      // Encoded even though GitHub authored it: nothing in this file reaches a
      // URL path without passing through validation or encoding first.
      fetchJobLog(repoSegment, encodeURIComponent(String(raw.id))),
    ),
  );

  const jobs = rawJobs.map((raw, index) => {
    const job = mapJob(raw);
    // Renamed away from "outcome": that word now means a run outcome everywhere
    // else in this file, and this is a settled promise, not a verdict.
    const settledLog = settled[index];
    const log =
      settledLog.status === "fulfilled"
        ? settledLog.value
        : { text: "", truncated: false, note: "Logs could not be read" };

    return {
      id: job.id,
      name: jobDisplayName(job.name),
      status: job.status,
      conclusion: job.conclusion,
      text: log.text,
      truncated: log.truncated,
      note: log.note,
    };
  });

  return { runId: id, jobs };
}

// ---------------------------------------------------------------------------
// Statistics
// ---------------------------------------------------------------------------

// GitHub returns workflow runs newest first, but `lastRun` and `recent` are
// fields a reader trusts without checking, so the order is re-derived instead of
// assumed. A run with an unparsable date sorts last rather than to the front.
function runTimestamp(run) {
  const parsed = Date.parse(run && run.createdAt);

  return Number.isFinite(parsed) ? parsed : 0;
}

// Everything here comes from one listRuns page, which is why stats add no API
// surface and cannot fail in a way the run list would not have failed already.
async function getStats(limit) {
  // Clamped rather than rejected, like listRuns: a dashboard asking for an odd
  // window should get a sane one. listRuns caps a single page at 50, so a
  // request above that is answered from 50 runs instead of erroring - the wider
  // ceiling here is about accepting the caller's number, not promising it.
  const requested = clampInteger(limit, {
    min: 1,
    max: STATS_MAX_LIMIT,
    fallback: STATS_DEFAULT_LIMIT,
  });

  // The dashboard is the landing screen, so it must render even when GitHub
  // cannot answer: no token yet, the workflow not pushed, the repo renamed, a
  // rate limit. Returning a diagnosis beats 404-ing the whole page, and
  // getFlows() already sets that precedent.
  let runs;

  try {
    ({ runs } = await listRuns(requested));
  } catch (error) {
    return {
      total: 0,
      passed: 0,
      failed: 0,
      infra: 0,
      cancelled: 0,
      active: 0,
      successRate: 0,
      rated: 0,
      byConclusion: {},
      byStatus: {},
      lastRun: null,
      recent: [],
      error: explainRunLookupFailure(error),
    };
  }

  const byConclusion = {};
  const byStatus = {};

  for (const name of SEEDED_CONCLUSIONS) {
    byConclusion[name] = 0;
  }

  for (const name of SEEDED_STATUSES) {
    byStatus[name] = 0;
  }

  // Seeded so the six buckets always exist, and counted from the classified
  // outcome rather than from the raw conclusion: the whole point of the
  // classification is that "not success" and "tests failed" are different
  // populations, and the rate below has to be computed over the second one.
  const byOutcome = {
    passed: 0,
    failed: 0,
    infra: 0,
    cancelled: 0,
    running: 0,
    queued: 0,
  };

  for (const run of runs) {
    if (typeof run.status === "string" && run.status) {
      byStatus[run.status] = (byStatus[run.status] || 0) + 1;
    }

    // Kept for compatibility with anything reading GitHub's own vocabulary. A
    // queued or in-flight run has no conclusion yet and is simply absent here.
    if (typeof run.conclusion === "string" && run.conclusion) {
      byConclusion[run.conclusion] = (byConclusion[run.conclusion] || 0) + 1;
    }

    if (Object.hasOwn(byOutcome, run.outcome)) {
      byOutcome[run.outcome] += 1;
    }
  }

  const ordered = [...runs].sort((a, b) => runTimestamp(b) - runTimestamp(a));

  // The denominator, and the reason this function changed: a run only gets a
  // vote on test health if it actually reached a test verdict. Cancelled runs,
  // timed-out runners, failed checkouts and in-flight runs are excluded - each
  // of them used to pull the figure down while saying nothing about the suite,
  // which made the headline number on the dashboard quietly untrue.
  const rated = byOutcome.passed + byOutcome.failed;

  return {
    total: runs.length,
    passed: byOutcome.passed,
    failed: byOutcome.failed,
    infra: byOutcome.infra,
    cancelled: byOutcome.cancelled,
    active: byOutcome.running + byOutcome.queued,
    // Integer percent of rated runs that passed. No rated runs is 0, not NaN: a
    // runner nobody has used is not a runner failing every run, and `rated`
    // alongside `total` is what tells those two apart - which is also why
    // `rated` is returned, so the UI can say "over N rated runs" instead of
    // implying a percentage it did not compute.
    successRate: rated ? Math.round((byOutcome.passed / rated) * 100) : 0,
    rated,
    byConclusion,
    byStatus,
    lastRun: ordered.length ? ordered[0] : null,
    recent: ordered.slice(0, RECENT_RUN_COUNT),
  };
}

module.exports = {
  getFlows,
  getEnvironments,
  startRun,
  listRuns,
  getRun,
  cancelRun,
  getRunLogs,
  getStats,
};
