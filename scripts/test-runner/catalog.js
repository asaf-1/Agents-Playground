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

const fs = require("node:fs");
const path = require("node:path");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const CATALOG_PATH = path.join(__dirname, "flow-catalog.json");
const GROUPS_PATH = path.join(__dirname, "flow-groups.json");
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
const VITEST_CLI = path.join(REPO_ROOT, "node_modules", "vitest", "vitest.mjs");

const SCHEMA_VERSION = 1;
const RUNNERS = new Set(["playwright", "playwright-visual", "vitest"]);
const BROWSERS = new Set(["chromium", "firefox", "webkit"]);
const DEFAULT_BROWSER = "chromium";
const MAX_SHARDS = 8;
const MAX_RETRIES = 3;
const MAX_WORKERS = 8;
const FLOW_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,119}$/;

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

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

function readCatalog(catalogPath = CATALOG_PATH) {
  if (!fs.existsSync(catalogPath)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(catalogPath, "utf8"));
  } catch (error) {
    throw new Error(
      `Flow catalog at ${catalogPath} is not valid JSON: ${error.message}`,
    );
  }
}

function requireCatalog(catalogPath = CATALOG_PATH) {
  const catalog = readCatalog(catalogPath);

  if (!catalog) {
    throw new Error(
      `Flow catalog not found at ${catalogPath}. Generate it with: npm run flows:discover`,
    );
  }

  if (catalog.schemaVersion !== SCHEMA_VERSION) {
    throw new Error(
      `Flow catalog schemaVersion ${catalog.schemaVersion} is not supported (expected ${SCHEMA_VERSION}). Regenerate with: npm run flows:discover`,
    );
  }

  if (!Array.isArray(catalog.flows) || catalog.flows.length === 0) {
    throw new Error(`Flow catalog at ${catalogPath} contains no flows.`);
  }

  return catalog;
}

function findFlow(catalog, flowId) {
  if (!FLOW_ID_PATTERN.test(String(flowId || ""))) {
    throw new Error(
      `Invalid flow id: ${JSON.stringify(flowId)}. Expected lowercase letters, digits, and hyphens.`,
    );
  }

  const flow = catalog.flows.find((candidate) => candidate.id === flowId);

  if (!flow) {
    throw new Error(
      `Unknown flow id: ${flowId}. Run "npm run flows:list" to see available flows.`,
    );
  }

  if (!RUNNERS.has(flow.runner)) {
    throw new Error(
      `Flow ${flowId} declares unsupported runner ${flow.runner}`,
    );
  }

  return flow;
}

function normalizeShards(value, flow) {
  const ceiling = Math.min(flow?.maxShards || 1, MAX_SHARDS);

  if (value === undefined || value === null || value === "" || value === 0) {
    return ceiling;
  }

  const shards = Number(value);

  if (!Number.isInteger(shards) || shards < 1 || shards > MAX_SHARDS) {
    throw new Error(`shards must be an integer between 1 and ${MAX_SHARDS}.`);
  }

  // Sharding a Vitest or visual flow buys nothing and splits the report.
  if (flow && flow.runner !== "playwright") {
    return 1;
  }

  return Math.min(shards, ceiling);
}

function normalizeBrowser(value) {
  if (!value) return DEFAULT_BROWSER;

  const browser = String(value).toLowerCase();

  if (!BROWSERS.has(browser)) {
    throw new Error(
      `browser must be one of: ${[...BROWSERS].join(", ")}. Received ${JSON.stringify(value)}.`,
    );
  }

  return browser;
}

function normalizeCount(value, { name, max, fallback }) {
  if (value === undefined || value === null || value === "") return fallback;

  const count = Number(value);

  if (!Number.isInteger(count) || count < 0 || count > max) {
    throw new Error(`${name} must be an integer between 0 and ${max}.`);
  }

  return count;
}

// An empty target means "let Playwright build and serve the app itself".
function normalizeTargetUrl(value) {
  if (!value) return "";

  const raw = String(value).trim();

  if (!raw) return "";

  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`targetUrl must be an absolute http(s) URL. Got: ${raw}`);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(
      `targetUrl must use http or https. Got: ${parsed.protocol}`,
    );
  }

  return parsed.origin + parsed.pathname.replace(/\/$/, "");
}

function normalizeReason(value) {
  return String(value || "")
    .replace(/[\r\n\t]+/g, " ")
    .trim()
    .slice(0, 200);
}

function normalizeOptions(flow, options = {}) {
  return {
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
    targetUrl: normalizeTargetUrl(options.targetUrl),
    reason: normalizeReason(options.reason),
    reporter: options.reporter === "list" ? "list" : "blob",
  };
}

// Expands a flow plus validated options into an argv array. Never a string:
// callers spawn this with shell:false.
function buildArgv(flow, options, shardIndex = 1) {
  const resolved = normalizeOptions(flow, options);

  if (flow.runner === "vitest") {
    return ["vitest", "run"];
  }

  const argv = ["playwright", "test"];

  if (flow.runner === "playwright-visual") {
    argv.push("-c", "playwright.visual.config.ts");
  }

  for (const spec of flow.specs || []) {
    argv.push(spec);
  }

  if (flow.grep) {
    argv.push(`--grep=${flow.grep}`);
  }

  if (resolved.shards > 1) {
    argv.push(`--shard=${shardIndex}/${resolved.shards}`);
  }

  argv.push(`--retries=${resolved.retries}`);
  argv.push(`--workers=${resolved.workers}`);
  argv.push(`--reporter=${resolved.reporter}`);

  return argv;
}

// Environment the runner needs. When a target URL is supplied we suppress the
// config's webServer block entirely so CI does not build and boot a local app
// it will never talk to.
function buildEnv(flow, options) {
  const resolved = normalizeOptions(flow, options);
  const env = {};

  if (flow.runner === "vitest") {
    return env;
  }

  // Playwright rejects --browser when the config defines projects, so browser
  // choice travels as an env var that playwright.config.ts reads.
  env.PLAYWRIGHT_BROWSER = resolved.browser;

  if (resolved.targetUrl) {
    env.PLAYWRIGHT_BASE_URL = resolved.targetUrl;
    env.PLAYWRIGHT_REUSE_EXISTING_SERVER = "true";
    env.PLAYWRIGHT_EXTERNAL_TARGET = "true";
  }

  return env;
}

// Human-readable equivalent, for the UI and job summaries. Display only.
function describeCommand(flow, options, shardIndex = 1) {
  const argv = buildArgv(flow, options, shardIndex);
  const env = buildEnv(flow, options);
  const prefix = Object.entries(env)
    .map(([key, value]) => `${key}=${value}`)
    .join(" ");
  const command = `npx ${argv.join(" ")}`;

  return prefix ? `${prefix} ${command}` : command;
}

// Maps the display argv (npx form) onto a shell-free spawn of the local CLI.
function toSpawn(argv) {
  const [tool, ...rest] = argv;
  const cli = tool === "vitest" ? VITEST_CLI : PLAYWRIGHT_CLI;

  return { command: process.execPath, args: [cli, ...rest] };
}

function needsApp(flow) {
  return flow.needsApp !== false && flow.runner !== "vitest";
}

module.exports = {
  BROWSERS,
  CATALOG_PATH,
  DEFAULT_BROWSER,
  FLOW_ID_PATTERN,
  GROUPS_PATH,
  MAX_RETRIES,
  MAX_SHARDS,
  MAX_WORKERS,
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
  findFlow,
  needsApp,
  normalizeBrowser,
  normalizeCount,
  normalizeOptions,
  normalizeReason,
  normalizeShards,
  normalizeTargetUrl,
  readCatalog,
  requireCatalog,
  slugify,
  suggestMaxShards,
  toSpawn,
};
