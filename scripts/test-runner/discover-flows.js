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

// Files, paths, and running programs.
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

// The catalog's paths, limits and helpers.
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

// Where the browser specs, the visual specs and the unit tests live.
const E2E_ROOT = "tests/e2e";
const VISUAL_ROOT = "tests/visual";
const UNIT_GLOB_ROOT = path.join("web", "src");

// Setup projects are dependencies, not flows a person picks and runs.
const EXCLUDED_FILES = new Set(["auth.setup.ts"]);

// The warning shown on visual flows.
const VISUAL_WARNING =
  "Screenshot baselines are platform-specific. A remote Linux run needs Linux baselines committed, or it will fail on pixel diffs.";

// Shows how to run this script.
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

// Reads the command-line options.
function parseArgs(argv) {
  // The options found so far.
  const options = {};

  // Each word must be a known option.
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

  // The options.
  return options;
}

// Asks Playwright for the resolved test tree. Returns null when the runner is
// unavailable (no node_modules, no browsers) so callers can fall back.
function listPlaywrightTests(configArgs = []) {
  // Run Playwright's list mode with no shell, keeping its JSON output.
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

  // It failed or printed nothing: warn with its first error line, and give
  // null.
  if (result.error || result.status !== 0 || !result.stdout) {
    const detail = (result.stderr || result.error?.message || "").trim();
    console.warn(
      `[flows] Playwright listing failed${detail ? `: ${detail.split("\n")[0]}` : ""}`,
    );
    return null;
  }

  // Its output as JSON; unreadable output warns and gives null.
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    console.warn(`[flows] Could not parse Playwright output: ${error.message}`);
    return null;
  }
}

// A path with forward slashes.
function toPosix(value) {
  return String(value).replace(/\\/g, "/");
}

// Playwright reports files relative to the config rootDir.
function resolveSpecPath(rootDir, file) {
  const relativeRoot = toPosix(path.relative(REPO_ROOT, rootDir));
  return `${relativeRoot}/${toPosix(file)}`.replace(/\/+/g, "/");
}

// How many tests a suite holds, nested suites included.
function countSpecs(node) {
  const direct = (node.specs || []).length;
  const nested = (node.suites || []).reduce(
    (total, child) => total + countSpecs(child),
    0,
  );
  return direct + nested;
}

// A spec file's name without its folder or .spec.ts.
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

// The visual flows' area name.
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

// The longest a flow name can be.
const NAME_LIMIT = 44;
// The file half stops well short of NAME_LIMIT so that adding a block half
// never has to eat into the area, which is what a person scans by.
const FILE_LIMIT = 30;
// What goes between the file half and the block half.
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
  // Split on punctuation, keep glued words whole, split camelCase, and
  // lowercase.
  return String(raw)
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .flatMap((word) =>
      GLUED.has(word.toLowerCase()) ? [word] : splitCamelCase(word).split(" "),
    )
    .map((word) => word.toLowerCase())
    .filter(Boolean);
}

// Segments joined with hyphens.
function joinSegments(list) {
  return list.join("-");
}

// Whole segments only, and never ending on a small word.
function trimSegments(list, limit = FILE_LIMIT) {
  // The segments that fit.
  const kept = [];

  // Add whole segments while they fit.
  for (const segment of list) {
    if (joinSegments([...kept, segment]).length > limit) break;
    kept.push(segment);
  }

  // Drop small words from the end.
  while (kept.length > 1 && SMALL_WORDS.has(kept[kept.length - 1])) {
    kept.pop();
  }

  // At least one segment.
  return kept.length > 0 ? kept : list.slice(0, 1);
}

// The area word in front of a flow's name.
function areaName(file) {
  // A visual spec lives under its own root, so no folder names it.
  if (file.runner === "playwright-visual") return VISUAL_AREA;

  // The folder's own name, unless it has a better one.
  return AREA_NAMES[file.area] || file.area;
}

// The area already sits in front of the name, so a basename that repeats it is
// a stutter: functional/negative/functional-negative.spec.ts is
// `functional:negative`, not `functional:functional-negative`.
function fileHalves(file) {
  // The area, its words, and the file name's words without the area's.
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

  // The area, its words, and the file half: the shortened name first, the full
  // one as runner-up.
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
  // The title's words that the file half does not already say.
  const words = segments(title).filter(
    (word) => !fileWords.has(word) && !SMALL_WORDS.has(word),
  );

  // None left: the block covers the whole file.
  if (words.length === 0) return [WHOLE_FILE_BLOCK];

  // The candidates, shortest first.
  const halves = [];

  // Two words, then three, up to every word.
  for (
    let count = Math.min(BLOCK_SEGMENTS, words.length);
    count <= words.length;
    count += 1
  ) {
    halves.push(joinSegments(words.slice(0, count)));
  }

  // The candidates.
  return halves;
}

// The file half is what gives up trailing segments when a name will not fit.
// The area never does.
function fitName(area, fileParts, block = "") {
  // The block part, and the room left for the file half.
  const tail = block ? `${BLOCK_SEPARATOR}${block}` : "";
  const room = NAME_LIMIT - area.length - 1 - tail.length;
  const parts = trimSegments(
    fileParts,
    Math.max(room, (fileParts[0] || "").length),
  );

  // area:file > block.
  return `${area}:${joinSegments(parts)}${tail}`;
}

// Every name on the board is distinct, curated group names included: two rows
// reading the same words is a trap in a table that shows no descriptions.
// `reserved` carries the hand-written names from flow-groups.json, which
// nothing here may rewrite.
function planCards(files, reserved = []) {
  // Names taken so far (the curated groups first), and the names given out.
  const taken = new Set(reserved);
  const cards = new Map();
  const halves = new Map();

  // Give out the first free name, or the last one with a counter.
  const claim = (candidates) => {
    // The first one nobody has.
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

    // Otherwise the last one with the first free counter.
    while (taken.has(`${base}-${counter}`)) counter += 1;

    // Take it.
    taken.add(`${base}-${counter}`);
    return `${base}-${counter}`;
  };

  // Spec rows first: a spec is the row a person picks by default, so it gets
  // first claim on the collapsed name and the block rows work around it.
  for (const file of files) {
    const half = fileHalves(file);
    halves.set(file.specPath, half);

    // The spec's own row.
    cards.set(subjectKey(file.specPath), {
      name: claim(half.parts.map((parts) => fitName(half.area, parts))),
    });
  }

  // Then a row for each describe block.
  for (const file of files) {
    // The file's half, and the words it already says.
    const half = halves.get(file.specPath);
    const [parts] = half.parts;
    const fileWords = new Set([...half.own, ...parts]);

    // Each block in the file.
    for (const describe of file.describes) {
      // Untitled blocks get no row.
      if (!describe.title) continue;

      // Its row, named by the words its title adds.
      cards.set(subjectKey(file.specPath, describe.title), {
        name: claim(
          blockHalves(describe.title, fileWords).map((block) =>
            fitName(half.area, parts, block),
          ),
        ),
      });
    }
  }

  // Every row's name.
  return cards;
}

// The tooltip answers the one question a name this terse cannot: how long the
// run takes. The table already shows the name, the path and the count, so the
// description stays a fragment and stops.
function costHint(testCount, runner) {
  // A Vitest flow opens no browser.
  if (runner === "vitest") return "no browser, seconds";

  // How long the run takes, by its number of tests.
  let hint;

  if (testCount <= 3) hint = "seconds";
  else if (testCount <= 20) hint = "under a minute";
  else if (testCount <= 60) hint = "1-2 minutes";
  else hint = "several minutes";

  // Visual flows also need baselines made on the same system.
  return runner === "playwright-visual"
    ? `${hint}, same-platform baselines needed`
    : hint;
}

// The tooltip: how many checks, where, and roughly how long.
function cardDescription(file, describe) {
  // The test count for the block or the file.
  const count = describe ? describe.testCount : file.testCount;

  // Offline discovery cannot count tests. Say where to look rather than
  // promise a cost this run had no way to measure.
  if (!count) {
    return describe
      ? `the "${describe.title}" block; test count unknown`
      : `all tests in ${file.specPath}`;
  }

  // "N checks", and the file or the block title.
  const checks = `${count} check${count === 1 ? "" : "s"}`;
  // The name is too terse to carry either the path or the full describe title,
  // so the tooltip carries whichever one identifies this row: the file for a
  // spec, the block title for a block. Both plus the cost overruns one line.
  const where = describe ? `"${describe.title}"` : file.specPath;

  // One line.
  return `${checks} in ${where}; ${costHint(count, file.runner)}`;
}

// ---------------------------------------------------------------------------
// Summaries
//
// The one sentence a person wants beside a spec's name: what it checks, in the
// words of whoever wrote it. It is read from the comment at the top of the
// file, so the spec stays the only place that describes the spec. A file with
// no such comment gets no summary, and the runner shows the cost hint instead.
// ---------------------------------------------------------------------------

const SUMMARY_LIMIT = 200;
// Comment blocks that are pointers or directives rather than prose.
const SUMMARY_SKIP = /^(seed:|eslint|@ts-|prettier|biome|TODO|FIXME)/i;

// The comment that describes the file, as one string: the first block of two
// or more consecutive `//` lines before the first test. A one-line block is
// used only when no longer one exists, because a single line above a constant
// is usually a note about that constant and not about the file.
function leadingComment(source) {
  // The lines before the first test, and the comment blocks found among them.
  const lines = source.split(/\r?\n/);
  const stop = lines.findIndex((line) =>
    /^\s*test(\.describe)?\s*\(/.test(line),
  );
  const limit = stop === -1 ? lines.length : stop;
  const blocks = [];
  let block = [];

  // End the current block: keep it when it reads as prose of four words or
  // more.
  const flush = () => {
    // Nothing to end.
    if (!block.length) return;

    // Its lines as one string, without the slashes.
    const text = block
      .map((line) => line.replace(/^\s*\/\/\s?/, "").trim())
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    // Keep it unless it is a directive or too short.
    if (text && !SUMMARY_SKIP.test(text) && text.split(" ").length >= 4) {
      blocks.push({ lines: block.length, text });
    }

    // Start a new block.
    block = [];
  };

  // Collect consecutive // lines into blocks.
  for (let index = 0; index < limit; index += 1) {
    if (/^\s*\/\//.test(lines[index])) {
      block.push(lines[index]);
    } else {
      flush();
    }
  }

  // End the last one.
  flush();

  // The first block of two or more lines, else the first of any length.
  const long = blocks.find((entry) => entry.lines >= 2);

  // Its text, or nothing.
  return (long || blocks[0] || { text: "" }).text;
}

// The first sentence of the comment, with phase markers like "(phase A3)"
// dropped: they are bookkeeping for the author, not a fact about the test.
function firstSentence(text) {
  // Drop phase markers, then take the text up to the first full stop.
  const cleaned = text.replace(/\s*\((?:phase|plan)\s[^)]*\)/gi, "").trim();
  const match = cleaned.match(/^[\s\S]*?[.!?](?=\s|$)/);
  let sentence = (match ? match[0] : cleaned).trim();

  // At most 200 characters, cut at a word.
  if (sentence.length > SUMMARY_LIMIT) {
    sentence = `${sentence.slice(0, SUMMARY_LIMIT - 1).replace(/\s+\S*$/, "")}…`;
  }

  // The sentence.
  return sentence;
}

// A spec's one-line summary, from its leading comment; empty when it has none.
function specSummary(specPath) {
  const absolute = path.join(REPO_ROOT, specPath);

  // No file: no summary.
  if (!fs.existsSync(absolute)) return "";

  // The file's leading comment.
  const text = leadingComment(fs.readFileSync(absolute, "utf8"));

  // Its first sentence.
  return text ? firstSentence(text) : "";
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

// Makes unique ids: a repeat gets -2, -3 and so on.
function makeIdFactory() {
  // The ids given out so far.
  const used = new Set();

  // An id from a prefix and parts, at most 110 characters.
  return function makeId(prefix, ...parts) {
    const base = `${prefix}-${slugify(parts.join("-"))}`.slice(0, 110);
    let candidate = base;
    let counter = 2;

    // Add a counter until it is free.
    while (used.has(candidate)) {
      candidate = `${base}-${counter}`;
      counter += 1;
    }

    // Take it.
    used.add(candidate);
    return candidate;
  };
}

// The spec files in Playwright's listing, each with its area, test count and
// describe blocks.
function discoverFromPlaywright(listing, { root, runner }) {
  // Where its paths start from, and the files found.
  const rootDir = listing.config?.rootDir || path.join(REPO_ROOT, root);
  const files = [];

  // Each file Playwright listed.
  for (const fileSuite of listing.suites || []) {
    const fileName = toPosix(fileSuite.file);

    // Set-up files are not flows.
    if (EXCLUDED_FILES.has(fileName.split("/").pop())) {
      continue;
    }

    // Its path, and its describe blocks with their test counts.
    const specPath = resolveSpecPath(rootDir, fileName);
    const describes = (fileSuite.suites || []).map((child) => ({
      title: child.title,
      testCount: countSpecs(child),
    }));

    // The file's entry.
    files.push({
      specPath,
      runner,
      area: resolveArea(specPath, root),
      testCount: countSpecs(fileSuite),
      describes,
    });
  }

  // Sorted by path.
  return files.sort((left, right) =>
    left.specPath.localeCompare(right.specPath),
  );
}

// Fallback discovery: parse spec files directly. Less precise about counts than
// Playwright, but keeps the catalog buildable on a machine with no browsers.
function discoverFromFiles({ root, runner }) {
  // The folder to scan.
  const absoluteRoot = path.join(REPO_ROOT, root);

  // Missing: nothing to find.
  if (!fs.existsSync(absoluteRoot)) {
    return [];
  }

  // The files found.
  const files = [];

  // Go through every folder under it.
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);

      // Into sub-folders.
      if (entry.isDirectory()) {
        walk(absolute);
        continue;
      }

      // Only spec files, and no set-up files.
      if (!entry.name.endsWith(".spec.ts")) continue;
      if (EXCLUDED_FILES.has(entry.name)) continue;

      // Its path, its describe titles, and a rough test count from its text.
      const specPath = toPosix(path.relative(REPO_ROOT, absolute));
      const source = fs.readFileSync(absolute, "utf8");
      const describes = [
        ...source.matchAll(/test\.describe\s*\(\s*(["'`])(.+?)\1/g),
      ].map((match) => ({ title: match[2], testCount: 0 }));
      const testCount = [...source.matchAll(/\btest\s*\(\s*["'`]/g)].length;

      // The file's entry.
      files.push({
        specPath,
        runner,
        area: resolveArea(specPath, root),
        testCount,
        describes,
      });
    }
  };

  // Scan from the root.
  walk(absoluteRoot);

  // Sorted by path.
  return files.sort((left, right) =>
    left.specPath.localeCompare(right.specPath),
  );
}

// How many unit test files web/src holds.
function countUnitTestFiles() {
  // The folder to scan.
  const absoluteRoot = path.join(REPO_ROOT, UNIT_GLOB_ROOT);

  // Missing: none.
  if (!fs.existsSync(absoluteRoot)) return 0;

  // The count so far.
  let count = 0;

  // Go through every folder under it.
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);

      // Into sub-folders.
      if (entry.isDirectory()) {
        walk(absolute);
        continue;
      }

      // Count .test.ts and .test.tsx files.
      if (/\.test\.tsx?$/.test(entry.name)) count += 1;
    }
  };

  // Scan from the root.
  walk(absoluteRoot);
  return count;
}

// The hand-written groups from flow-groups.json.
function readGroups() {
  const raw = JSON.parse(fs.readFileSync(GROUPS_PATH, "utf8"));
  return Array.isArray(raw.groups) ? raw.groups : [];
}

// A group's test count is the sum of the files its spec filters select. An
// empty specs array means "the whole suite for this runner".
function countGroupTests(group, files) {
  // Vitest groups have no count here.
  if (group.runner === "vitest") {
    return null;
  }

  // The files this group's runner runs.
  const pool = files.filter((file) => file.runner === group.runner);

  // No spec filter: every file counts.
  if (!group.specs || group.specs.length === 0) {
    return pool.reduce((total, file) => total + file.testCount, 0);
  }

  // The files the filters pick, each once.
  const selected = new Set();

  // Each filter is a file or a folder.
  for (const filter of group.specs) {
    // Without a trailing slash.
    const normalized = toPosix(filter).replace(/\/$/, "");

    // A file matches when it is that path or inside that folder.
    for (const file of pool) {
      if (
        file.specPath === normalized ||
        file.specPath.startsWith(`${normalized}/`)
      ) {
        selected.add(file);
      }
    }
  }

  // Their tests added up.
  return [...selected].reduce((total, file) => total + file.testCount, 0);
}

// Every flow: the curated groups, then one per spec file, then one per describe
// block.
function buildFlows(files, unitFileCount) {
  // Unique ids, the groups, every row's name, and the list.
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
    // The group's test count.
    const testCount = countGroupTests(group, files);

    // The group's flow.
    flows.push({
      id: group.id,
      kind: "group",
      name: group.name,
      // The name is the tester's vocabulary; the label is the same thing in
      // plain words, for the picker a colleague uses.
      label: group.label || "",
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
    // The spec's flow.
    flows.push({
      id: makeId("spec", idSource(file.specPath)),
      kind: "spec",
      name: cards.get(subjectKey(file.specPath)).name,
      description: cardDescription(file, null),
      summary: specSummary(file.specPath),
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
    // Each titled block in the file.
    for (const describe of file.describes) {
      // Untitled blocks get no flow.
      if (!describe.title) continue;

      // The block's flow, picked out with --grep.
      flows.push({
        id: makeId("suite", idSource(file.specPath), describe.title),
        kind: "suite",
        name: cards.get(subjectKey(file.specPath, describe.title)).name,
        description: cardDescription(file, describe),
        // The block's own title, as written, so the picker can show it
        // instead of the terse name.
        title: describe.title,
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

  // Every flow.
  return flows;
}

// The whole catalog: discover the tests, build the flows, and count everything.
function buildCatalog({ offline = false } = {}) {
  // Playwright's listings for the browser and visual specs, unless offline.
  const e2eListing = offline ? null : listPlaywrightTests();
  const visualListing = offline
    ? null
    : listPlaywrightTests(["-c", "playwright.visual.config.ts"]);

  // The browser spec files, from the listing or a scan of the files.
  const e2eFiles = e2eListing
    ? discoverFromPlaywright(e2eListing, {
        root: E2E_ROOT,
        runner: "playwright",
      })
    : discoverFromFiles({ root: E2E_ROOT, runner: "playwright" });

  // The visual spec files, the same way.
  const visualFiles = visualListing
    ? discoverFromPlaywright(visualListing, {
        root: VISUAL_ROOT,
        runner: "playwright-visual",
      })
    : discoverFromFiles({ root: VISUAL_ROOT, runner: "playwright-visual" });

  // All spec files, the unit file count, the flows, and how they were found.
  const files = [...e2eFiles, ...visualFiles];
  const unitFileCount = countUnitTestFiles();
  const flows = buildFlows(files, unitFileCount);
  const discovery = e2eListing ? "playwright" : "file-scan";

  // The catalog.
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

// As JSON, two-space indented, with a final newline.
function serialize(catalog) {
  return `${JSON.stringify(catalog, null, 2)}\n`;
}

// Print the flows by kind, one line each, then the totals.
function printFlowTable(catalog) {
  // The flows sorted into their kinds.
  const byKind = { group: [], spec: [], suite: [] };

  // Each flow into its kind.
  for (const flow of catalog.flows) {
    byKind[flow.kind]?.push(flow);
  }

  // Each kind: a heading, then its flows.
  for (const [kind, flows] of Object.entries(byKind)) {
    // Skip a kind with none.
    if (flows.length === 0) continue;

    // The heading and count.
    console.log(`\n${kind.toUpperCase()} (${flows.length})`);

    // One line per flow.
    for (const flow of flows) {
      const count = flow.testCount === null ? "?" : flow.testCount;
      console.log(
        `  ${flow.id.padEnd(54)} ${String(count).padStart(4)} tests  ${flow.name}`,
      );
    }
  }

  // Then the totals.
  console.log(
    `\n${catalog.totals.flows} flows across ${catalog.totals.specFiles} spec files (${catalog.totals.e2eTests} E2E tests). Discovery: ${catalog.discovery}.`,
  );
}

// Write the catalog, check it, or list it.
function main() {
  // The options.
  let options;

  // Bad options: say why, show the help, and stop.
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    printHelp();
    process.exit(1);
  }

  // --help: show it and stop.
  if (options.help) {
    printHelp();
    return;
  }

  // Discover the flows.
  const catalog = buildCatalog({ offline: options.offline });

  // --list: print them and stop.
  if (options.list) {
    // As raw JSON, or as a table.
    if (options.json) {
      console.log(serialize(catalog));
    } else {
      printFlowTable(catalog);
    }
    return;
  }

  // The catalog as it should be, and as it is on disk.
  const next = serialize(catalog);
  const current = fs.existsSync(CATALOG_PATH)
    ? fs.readFileSync(CATALOG_PATH, "utf8")
    : null;

  // --check: fail when the file differs, and change nothing.
  if (options.check) {
    // Current: say so.
    if (current === next) {
      console.log(
        `[flows] Catalog is current: ${catalog.totals.flows} flows, ${catalog.totals.e2eTests} E2E tests.`,
      );
      return;
    }

    // Stale: say how to fix it.
    console.error(
      "[flows] Flow catalog is stale. Regenerate it with: npm run flows:discover",
    );
    process.exit(1);
  }

  // No change: nothing to write.
  if (current === next) {
    console.log(
      `[flows] No change: ${catalog.totals.flows} flows, ${catalog.totals.e2eTests} E2E tests.`,
    );
    return;
  }

  // Otherwise write it.
  fs.writeFileSync(CATALOG_PATH, next);
  console.log(
    `[flows] Wrote ${path.relative(REPO_ROOT, CATALOG_PATH)}: ${catalog.totals.flows} flows, ${catalog.totals.e2eTests} E2E tests (discovery: ${catalog.discovery}).`,
  );
}

// Run only when started directly; an error prints its message and fails.
if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`[flows] ${error.message}`);
    process.exit(1);
  }
}

// What the tests and the runner use.
module.exports = { buildCatalog, serialize };
