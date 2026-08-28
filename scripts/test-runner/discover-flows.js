// Discovers every runnable flow in this repository and writes the flow catalog
// that the remote test runner UI and the GitHub workflow both read.
//
// Discovery is authoritative rather than hand-maintained: it asks Playwright
// itself for the test tree (`playwright test --list --reporter=json`), so a
// pushed spec appears in the runner without anyone editing a list. The curated
// groups in flow-groups.json are layered on top for stable, pipeline-facing ids.
//
// Usage:
//   node scripts/test-runner/discover-flows.js            # write the catalog
//   node scripts/test-runner/discover-flows.js --check     # fail if stale
//   node scripts/test-runner/discover-flows.js --list       # print flows
//
// The committed catalog deliberately contains no timestamp or commit SHA: a
// volatile field would make every push produce a diff and defeat the
// "commit only when the flow set actually changed" contract in CI.

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const {
  CATALOG_PATH,
  GROUPS_PATH,
  MAX_SHARDS,
  PLAYWRIGHT_CLI,
  REPO_ROOT,
  SCHEMA_VERSION,
  escapeRegExp,
  slugify,
  suggestMaxShards,
} = require("./catalog.js");

const E2E_ROOT = "tests/e2e";
const VISUAL_ROOT = "tests/visual";
const UNIT_GLOB_ROOT = path.join("web", "src");

// Setup projects are dependencies, not flows a person picks and runs.
const EXCLUDED_FILES = new Set(["auth.setup.ts"]);

const VISUAL_WARNING =
  "Screenshot baselines are platform-specific. A remote Linux run needs Linux baselines committed, or it will fail on pixel diffs.";

function printHelp() {
  console.log(`Usage:
  node scripts/test-runner/discover-flows.js [options]

Options:
  --check        Exit 1 when the committed catalog differs from discovery.
  --list         Print the discovered flows instead of writing the catalog.
  --json         With --list, print raw JSON.
  --offline      Skip Playwright and discover by scanning spec files.
  --help         Show this help.

Writes scripts/test-runner/flow-catalog.json.`);
}

function parseArgs(argv) {
  const options = {};

  for (const argument of argv) {
    switch (argument) {
      case "--check":
        options.check = true;
        break;
      case "--list":
        options.list = true;
        break;
      case "--json":
        options.json = true;
        break;
      case "--offline":
        options.offline = true;
        break;
      case "--help":
      case "-h":
        options.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${argument}`);
    }
  }

  return options;
}

// Asks Playwright for the resolved test tree. Returns null when the runner is
// unavailable (no node_modules, no browsers) so callers can fall back.
function listPlaywrightTests(configArgs = []) {
  const result = spawnSync(
    process.execPath,
    [PLAYWRIGHT_CLI, "test", ...configArgs, "--list", "--reporter=json"],
    {
      cwd: REPO_ROOT,
      encoding: "utf8",
      shell: false,
      maxBuffer: 32 * 1024 * 1024,
    },
  );

  if (result.error || result.status !== 0 || !result.stdout) {
    const detail = (result.stderr || result.error?.message || "").trim();
    console.warn(
      `[flows] Playwright listing failed${detail ? `: ${detail.split("\n")[0]}` : ""}`,
    );
    return null;
  }

  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    console.warn(`[flows] Could not parse Playwright output: ${error.message}`);
    return null;
  }
}

function toPosix(value) {
  return String(value).replace(/\\/g, "/");
}

// Playwright reports files relative to the config rootDir.
function resolveSpecPath(rootDir, file) {
  const relativeRoot = toPosix(path.relative(REPO_ROOT, rootDir));
  return `${relativeRoot}/${toPosix(file)}`.replace(/\/+/g, "/");
}

function countSpecs(node) {
  const direct = (node.specs || []).length;
  const nested = (node.suites || []).reduce(
    (total, child) => total + countSpecs(child),
    0,
  );
  return direct + nested;
}

function specBasename(value) {
  return toPosix(value)
    .split("/")
    .pop()
    .replace(/\.(spec|setup)\.ts$/, "");
}

// ---------------------------------------------------------------------------
// Flow names and tooltips
//
// The board is read by testers, so a name is the vocabulary of the trade in
// one terse shape and nothing else:
//
//   spec file      ->  area:file            app:react-orders
//   describe block ->  area:file > block    app:react-products > product-detail
//
// An earlier pass rewrote both halves as prose ("React app: orders screen") on
// the theory that smoke, sanity and regression are jargon. They are not: they
// are the names of the things, and a tester scans for them. Prose also does not
// fit - 63 rows in a dense table leave a name about 44 characters.
//
// The spec path and the describe title are the only two strings discovery can
// see, and both are now used as written apart from lowercasing, stutter
// collapse and truncation. There is deliberately no per-spec wording table: a
// hand-written subject per file drifts the moment a spec is renamed, and the
// paths in this repo already say what they test.
//
// Descriptions feed a hover tooltip only, never an inline card, so each is one
// fragment: how many checks, which block, roughly how long.
//
// Ids come from idSource() and the raw describe title before any of this runs,
// so no wording change here can move an id that a workflow, a doc, or a
// bookmark resolves.
// ---------------------------------------------------------------------------

// Folder names are already the area vocabulary, with three exceptions: the
// plural in `contracts` and the hyphen in `non-functional` disagree with the
// curated groups (contract:api, nonfunctional:perf+a11y), and a spec sitting at
// the root of tests/e2e has no folder to borrow.
const AREA_NAMES = {
  contracts: "contract",
  "non-functional": "nonfunctional",
  root: "e2e",
};

const VISUAL_AREA = "visual";

// Arrive glued and must stay glued: a camel-case split turns these into two
// words that name nothing ("Open API", "Tan Stack").
const GLUED = new Set(["openapi", "tanstack"]);

// Carry no meaning in a name this short. Dropped from a block half outright,
// and never left as the last segment of a file half: a name that ends
// "...-navigates-to" stops mid-thought.
const SMALL_WORDS = new Set([
  "a",
  "an",
  "and",
  "the",
  "of",
  "in",
  "to",
  "for",
  "with",
  "is",
  "are",
]);

const NAME_LIMIT = 44;
// The file half stops well short of NAME_LIMIT so that adding a block half
// never has to eat into the area, which is what a person scans by.
const FILE_LIMIT = 30;
const BLOCK_SEPARATOR = " > ";
// Two segments is what a table cell can carry. The tooltip holds the full
// describe title, so a longer block half buys noise, not information.
const BLOCK_SEGMENTS = 2;
// A block whose title only restates its file (rbac.spec.ts holds one block
// called "RBAC") has nothing to add, so the row says it covers the whole file.
const WHOLE_FILE_BLOCK = "all";

// Cards are keyed by what they run: a spec path, plus "::<describe title>" for
// one block inside that file.
function subjectKey(specPath, title) {
  return title ? `${specPath}::${title}` : specPath;
}

// An identifier lifted straight out of code ("NarrativeEnricher") is two words
// on the board, not one.
function splitCamelCase(value) {
  return String(value)
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]{2,})([A-Z][a-z])/g, "$1 $2");
}

// One raw string (a basename or a describe title) to lowercase name segments.
// Punctuation is a word break, so "(auth/session)" and "RHF/Zod" arrive as
// segments instead of putting parentheses and slashes on the board.
function segments(raw) {
  return String(raw)
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .flatMap((word) =>
      GLUED.has(word.toLowerCase()) ? [word] : splitCamelCase(word).split(" "),
    )
    .map((word) => word.toLowerCase())
    .filter(Boolean);
}

function joinSegments(list) {
  return list.join("-");
}

// Whole segments only, and never ending on a small word.
function trimSegments(list, limit = FILE_LIMIT) {
  const kept = [];

  for (const segment of list) {
    if (joinSegments([...kept, segment]).length > limit) break;
    kept.push(segment);
  }

  while (kept.length > 1 && SMALL_WORDS.has(kept[kept.length - 1])) {
    kept.pop();
  }

  return kept.length > 0 ? kept : list.slice(0, 1);
}

function areaName(file) {
  // A visual spec lives under its own root, so no folder names it.
  if (file.runner === "playwright-visual") return VISUAL_AREA;

  return AREA_NAMES[file.area] || file.area;
}

// The area already sits in front of the name, so a basename that repeats it is
// a stutter: functional/negative/functional-negative.spec.ts is
// `functional:negative`, not `functional:functional-negative`.
function fileHalves(file) {
  const area = areaName(file);
  const own = new Set([...segments(area), ...segments(file.area)]);
  const raw = segments(specBasename(file.specPath));
  const collapsed = raw.filter((segment) => !own.has(segment));

  // tests/visual/visual.spec.ts collapses to nothing - file, folder and area
  // are all the word "visual" - so borrow its only describe block, the one
  // other string discovery has for that file.
  const soleBlock = file.describes.length === 1 ? file.describes[0].title : "";
  const borrowed = segments(soleBlock).filter((segment) => !own.has(segment));
  const preferred = collapsed.length > 0 ? collapsed : borrowed;

  return {
    area,
    own,
    // Second entry is the runner-up, used only when the collapsed name is
    // already taken: keeping a stutter (sanity:sanity-smoke) beats renaming a
    // curated group (sanity:smoke) that workflows and bookmarks call by name.
    parts: [trimSegments(preferred), trimSegments(raw)].filter(
      (candidate) => candidate.length > 0,
    ),
  };
}

// The block half exists to tell two blocks in one file apart, so it carries
// only the words its title adds to the file half, shortest form first.
function blockHalves(title, fileWords) {
  const words = segments(title).filter(
    (word) => !fileWords.has(word) && !SMALL_WORDS.has(word),
  );

  if (words.length === 0) return [WHOLE_FILE_BLOCK];

  const halves = [];

  for (
    let count = Math.min(BLOCK_SEGMENTS, words.length);
    count <= words.length;
    count += 1
  ) {
    halves.push(joinSegments(words.slice(0, count)));
  }

  return halves;
}

// The file half is what gives up trailing segments when a name will not fit.
// The area never does.
function fitName(area, fileParts, block = "") {
  const tail = block ? `${BLOCK_SEPARATOR}${block}` : "";
  const room = NAME_LIMIT - area.length - 1 - tail.length;
  const parts = trimSegments(
    fileParts,
    Math.max(room, (fileParts[0] || "").length),
  );

  return `${area}:${joinSegments(parts)}${tail}`;
}

// Every name on the board is distinct, curated group names included: two rows
// reading the same words is a trap in a table that shows no descriptions.
// `reserved` carries the hand-written names from flow-groups.json, which
// nothing here may rewrite.
function planCards(files, reserved = []) {
  const taken = new Set(reserved);
  const cards = new Map();
  const halves = new Map();

  const claim = (candidates) => {
    for (const candidate of candidates) {
      if (!taken.has(candidate)) {
        taken.add(candidate);
        return candidate;
      }
    }

    // Reached only by a spec added later whose every candidate is spoken for.
    // A counter is ugly on the board but it is never a duplicate.
    const base = candidates[candidates.length - 1];
    let counter = 2;

    while (taken.has(`${base}-${counter}`)) counter += 1;

    taken.add(`${base}-${counter}`);
    return `${base}-${counter}`;
  };

  // Spec rows first: a spec is the row a person picks by default, so it gets
  // first claim on the collapsed name and the block rows work around it.
  for (const file of files) {
    const half = fileHalves(file);
    halves.set(file.specPath, half);

    cards.set(subjectKey(file.specPath), {
      name: claim(half.parts.map((parts) => fitName(half.area, parts))),
    });
  }

  for (const file of files) {
    const half = halves.get(file.specPath);
    const [parts] = half.parts;
    const fileWords = new Set([...half.own, ...parts]);

    for (const describe of file.describes) {
      if (!describe.title) continue;

      cards.set(subjectKey(file.specPath, describe.title), {
        name: claim(
          blockHalves(describe.title, fileWords).map((block) =>
            fitName(half.area, parts, block),
          ),
        ),
      });
    }
  }

  return cards;
}

// The tooltip answers the one question a name this terse cannot: how long the
// run takes. The table already shows the name, the path and the count, so the
// description stays a fragment and stops.
function costHint(testCount, runner) {
  if (runner === "vitest") return "no browser, seconds";

  let hint;

  if (testCount <= 3) hint = "seconds";
  else if (testCount <= 20) hint = "under a minute";
  else if (testCount <= 60) hint = "1-2 minutes";
  else hint = "several minutes";

  return runner === "playwright-visual"
    ? `${hint}, same-platform baselines needed`
    : hint;
}

function cardDescription(file, describe) {
  const count = describe ? describe.testCount : file.testCount;

  // Offline discovery cannot count tests. Say where to look rather than
  // promise a cost this run had no way to measure.
  if (!count) {
    return describe
      ? `the "${describe.title}" block; test count unknown`
      : `all tests in ${file.specPath}`;
  }

  const checks = `${count} check${count === 1 ? "" : "s"}`;
  // The name is too terse to carry either the path or the full describe title,
  // so the tooltip carries whichever one identifies this row: the file for a
  // spec, the block title for a block. Both plus the cost overruns one line.
  const where = describe ? `"${describe.title}"` : file.specPath;

  return `${checks} in ${where}; ${costHint(count, file.runner)}`;
}

// Top directory under tests/e2e, used to group the runner list into sections.
function resolveArea(specPath, root) {
  const relative = toPosix(specPath).replace(`${root}/`, "");
  const segments = relative.split("/");
  return segments.length > 1 ? segments[0] : "root";
}

// Flow ids read better without the redundant tests/e2e prefix that every spec
// shares: tests/e2e/app/react-orders.spec.ts becomes spec-app-react-orders.
function idSource(specPath) {
  return toPosix(specPath)
    .replace(/^tests\/e2e\//, "")
    .replace(/^tests\//, "")
    .replace(/\.spec\.ts$/, "");
}

function makeIdFactory() {
  const used = new Set();

  return function makeId(prefix, ...parts) {
    const base = `${prefix}-${slugify(parts.join("-"))}`.slice(0, 110);
    let candidate = base;
    let counter = 2;

    while (used.has(candidate)) {
      candidate = `${base}-${counter}`;
      counter += 1;
    }

    used.add(candidate);
    return candidate;
  };
}

function discoverFromPlaywright(listing, { root, runner }) {
  const rootDir = listing.config?.rootDir || path.join(REPO_ROOT, root);
  const files = [];

  for (const fileSuite of listing.suites || []) {
    const fileName = toPosix(fileSuite.file);

    if (EXCLUDED_FILES.has(fileName.split("/").pop())) {
      continue;
    }

    const specPath = resolveSpecPath(rootDir, fileName);
    const describes = (fileSuite.suites || []).map((child) => ({
      title: child.title,
      testCount: countSpecs(child),
    }));

    files.push({
      specPath,
      runner,
      area: resolveArea(specPath, root),
      testCount: countSpecs(fileSuite),
      describes,
    });
  }

  return files.sort((left, right) =>
    left.specPath.localeCompare(right.specPath),
  );
}

// Fallback discovery: parse spec files directly. Less precise about counts than
// Playwright, but keeps the catalog buildable on a machine with no browsers.
function discoverFromFiles({ root, runner }) {
  const absoluteRoot = path.join(REPO_ROOT, root);

  if (!fs.existsSync(absoluteRoot)) {
    return [];
  }

  const files = [];

  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        walk(absolute);
        continue;
      }

      if (!entry.name.endsWith(".spec.ts")) continue;
      if (EXCLUDED_FILES.has(entry.name)) continue;

      const specPath = toPosix(path.relative(REPO_ROOT, absolute));
      const source = fs.readFileSync(absolute, "utf8");
      const describes = [
        ...source.matchAll(/test\.describe\s*\(\s*(["'`])(.+?)\1/g),
      ].map((match) => ({ title: match[2], testCount: 0 }));
      const testCount = [...source.matchAll(/\btest\s*\(\s*["'`]/g)].length;

      files.push({
        specPath,
        runner,
        area: resolveArea(specPath, root),
        testCount,
        describes,
      });
    }
  };

  walk(absoluteRoot);

  return files.sort((left, right) =>
    left.specPath.localeCompare(right.specPath),
  );
}

function countUnitTestFiles() {
  const absoluteRoot = path.join(REPO_ROOT, UNIT_GLOB_ROOT);

  if (!fs.existsSync(absoluteRoot)) return 0;

  let count = 0;

  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        walk(absolute);
        continue;
      }

      if (/\.test\.tsx?$/.test(entry.name)) count += 1;
    }
  };

  walk(absoluteRoot);
  return count;
}

function readGroups() {
  const raw = JSON.parse(fs.readFileSync(GROUPS_PATH, "utf8"));
  return Array.isArray(raw.groups) ? raw.groups : [];
}

// A group's test count is the sum of the files its spec filters select. An
// empty specs array means "the whole suite for this runner".
function countGroupTests(group, files) {
  if (group.runner === "vitest") {
    return null;
  }

  const pool = files.filter((file) => file.runner === group.runner);

  if (!group.specs || group.specs.length === 0) {
    return pool.reduce((total, file) => total + file.testCount, 0);
  }

  const selected = new Set();

  for (const filter of group.specs) {
    const normalized = toPosix(filter).replace(/\/$/, "");

    for (const file of pool) {
      if (
        file.specPath === normalized ||
        file.specPath.startsWith(`${normalized}/`)
      ) {
        selected.add(file);
      }
    }
  }

  return [...selected].reduce((total, file) => total + file.testCount, 0);
}

function buildFlows(files, unitFileCount) {
  const makeId = makeIdFactory();
  const groups = readGroups();
  // Names are planned for every spec and block up front: R10 can only tell a
  // card apart from an identical one by looking at the whole board, curated
  // group names included.
  const cards = planCards(
    files,
    groups.map((group) => group.name),
  );
  const flows = [];

  // 1. Curated groups first: stable ids, the entries a pipeline should call.
  for (const group of groups) {
    const testCount = countGroupTests(group, files);

    flows.push({
      id: group.id,
      kind: "group",
      name: group.name,
      description: group.description || "",
      area: "groups",
      runner: group.runner,
      specs: group.specs || [],
      grep: null,
      path: null,
      testCount,
      specFileCount: group.runner === "vitest" ? unitFileCount : undefined,
      maxShards: Math.min(group.maxShards || 1, MAX_SHARDS),
      needsApp: group.needsApp !== false && group.runner !== "vitest",
      tags: group.tags || [],
      warning:
        group.runner === "playwright-visual" ? VISUAL_WARNING : undefined,
    });
  }

  // 2. One flow per spec file. This is the tier that grows by itself on a push.
  for (const file of files) {
    flows.push({
      id: makeId("spec", idSource(file.specPath)),
      kind: "spec",
      name: cards.get(subjectKey(file.specPath)).name,
      description: cardDescription(file, null),
      area: file.area,
      runner: file.runner,
      specs: [file.specPath],
      grep: null,
      path: file.specPath,
      testCount: file.testCount,
      maxShards: Math.min(suggestMaxShards(file.testCount), MAX_SHARDS),
      needsApp: true,
      tags: [file.runner === "playwright-visual" ? "visual" : file.area],
      warning: file.runner === "playwright-visual" ? VISUAL_WARNING : undefined,
    });
  }

  // 3. One flow per top-level describe block, targeted with --grep.
  for (const file of files) {
    for (const describe of file.describes) {
      if (!describe.title) continue;

      flows.push({
        id: makeId("suite", idSource(file.specPath), describe.title),
        kind: "suite",
        name: cards.get(subjectKey(file.specPath, describe.title)).name,
        description: cardDescription(file, describe),
        area: file.area,
        runner: file.runner,
        specs: [file.specPath],
        grep: escapeRegExp(describe.title),
        path: file.specPath,
        testCount: describe.testCount || null,
        maxShards: 1,
        needsApp: true,
        tags: [file.area],
        warning:
          file.runner === "playwright-visual" ? VISUAL_WARNING : undefined,
      });
    }
  }

  return flows;
}

function buildCatalog({ offline = false } = {}) {
  const e2eListing = offline ? null : listPlaywrightTests();
  const visualListing = offline
    ? null
    : listPlaywrightTests(["-c", "playwright.visual.config.ts"]);

  const e2eFiles = e2eListing
    ? discoverFromPlaywright(e2eListing, {
        root: E2E_ROOT,
        runner: "playwright",
      })
    : discoverFromFiles({ root: E2E_ROOT, runner: "playwright" });

  const visualFiles = visualListing
    ? discoverFromPlaywright(visualListing, {
        root: VISUAL_ROOT,
        runner: "playwright-visual",
      })
    : discoverFromFiles({ root: VISUAL_ROOT, runner: "playwright-visual" });

  const files = [...e2eFiles, ...visualFiles];
  const unitFileCount = countUnitTestFiles();
  const flows = buildFlows(files, unitFileCount);
  const discovery = e2eListing ? "playwright" : "file-scan";

  return {
    schemaVersion: SCHEMA_VERSION,
    discovery,
    totals: {
      flows: flows.length,
      specFiles: files.length,
      e2eTests: e2eFiles.reduce((total, file) => total + file.testCount, 0),
      visualTests: visualFiles.reduce(
        (total, file) => total + file.testCount,
        0,
      ),
      unitTestFiles: unitFileCount,
    },
    flows,
  };
}

function serialize(catalog) {
  return `${JSON.stringify(catalog, null, 2)}\n`;
}

function printFlowTable(catalog) {
  const byKind = { group: [], spec: [], suite: [] };

  for (const flow of catalog.flows) {
    byKind[flow.kind]?.push(flow);
  }

  for (const [kind, flows] of Object.entries(byKind)) {
    if (flows.length === 0) continue;

    console.log(`\n${kind.toUpperCase()} (${flows.length})`);

    for (const flow of flows) {
      const count = flow.testCount === null ? "?" : flow.testCount;
      console.log(
        `  ${flow.id.padEnd(54)} ${String(count).padStart(4)} tests  ${flow.name}`,
      );
    }
  }

  console.log(
    `\n${catalog.totals.flows} flows across ${catalog.totals.specFiles} spec files (${catalog.totals.e2eTests} E2E tests). Discovery: ${catalog.discovery}.`,
  );
}

function main() {
  let options;

  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    printHelp();
    process.exit(1);
  }

  if (options.help) {
    printHelp();
    return;
  }

  const catalog = buildCatalog({ offline: options.offline });

  if (options.list) {
    if (options.json) {
      console.log(serialize(catalog));
    } else {
      printFlowTable(catalog);
    }
    return;
  }

  const next = serialize(catalog);
  const current = fs.existsSync(CATALOG_PATH)
    ? fs.readFileSync(CATALOG_PATH, "utf8")
    : null;

  if (options.check) {
    if (current === next) {
      console.log(
        `[flows] Catalog is current: ${catalog.totals.flows} flows, ${catalog.totals.e2eTests} E2E tests.`,
      );
      return;
    }

    console.error(
      "[flows] Flow catalog is stale. Regenerate it with: npm run flows:discover",
    );
    process.exit(1);
  }

  if (current === next) {
    console.log(
      `[flows] No change: ${catalog.totals.flows} flows, ${catalog.totals.e2eTests} E2E tests.`,
    );
    return;
  }

  fs.writeFileSync(CATALOG_PATH, next);
  console.log(
    `[flows] Wrote ${path.relative(REPO_ROOT, CATALOG_PATH)}: ${catalog.totals.flows} flows, ${catalog.totals.e2eTests} E2E tests (discovery: ${catalog.discovery}).`,
  );
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`[flows] ${error.message}`);
    process.exit(1);
  }
}

module.exports = { buildCatalog, serialize };
