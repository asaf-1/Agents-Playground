// Shared vocabulary for the remote test runner.
//
// One module owns flow lookup, option validation, and command building so the
// discovery script, the GitHub workflow, the executor, and server.js can never
// disagree about what a flow id means or which arguments it expands to.
//
// Security note: every value that reaches a child process either comes from the
// committed catalog or passes one of the normalize* validators below, and
// exec-flow.js spawns with shell:false. No caller input is ever interpolated
// into a shell string.

// Files and paths.
const fs = require("node:fs");
const path = require("node:path");

// The repo's root folder.
const REPO_ROOT = path.resolve(__dirname, "..", "..");
// The flow catalog and the hand-written flow groups, beside this file.
const CATALOG_PATH = path.join(__dirname, "flow-catalog.json");
const GROUPS_PATH = path.join(__dirname, "flow-groups.json");
// Where the resolved plan is written.
const PLAN_PATH = path.join(
  REPO_ROOT,
  ".artifacts",
  "test-runner",
  "plan.json",
);

// Spawned directly with node rather than through npx: Node refuses to spawn a
// .cmd shim with shell:false, and enabling a shell would reintroduce the
// injection surface this module exists to avoid.
const PLAYWRIGHT_CLI = path.join(
  REPO_ROOT,
  "node_modules",
  "@playwright",
  "test",
  "cli.js",
);
// The Vitest program, run the same way.
const VITEST_CLI = path.join(REPO_ROOT, "node_modules", "vitest", "vitest.mjs");

// The catalog's format version.
const SCHEMA_VERSION = 1;
// The test runners a flow can use.
const RUNNERS = new Set(["playwright", "playwright-visual", "vitest"]);
// The browsers, and the default one.
const BROWSERS = new Set(["chromium", "firefox", "webkit"]);
const DEFAULT_BROWSER = "chromium";
// The largest shard, retry and worker counts accepted.
const MAX_SHARDS = 8;
const MAX_RETRIES = 3;
const MAX_WORKERS = 8;
// A flow id: lowercase letters, digits and hyphens, at most 120 characters.
const FLOW_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,119}$/;

// pipeline.config.json, which lists the environments.
const PIPELINE_CONFIG_PATH = path.join(REPO_ROOT, "pipeline.config.json");
// The environments block's format version.
const ENVIRONMENTS_SCHEMA_VERSION = 1;
// The environment that needs no set-up: the run builds and serves the app.
const DEFAULT_ENVIRONMENT = "pipeline";
// Same discipline as FLOW_ID_PATTERN and for the same reason: an environment
// name is caller-supplied and gets echoed into error messages and a job summary.
const ENVIRONMENT_NAME_PATTERN = /^[a-z0-9][a-z0-9-]{0,31}$/;

// Text as a short lowercase id with hyphens.
function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

// Text made safe to put inside a regular expression.
function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Shard count a flow can usefully absorb. One shard per ~8 tests keeps runner
// startup cost (npm ci plus browser install) from dominating the wall clock.
function suggestMaxShards(testCount) {
  if (testCount <= 8) return 1;
  if (testCount <= 24) return 2;
  if (testCount <= 60) return 4;
  return MAX_SHARDS;
}

// The catalog file as JSON, or null when there is none; bad JSON throws.
function readCatalog(catalogPath = CATALOG_PATH) {
  // No file.
  if (!fs.existsSync(catalogPath)) {
    return null;
  }

  // Read it; bad JSON is an error naming the file.
  try {
    return JSON.parse(fs.readFileSync(catalogPath, "utf8"));
  } catch (error) {
    throw new Error(
      `Flow catalog at ${catalogPath} is not valid JSON: ${error.message}`,
    );
  }
}

// The catalog, which must exist, be this format, and hold at least one flow.
function requireCatalog(catalogPath = CATALOG_PATH) {
  // Read it.
  const catalog = readCatalog(catalogPath);

  // Missing: say how to make it.
  if (!catalog) {
    throw new Error(
      `Flow catalog not found at ${catalogPath}. Generate it with: npm run flows:discover`,
    );
  }

  // An older or newer format: say how to rebuild it.
  if (catalog.schemaVersion !== SCHEMA_VERSION) {
    throw new Error(
      `Flow catalog schemaVersion ${catalog.schemaVersion} is not supported (expected ${SCHEMA_VERSION}). Regenerate with: npm run flows:discover`,
    );
  }

  // No flows: an error.
  if (!Array.isArray(catalog.flows) || catalog.flows.length === 0) {
    throw new Error(`Flow catalog at ${catalogPath} contains no flows.`);
  }

  // The catalog.
  return catalog;
}

// A flow by id, after checking the id's form and the flow's runner.
function findFlow(catalog, flowId) {
  // A malformed id is refused before any lookup.
  if (!FLOW_ID_PATTERN.test(String(flowId || ""))) {
    throw new Error(
      `Invalid flow id: ${JSON.stringify(flowId)}. Expected lowercase letters, digits, and hyphens.`,
    );
  }

  // The flow with that id.
  const flow = catalog.flows.find((candidate) => candidate.id === flowId);

  // Unknown: say how to list them.
  if (!flow) {
    throw new Error(
      `Unknown flow id: ${flowId}. Run "npm run flows:list" to see available flows.`,
    );
  }

  // A runner this file does not know is an error.
  if (!RUNNERS.has(flow.runner)) {
    throw new Error(
      `Flow ${flowId} declares unsupported runner ${flow.runner}`,
    );
  }

  // The flow.
  return flow;
}

// The shard count: the flow's own maximum by default, and never above it.
function normalizeShards(value, flow) {
  // The most this flow can use.
  const ceiling = Math.min(flow?.maxShards || 1, MAX_SHARDS);

  // Not given: the most it can use.
  if (value === undefined || value === null || value === "" || value === 0) {
    return ceiling;
  }

  // As a number.
  const shards = Number(value);

  // Only whole numbers from 1 to 8.
  if (!Number.isInteger(shards) || shards < 1 || shards > MAX_SHARDS) {
    throw new Error(`shards must be an integer between 1 and ${MAX_SHARDS}.`);
  }

  // Sharding a Vitest or visual flow buys nothing and splits the report.
  if (flow && flow.runner !== "playwright") {
    return 1;
  }

  // At most the flow's own maximum.
  return Math.min(shards, ceiling);
}

// The browser: chromium by default, else one of the three.
function normalizeBrowser(value) {
  // Not given: chromium.
  if (!value) return DEFAULT_BROWSER;

  // Any case is accepted.
  const browser = String(value).toLowerCase();

  // Anything else is an error.
  if (!BROWSERS.has(browser)) {
    throw new Error(
      `browser must be one of: ${[...BROWSERS].join(", ")}. Received ${JSON.stringify(value)}.`,
    );
  }

  // The browser.
  return browser;
}

// A count (retries or workers): the fallback when not given, else a whole
// number from 0 to max.
function normalizeCount(value, { name, max, fallback }) {
  // Not given: the fallback.
  if (value === undefined || value === null || value === "") return fallback;

  // As a number.
  const count = Number(value);

  // Out of range: an error naming the setting.
  if (!Number.isInteger(count) || count < 0 || count > max) {
    throw new Error(`${name} must be an integer between 0 and ${max}.`);
  }

  // The count.
  return count;
}

// An empty target means "let Playwright build and serve the app itself".
function normalizeTargetUrl(value) {
  // Not given: empty.
  if (!value) return "";

  // Without spaces around it.
  const raw = String(value).trim();

  // Only spaces: empty.
  if (!raw) return "";

  // Read it as a URL; anything that is not one is an error.
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`targetUrl must be an absolute http(s) URL. Got: ${raw}`);
  }

  // Only http and https.
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(
      `targetUrl must use http or https. Got: ${parsed.protocol}`,
    );
  }

  // The origin and path, without a trailing slash.
  return parsed.origin + parsed.pathname.replace(/\/$/, "");
}

// The one environment that needs no configuration to be correct: no deployed
// host, the run builds and serves the app itself. `baseURL: null` is what gives
// the absence of a URL a name, so a plan artifact and a job summary can say
// which environment a run claimed instead of leaving a blank to interpret.
function builtInEnvironments(note) {
  // Only the built-in environment, plus a note saying why.
  return {
    default: DEFAULT_ENVIRONMENT,
    entries: [
      {
        name: DEFAULT_ENVIRONMENT,
        label: "Pipeline build (this run)",
        description:
          "The run builds the app from the checked-out commit and serves it itself. No deployed host is involved.",
        baseURL: null,
      },
    ],
    builtIn: note || null,
  };
}

// One environment entry from pipeline.config.json, checked; a bad one throws,
// naming where it is.
function normalizeEnvironmentEntry(raw, index) {
  // Where it is, for the error messages.
  const at = `pipeline.config.json -> environments.entries[${index}]`;

  // It must be an object.
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`${at} must be an object.`);
  }

  // Its name.
  const name = typeof raw.name === "string" ? raw.name : "";

  // A bad name is an error.
  if (!ENVIRONMENT_NAME_PATTERN.test(name)) {
    throw new Error(
      `${at}.name is ${JSON.stringify(raw.name ?? null)}, which is not a valid environment name. Expected lowercase letters, digits, and hyphens.`,
    );
  }

  // An explicit null means "there is deliberately no deployed URL"; an absent or
  // blank key means someone started an edit and did not finish it. Those two
  // must never resolve to the same behaviour, or a half-added environment runs
  // against a locally built app and reports green under a deployed name.
  const hasKey = Object.prototype.hasOwnProperty.call(raw, "baseURL");
  const blank =
    raw.baseURL === undefined ||
    (typeof raw.baseURL === "string" && raw.baseURL.trim() === "");

  // No baseURL, or a blank one: an error, with the two right ways to write it.
  if (!hasKey || blank) {
    throw new Error(
      `Environment ${JSON.stringify(name)} in pipeline.config.json has no baseURL. Give it an absolute http(s) URL, or set "baseURL": null to mean the pipeline builds and serves the app itself.`,
    );
  }

  // No URL unless one is given.
  let baseURL = null;

  // A URL is checked the same way as a typed one.
  if (raw.baseURL !== null) {
    // The existing validator, so a config URL and a typed URL are held to
    // identical rules and normalize to one string. Two runs of the same suite
    // against the same host must not disagree in their report headers.
    try {
      baseURL = normalizeTargetUrl(raw.baseURL);
    } catch (error) {
      throw new Error(
        `Environment ${JSON.stringify(name)} in pipeline.config.json has an invalid baseURL: ${error.message}`,
      );
    }

    // An empty result is invalid too.
    if (!baseURL) {
      throw new Error(
        `Environment ${JSON.stringify(name)} in pipeline.config.json has an invalid baseURL: targetUrl must be an absolute http(s) URL. Got: ${JSON.stringify(raw.baseURL)}`,
      );
    }
  }

  // The built-in name cannot have a URL.
  if (name === DEFAULT_ENVIRONMENT && baseURL !== null) {
    throw new Error(
      `pipeline.config.json declares environment "${DEFAULT_ENVIRONMENT}" with a baseURL; that name is reserved for the build-it-here case and its baseURL must be null.`,
    );
  }

  // The entry, with its label and description trimmed.
  return {
    name,
    label: typeof raw.label === "string" ? raw.label.trim() : "",
    description:
      typeof raw.description === "string" ? raw.description.trim() : "",
    baseURL,
  };
}

// Reads the environment list from pipeline.config.json.
//
// A MISSING file falls back to the built-in single-entry set: the file is
// committed, so its absence means a broken checkout, and refusing every run in
// that state buys nothing when the default environment is self-contained by
// definition. A PRESENT but malformed file throws ALWAYS, even for a run that
// would never have read a URL — a missing file is unambiguous, a malformed one
// is a lie of unknown size, and the likeliest cause is the operator who just
// added an environment and mistyped the JSON, i.e. exactly the edit that a
// silent fall back to the default would hide.
function readEnvironments(configPath = PIPELINE_CONFIG_PATH) {
  // No file: only the built-in environment.
  if (!fs.existsSync(configPath)) {
    return builtInEnvironments(
      'pipeline.config.json was not found, so only the built-in "pipeline" environment exists.',
    );
  }

  // The file's settings.
  let config;

  // Read them; bad JSON is an error.
  try {
    config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch (error) {
    throw new Error(`pipeline.config.json is not valid JSON: ${error.message}`);
  }

  // An absent block is not an error either: repository_dispatch can name any
  // revision, including refs written before environments existed.
  if (
    config === null ||
    typeof config !== "object" ||
    config.environments === undefined
  ) {
    return builtInEnvironments(
      'pipeline.config.json has no environments block, so only the built-in "pipeline" environment exists.',
    );
  }

  // The environments block.
  const block = config.environments;

  // It must be an object.
  if (block === null || typeof block !== "object" || Array.isArray(block)) {
    throw new Error("pipeline.config.json -> environments must be an object.");
  }

  // Checked before any lookup, exactly as the flow catalog's schemaVersion is
  // verified before findFlow(): a shape this code does not understand must be
  // refused, not partly ignored.
  if (block.schemaVersion !== ENVIRONMENTS_SCHEMA_VERSION) {
    throw new Error(
      `pipeline.config.json -> environments.schemaVersion ${JSON.stringify(block.schemaVersion ?? null)} is not supported (expected ${ENVIRONMENTS_SCHEMA_VERSION}).`,
    );
  }

  // At least one entry.
  if (!Array.isArray(block.entries) || block.entries.length === 0) {
    throw new Error(
      "pipeline.config.json -> environments.entries must be a non-empty array.",
    );
  }

  // Check every entry, then look for a name used twice.
  const entries = block.entries.map((raw, index) =>
    normalizeEnvironmentEntry(raw, index),
  );
  const names = entries.map((entry) => entry.name);
  const duplicate = names.find((name, index) => names.indexOf(name) !== index);

  // A name used twice is an error.
  if (duplicate) {
    throw new Error(
      `pipeline.config.json -> environments.entries declares environment ${JSON.stringify(duplicate)} more than once.`,
    );
  }

  // The default environment's name.
  const fallback = typeof block.default === "string" ? block.default : "";

  // It must be one of the entries.
  if (!names.includes(fallback)) {
    throw new Error(
      `pipeline.config.json -> environments.default is ${JSON.stringify(block.default ?? null)}, which is not one of: ${names.join(", ")}.`,
    );
  }

  // The checked list.
  return { default: fallback, entries, builtIn: null };
}

// Read once per process for callers that do not pass a list in. normalizeOptions
// must stay pure and synchronous — buildArgv, buildEnv and describeCommand each
// call it, several times per plan — so it never reads the filesystem itself.
let environmentsCache = null;

// The environment list, read from the file the first time only.
function cachedEnvironments() {
  if (!environmentsCache) {
    environmentsCache = readEnvironments();
  }

  // The list.
  return environmentsCache;
}

// Mirrors findFlow(): a caller-supplied environment name is the same class of
// untrusted vocabulary as a flow id, so it gets the same trust boundary — shape
// check first so a hostile or huge value never reaches the next message
// verbatim, then a lookup that lists the valid names instead of guessing.
function findEnvironment(environments, name) {
  // The name asked for, as text.
  const requested = String(name ?? "");

  // A malformed name is refused before any lookup.
  if (!ENVIRONMENT_NAME_PATTERN.test(requested)) {
    throw new Error(
      `Invalid environment name: ${JSON.stringify(requested)}. Expected lowercase letters, digits, and hyphens.`,
    );
  }

  // The entry with that name.
  const entries = environments?.entries || [];
  const entry = entries.find((candidate) => candidate.name === requested);

  // Unknown: list the ones there are.
  if (!entry) {
    const known = entries.map((candidate) => candidate.name).join(", ");
    const note = environments?.builtIn ? ` ${environments.builtIn}` : "";

    // Fail, naming them.
    throw new Error(
      `Unknown environment: ${requested}. Configured environments: ${known}. Environments are defined in pipeline.config.json -> environments.entries.${note}`,
    );
  }

  // The entry.
  return entry;
}

// Blank resolves to the configured default, never to a hardcoded "pipeline":
// the config owns the default so it can move later without a code change.
function normalizeEnvironment(value, { environments } = {}) {
  // The list, the name asked for, and its entry; blank means the default.
  const list = environments || builtInEnvironments(null);
  const requested = String(value ?? "").trim();
  const entry = findEnvironment(list, requested || list.default);

  // The environment, and whether the caller named it.
  return {
    name: entry.name,
    label: entry.label || entry.name,
    description: entry.description || "",
    baseURL: entry.baseURL ?? null,
    // Whether the caller named it, as opposed to inheriting the default.
    explicit: Boolean(requested),
  };
}

// The free-text reason, on one line and at most 200 characters.
function normalizeReason(value) {
  return String(value || "")
    .replace(/[\r\n\t]+/g, " ")
    .trim()
    .slice(0, 200);
}

// Every option checked, with the environment and target URL settled.
function normalizeOptions(flow, options = {}) {
  // The environment, and any typed URL.
  const environment = normalizeEnvironment(options.environment, {
    environments: options.environments || cachedEnvironments(),
  });
  const typedUrl = normalizeTargetUrl(options.targetUrl);

  // Naming a place and then typing a different one is a contradiction, not an
  // override request: whichever half were silently dropped, the run title, the
  // job summary and the app's history row would claim the environment name
  // while the browser talked to the other host. A green run labelled "staging"
  // that never touched staging is the worst artifact this system can emit,
  // because someone will cite it as evidence. So it fails, the way findFlow()
  // fails rather than picking the nearest id.
  //
  // Two exceptions, both deliberate. An environment whose baseURL is null
  // asserts no URL, so there is nothing for a typed URL to contradict — that is
  // today's ad-hoc case (a preview deployment, a colleague's tunnel) and it has
  // to keep working. And a typed URL EQUAL to the environment's own baseURL
  // names the same place, so it is redundant rather than contradictory; that
  // also keeps this function idempotent, which matters because buildArgv,
  // buildEnv and describeCommand re-normalize an already-resolved options
  // object whose targetUrl is by then the environment's baseURL.
  if (typedUrl && environment.baseURL && typedUrl !== environment.baseURL) {
    throw new Error(
      `Both an environment and a target URL were given: environment "${environment.name}" resolves to ${environment.baseURL}, target_url is ${typedUrl}. Pick one — supply target_url only for a host that has no environment entry.`,
    );
  }

  // "" is the build-it-here case: needsApp stays true and Playwright's
  // webServer boots the app, exactly as before environments existed.
  let targetUrl = typedUrl || environment.baseURL || "";

  // A URL for a flow that opens no browser: a typed one or a named environment
  // fails; the default is ignored.
  if (targetUrl && !needsApp(flow)) {
    // Why no URL applies, for the message.
    const why =
      flow.runner === "vitest"
        ? `it runs under ${flow.runner} and never opens a browser`
        : "it never opens a browser";

    // A base URL from ANY source, on a flow that opens no browser, fails the
    // plan. The old behaviour discarded it silently, which is the same
    // false-provenance bug wearing different clothes: a passing run whose
    // summary names a host not one byte crossed the network to.
    if (typedUrl) {
      throw new Error(
        `Target URL ${typedUrl} cannot apply to flow ${flow.id}: ${why}, so no base URL is used. Re-run without a target URL.`,
      );
    }

    // A named environment is refused too.
    if (environment.explicit) {
      throw new Error(
        `Environment "${environment.name}" cannot apply to flow ${flow.id}: ${why}, so no base URL is used. Re-run without an environment.`,
      );
    }

    // The DEFAULT environment reaching a browserless flow is accepted and
    // ignored, silently: blank is what the UI, the CLI and repository_dispatch
    // all send when nobody picked anything, and failing here would make this
    // the one flow you cannot start without first clearing a field — which is
    // how a safety check becomes something people route around.
    targetUrl = "";
  }

  // The checked options.
  return {
    // Recorded so the plan artifact states permanently which environment a run
    // claimed, alongside the URL it actually used.
    environment: environment.name,
    shards: normalizeShards(options.shards, flow),
    browser: normalizeBrowser(options.browser),
    retries: normalizeCount(options.retries, {
      name: "retries",
      max: MAX_RETRIES,
      fallback: 0,
    }),
    workers: normalizeCount(options.workers, {
      name: "workers",
      max: MAX_WORKERS,
      fallback: 2,
    }),
    targetUrl,
    reason: normalizeReason(options.reason),
    reporter: options.reporter === "list" ? "list" : "blob",
  };
}

// Expands a flow plus validated options into an argv array. Never a string:
// callers spawn this with shell:false.
function buildArgv(flow, options, shardIndex = 1) {
  // The checked options.
  const resolved = normalizeOptions(flow, options);

  // A Vitest flow: no options on its command line.
  if (flow.runner === "vitest") {
    return ["vitest", "run"];
  }

  // Playwright's test command.
  const argv = ["playwright", "test"];

  // The visual flows use their own config file.
  if (flow.runner === "playwright-visual") {
    argv.push("-c", "playwright.visual.config.ts");
  }

  // The flow's spec files.
  for (const spec of flow.specs || []) {
    argv.push(spec);
  }

  // Its test-name filter, when it has one.
  if (flow.grep) {
    argv.push(`--grep=${flow.grep}`);
  }

  // Its shard, when there is more than one.
  if (resolved.shards > 1) {
    argv.push(`--shard=${shardIndex}/${resolved.shards}`);
  }

  // Retries, workers and the report format.
  argv.push(`--retries=${resolved.retries}`);
  argv.push(`--workers=${resolved.workers}`);
  argv.push(`--reporter=${resolved.reporter}`);

  // The command, word by word.
  return argv;
}

// Environment the runner needs. When a target URL is supplied we suppress the
// config's webServer block entirely so CI does not build and boot a local app
// it will never talk to.
function buildEnv(flow, options) {
  // The checked options, and the environment to add.
  const resolved = normalizeOptions(flow, options);
  const env = {};

  // Vitest needs none.
  if (flow.runner === "vitest") {
    return env;
  }

  // Playwright rejects --browser when the config defines projects, so browser
  // choice travels as an env var that playwright.config.ts reads.
  env.PLAYWRIGHT_BROWSER = resolved.browser;

  // A target URL: aim at it, and start no local server.
  if (resolved.targetUrl) {
    env.PLAYWRIGHT_BASE_URL = resolved.targetUrl;
    env.PLAYWRIGHT_REUSE_EXISTING_SERVER = "true";
    env.PLAYWRIGHT_EXTERNAL_TARGET = "true";
  }

  // The added environment.
  return env;
}

// Human-readable equivalent, for the UI and job summaries. Display only.
function describeCommand(flow, options, shardIndex = 1) {
  // The command, with its environment in front.
  const argv = buildArgv(flow, options, shardIndex);
  const env = buildEnv(flow, options);
  const prefix = Object.entries(env)
    .map(([key, value]) => `${key}=${value}`)
    .join(" ");
  const command = `npx ${argv.join(" ")}`;

  // As one line.
  return prefix ? `${prefix} ${command}` : command;
}

// Maps the display argv (npx form) onto a shell-free spawn of the local CLI.
function toSpawn(argv) {
  const [tool, ...rest] = argv;
  const cli = tool === "vitest" ? VITEST_CLI : PLAYWRIGHT_CLI;

  // Run with Node, so no shell is needed.
  return { command: process.execPath, args: [cli, ...rest] };
}

// Whether a flow needs the app served: not for Vitest, nor when the flow says
// so.
function needsApp(flow) {
  return flow.needsApp !== false && flow.runner !== "vitest";
}

// What the discovery script, the workflow steps and the runner's server use.
module.exports = {
  BROWSERS,
  CATALOG_PATH,
  DEFAULT_BROWSER,
  DEFAULT_ENVIRONMENT,
  ENVIRONMENTS_SCHEMA_VERSION,
  ENVIRONMENT_NAME_PATTERN,
  FLOW_ID_PATTERN,
  GROUPS_PATH,
  MAX_RETRIES,
  MAX_SHARDS,
  MAX_WORKERS,
  PIPELINE_CONFIG_PATH,
  PLAN_PATH,
  PLAYWRIGHT_CLI,
  REPO_ROOT,
  RUNNERS,
  SCHEMA_VERSION,
  VITEST_CLI,
  buildArgv,
  buildEnv,
  describeCommand,
  escapeRegExp,
  findEnvironment,
  findFlow,
  needsApp,
  normalizeBrowser,
  normalizeCount,
  normalizeEnvironment,
  normalizeOptions,
  normalizeReason,
  normalizeShards,
  normalizeTargetUrl,
  readCatalog,
  readEnvironments,
  requireCatalog,
  slugify,
  suggestMaxShards,
  toSpawn,
};
