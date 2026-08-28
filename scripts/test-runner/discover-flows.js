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
// Card names and descriptions
//
// Discovery can only see two strings: the spec path and the describe title.
// Neither was written for a reader. tests/e2e/sanity/sanity-smoke.spec.ts used
// to render as "Sanity smoke", which names the folder the file sits in, not
// what pressing RUN checks, and a describe title used verbatim put
// "NarrativeEnricher" and "non-functional quality gates" on the board. The
// tables and rules below exist to turn those two strings into a card a
// colleague who has never opened this repo can act on.
//
// Everything here feeds the `name` and `description` fields only. Ids come
// from idSource() and the raw describe title before any of this runs, so no
// wording change can move an id that a workflow, a doc, or a bookmark
// resolves.
// ---------------------------------------------------------------------------

// Expanded before any casing, because sentence case alone turns these into
// what look like typos: "Api openapi contract", "Rbac", "Ui change healing".
//
// Two kinds of entry share the table because both have to land before casing
// runs: an acronym whose only problem is its shape (API, HTTP, JSON, URL), and
// a token nobody outside this repo can decode (a11y, i18n, rhf), which gets
// spelled out. The spelled-out ones stay lowercase because this is a
// mid-sentence phrase; renderName capitalizes whatever ends up first.
//
// "e2e" spells out to "browser" rather than "E2E" on purpose: the acronym tells
// a colleague picking a flow nothing, and the one thing it reliably means here
// is "drives a real browser". E2E survives only where a curated subject writes
// it, which is the only place it is unavoidable.
const ABBREVIATIONS = {
  a11y: "accessibility",
  api: "API",
  cta: "CTA",
  e2e: "browser",
  http: "HTTP",
  i18n: "internationalisation",
  json: "JSON",
  openapi: "OpenAPI",
  rbac: "RBAC",
  rhf: "React Hook Form",
  spa: "SPA",
  ui: "UI",
  url: "URL",
};

// Proper nouns the sentence-case pass would otherwise flatten to lowercase.
const FIXED_CASE = {
  axe: "axe",
  obsidian: "Obsidian",
  openai: "OpenAI",
  radix: "Radix",
  react: "React",
  tanstack: "TanStack",
  zod: "Zod",
};

// Jargon to plain English, the same vocabulary the curated groups in
// flow-groups.json use, so the whole board speaks one language. Longest key
// wins, and a key still matches after ABBREVIATIONS has recased it, which is
// how "SPA" becomes "single-page" rather than staying an acronym. The words a
// rewrite introduces are exempt from the duplicate collapse below: they now
// carry the meaning the jargon token had.
const PLAIN_WORDS = {
  "auth session": "sign-in and session",
  "contract governance": "API shape",
  "non-functional": "page speed and rendering",
  auth: "sign-in",
  drift: "unexpected change",
  enricher: "rewriter",
  healing: "repair",
  parametrized: "every item",
  rbac: "role permissions",
  regression: "full sweep",
  sanity: "quick check",
  smoke: "quick check",
  spa: "single-page",
  surface: "app",
};

const PLAIN_WORD_KEYS = Object.keys(PLAIN_WORDS).sort(
  (left, right) => right.length - left.length,
);

// Hyphens become spaces, except in these: they read as one word.
const COMPOUNDS = [
  "non-functional",
  "sign-up",
  "self-healing",
  "self-repair",
  "single-page",
  "end-to-end",
];

// Stay lowercase inside a phrase, and are never treated as duplicates.
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
]);

// Card prefix per folder, so flows from the same area scan and sort together.
const AREA_LABELS = {
  app: "React app",
  contracts: "API contract",
  functional: "Journeys",
  generated: "Generated",
  "non-functional": "Quality",
  sanity: "Quick check",
  scenarios: "Self-repair",
  visual: "Screenshots",
  // tests/visual/visual.spec.ts resolves to area "root" as well (one segment
  // under its own root), so the screenshot label follows the runner instead of
  // this table. A root-level E2E spec such as seed.spec.ts then gets no prefix
  // rather than a wrong one.
  root: null,
};

const VISUAL_LABEL = "Screenshots";
const NAME_LIMIT = 38;
const BLOCK_SUFFIX = " (one block)";
const FILE_SUFFIX = " (one file)";

// What each file actually checks, which is the one thing neither the path nor
// the describe title can tell us. Written once, here, and keyed by spec path
// plus "::<describe title>" for a single block. `subject` replaces the derived
// phrase, `label` overrides the folder prefix for the files whose folder lies
// about them (an API test parked under app/), and `detail` is the clause the
// description adds after the path. Nothing is required: a renamed or new spec
// falls back to the derived name, so this table can never break discovery.
const SUBJECTS = {
  // app/ - the React surface at /app, plus one API test that lives here.
  "tests/e2e/app/api-openapi-contract.spec.ts": {
    label: "API",
    subject: "OpenAPI contract",
    detail: "every documented endpoint plus the served openapi.json",
  },
  "tests/e2e/app/api-openapi-contract.spec.ts::OpenAPI contract: live responses match the published spec":
    { label: "API", subject: "live replies match the spec" },
  "tests/e2e/app/api-openapi-contract.spec.ts::OpenAPI contract: armed drift is detected (REPORT)":
    {
      label: "API",
      subject: "planted mismatch is caught",
      detail: "the deliberately broken products reply",
    },
  "tests/e2e/app/react-a11y.spec.ts": {
    subject: "accessibility scan",
    detail: "the create-user dialog, clean and with a missing-label bug armed",
  },
  "tests/e2e/app/react-a11y.spec.ts::React a11y (axe)": {
    subject: "accessibility scan",
  },
  "tests/e2e/app/react-account.spec.ts": {
    subject: "account and session",
    detail: "the signed-out state and an expired session",
  },
  "tests/e2e/app/react-account.spec.ts::React Account (auth/session)": {
    subject: "account and session",
  },
  "tests/e2e/app/react-flows.spec.ts": {
    subject: "orders and users pages",
    detail: "live orders plus create-user form validation",
  },
  "tests/e2e/app/react-flows.spec.ts::React Orders page (TanStack Query)": {
    subject: "orders from the live API",
  },
  "tests/e2e/app/react-flows.spec.ts::React Users page (Radix dialog + RHF/Zod)":
    { subject: "create-user form checks" },
  "tests/e2e/app/react-orders.spec.ts": {
    subject: "orders screen",
    detail: "a stable load, a flaky load that recovers, and a renamed button",
  },
  "tests/e2e/app/react-orders.spec.ts::React Orders (TanStack Query)": {
    subject: "orders screen",
  },
  "tests/e2e/app/react-products.spec.ts": {
    subject: "catalog and 48 items",
    detail: "the catalog plus all 48 product pages",
  },
  "tests/e2e/app/react-products.spec.ts::React Products catalog": {
    subject: "catalog list and filters",
    detail: "listing, category filters, an empty search, and sorting",
  },
  "tests/e2e/app/react-products.spec.ts::React Product detail (parametrized across the catalog)":
    {
      subject: "product detail, every catalog item",
      detail: "one pass per seeded product",
    },
  // No subject: R7 borrows the describe title, which already says "SPA shell".
  "tests/e2e/app/react-shell.spec.ts": {
    detail: "client-side navigation and a deep link served by the fallback",
  },
  "tests/e2e/app/react-users.spec.ts": {
    subject: "users screen",
    detail: "search, date format, and a create that rolls back",
  },
  "tests/e2e/app/react-users.spec.ts::React Users (search, create, drift)": {
    subject: "users screen",
  },

  // contracts/, functional/, generated/, non-functional/, sanity/
  "tests/e2e/contracts/api-contract-governance.spec.ts": {
    subject: "reply shapes",
    detail: "the core local endpoints, no browser",
  },
  "tests/e2e/functional/negative/functional-negative.spec.ts": {
    subject: "error paths",
    detail: "stale selectors, bad input, and a failing orders service",
  },
  "tests/e2e/functional/positive/functional-positive.spec.ts": {
    subject: "healthy paths",
    detail: "healthy API, stable dashboard, and a valid product page",
  },
  "tests/e2e/generated/home-cta-navigates-to-dashboard.spec.ts": {
    subject: "home CTA to the dashboard",
    detail: "written by the generator agent",
  },
  "tests/e2e/generated/home-cta-navigates-to-dashboard.spec.ts::Home CTA": {
    subject: "home CTA to the dashboard",
  },
  "tests/e2e/non-functional/non-functional-quality.spec.ts": {
    subject: "speed and layout",
    detail:
      "latency budgets, phone-width rendering, and the broken-page detector",
  },
  "tests/e2e/sanity/new-pages.spec.ts": {
    subject: "the four newer pages",
    detail: "orders, admin, profile, and settings",
  },
  "tests/e2e/sanity/sanity-smoke.spec.ts": {
    // Deliberately not the group's "home, orders, product": group-sanity runs
    // this exact file, and two cards reading the same words help nobody.
    subject: "the three main pages",
    detail: "the landing page, the orders dashboard, and a healthy product",
  },

  // scenarios/ - break something on purpose, then check the repair or the
  // explanation. Prefixed "Self-repair" by AREA_LABELS.
  "tests/e2e/scenarios/advanced-locator-healing.spec.ts": {
    subject: "menus, modals, table rows",
    detail: "dropdown, menu, modal, row-action, and scoped-field locators",
  },
  "tests/e2e/scenarios/api-error-diagnosis.spec.ts": {
    subject: "diagnose an API error",
    detail: "a phone-number type mismatch on create-user",
  },
  "tests/e2e/scenarios/auth-session.spec.ts": {
    detail: "sign-in, a wrong password, a session banner, and an expiry",
  },
  "tests/e2e/scenarios/dynamic-content-validation.spec.ts": {
    subject: "changing product data",
    detail: "one valid and one broken product state",
  },
  "tests/e2e/scenarios/execution-planner.spec.ts": {
    subject: "recovery step order",
    detail: "strategy ordering, and diagnosis-only chains that must not act",
  },
  "tests/e2e/scenarios/failure-classification-and-patch-proposal.spec.ts": {
    subject: "failure sorting and patch proposal",
    detail: "UI render failures and API drift, and the patch each proposes",
  },
  "tests/e2e/scenarios/failure-classifier-expansion.spec.ts": {
    subject: "more failure kinds",
    detail: "auth, modal, navigation, timeout, empty-state, and role branches",
  },
  "tests/e2e/scenarios/flaky-network-recovery.spec.ts": {
    subject: "retry a flaky request",
    detail: "a retryable orders failure, through live dashboard state",
  },
  "tests/e2e/scenarios/generic-self-healing.spec.ts": {
    subject: "buttons, links, inputs",
    detail: "stale locators routed through the generic healer",
  },
  "tests/e2e/scenarios/incident-memory-and-evidence.spec.ts": {
    subject: "incident notes and proof",
    detail: "memory entries and page evidence written to local files",
  },
  "tests/e2e/scenarios/narrative-enricher.spec.ts": {
    subject: "failure text rewriter",
    detail: "the deterministic fallback and every provider failure mode",
  },
  "tests/e2e/scenarios/orchestrated-recovery.spec.ts": {
    subject: "end-to-end recovery run",
    detail: "a stale locator routed through the incident router",
  },
  "tests/e2e/scenarios/page-contract-validation.spec.ts": {
    subject: "page contract checks",
    detail: "home, dashboard, and product pages",
  },
  "tests/e2e/scenarios/policy-engine.spec.ts": {
    detail: "what a repair may do: confidence thresholds, production blocked",
  },
  "tests/e2e/scenarios/rbac.spec.ts": {
    detail: "viewer and editor limits, plus the known over-permission defect",
  },
  "tests/e2e/scenarios/real-agent-proof.spec.ts": {
    subject: "real agent, live app",
    detail: "a live LLM heal, vault notes, and unsafe output refused",
  },
  "tests/e2e/scenarios/repair-flow.spec.ts": {
    subject: "plan, patch, verify",
    detail: "the planner, applier, verifier, and the production block",
  },
  "tests/e2e/scenarios/ui-change-healing.spec.ts": {
    detail: "an outdated Join button selector",
  },

  // Root-level specs.
  "tests/e2e/seed.spec.ts": {
    subject: "seed the demo data",
    detail: "the fixture data the other flows read",
  },
  "tests/e2e/seed.spec.ts::Seed": { subject: "seed the demo data" },
  "tests/visual/visual.spec.ts": {
    subject: "/app/orders",
    detail: "the orders page against its committed reference image",
  },
  "tests/visual/visual.spec.ts::React surface visual snapshots": {
    subject: "/app/orders",
  },
};

function subjectKey(specPath, title) {
  return title ? `${specPath}::${title}` : specPath;
}

// Punctuation-free lowercase form, used only to compare words: "(/app)" and
// "app" are the same restatement, and "Api" and "API" the same token.
function wordKey(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

// R2: identifiers lifted out of code land on the card as one word otherwise.
function splitCamelCase(value) {
  return String(value)
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]{2,})([A-Z][a-z])/g, "$1 $2");
}

// R5: hyphens become word breaks, but a compound is one word, so it is parked
// behind a placeholder while the split runs.
function tokenize(raw) {
  let text = splitCamelCase(raw);

  // The placeholder must survive the hyphen split and stay clear of real
  // digits: "a11y" and "48 items" come through here too.
  COMPOUNDS.forEach((compound, index) => {
    text = text.replace(
      new RegExp(escapeRegExp(compound), "gi"),
      `~~${index}~~`,
    );
  });

  return text
    .replace(/[-_]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((token) =>
      token.replace(/~~(\d+)~~/g, (_, index) => COMPOUNDS[Number(index)]),
    );
}

// R1: expand in place so surrounding punctuation survives ("(axe)", "/app").
function expandAbbreviation(token) {
  const key = wordKey(token);
  const expansion = ABBREVIATIONS[key] || FIXED_CASE[key];

  if (!expansion) return token;

  return token.replace(new RegExp(escapeRegExp(key), "i"), expansion);
}

// R8. Returns the words the rewrites introduced so R3 leaves them alone.
function applyPlainWords(phrase) {
  let text = phrase;
  const introduced = new Set();

  for (const key of PLAIN_WORD_KEYS) {
    const pattern = new RegExp(
      `(^|[^a-z0-9])(${escapeRegExp(key)})(?![a-z0-9])`,
      "gi",
    );
    const next = text.replace(
      pattern,
      (_, before) => `${before}${PLAIN_WORDS[key]}`,
    );

    if (next === text) continue;

    text = next;

    for (const word of PLAIN_WORDS[key].split(/\s+/)) {
      introduced.add(wordKey(word));
    }
  }

  return { text, introduced };
}

// R3: the area prefix, the folder name and the file name restate each other
// constantly (scenarios/…, non-functional/non-functional-quality, visual/
// visual), and R6 is about to add the area label on top.
function collapseRepeats(words, { labelWords, areaWords, introduced }) {
  const seen = new Set();
  const kept = [];

  for (const word of words) {
    const key = wordKey(word);

    if (!key || SMALL_WORDS.has(key)) {
      kept.push(word);
      continue;
    }

    const restated =
      !introduced.has(key) && (labelWords.has(key) || areaWords.has(key));

    if (seen.has(key) || restated) continue;

    seen.add(key);
    kept.push(word);
  }

  return kept.length > 0 ? kept : words;
}

// A token the tables have never heard of but whose author already shouted it
// (SSO, TLS, CSRF) is an acronym, and "sso" reads as a typo. Length is what
// separates those from a shouted ordinary word: "REPORT" is a shout, and
// sentence case is the right answer for it.
const ACRONYM = /^[A-Z][A-Z0-9]{1,4}$/;

function isAcronym(word) {
  return ACRONYM.test(word.replace(/[^A-Za-z0-9]/g, ""));
}

// R4: sentence case, not "uppercase the first character". Casing comes back
// from the tables, so an acronym stays an acronym wherever it sits, and one the
// tables miss keeps the shape it arrived in rather than being flattened.
function caseWord(word) {
  const key = wordKey(word);
  const fixed = ABBREVIATIONS[key] || FIXED_CASE[key];

  if (fixed) return word.replace(new RegExp(escapeRegExp(key), "i"), fixed);

  return isAcronym(word) ? word : word.toLowerCase();
}

// One raw string (a file basename or a describe title) to the mid-sentence
// phrase a card shows. Capitalization of the first word happens at render
// time, because an area prefix may end up in front of it.
function toPhrase(raw, context) {
  const words = tokenize(raw).map(expandAbbreviation);
  const { text, introduced } = applyPlainWords(words.join(" "));
  const kept = collapseRepeats(text.split(/\s+/).filter(Boolean), {
    ...context,
    introduced,
  });

  return kept.map(caseWord).join(" ");
}

function resolveLabel(file) {
  if (file.runner === "playwright-visual") return VISUAL_LABEL;

  const label = AREA_LABELS[file.area];

  return label === undefined ? null : label;
}

// R7: one describe block usually says more than the file name it sits in, so
// borrow its title. Two or more blocks each describe something different and
// the path stays the only honest summary of the file.
function moreInformative(titleWords, pathWords) {
  if (titleWords.length === 0) return false;

  const pathKeys = new Set(pathWords.map(wordKey));

  return (
    titleWords.length > pathWords.length ||
    titleWords.some((word) => !pathKeys.has(wordKey(word)))
  );
}

function cardParts(file, describe) {
  const curated = SUBJECTS[subjectKey(file.specPath, describe?.title)] || {};
  const label = "label" in curated ? curated.label : resolveLabel(file);
  const context = {
    labelWords: new Set(tokenize(label || "").map(wordKey)),
    areaWords: new Set(tokenize(file.area).map(wordKey)),
  };

  if (curated.subject) {
    return { label, subject: curated.subject };
  }

  if (describe) {
    return { label, subject: toPhrase(describe.title, context) };
  }

  const basename = specBasename(file.specPath);
  const onlyBlock =
    file.describes.length === 1 ? file.describes[0].title : null;
  const source =
    onlyBlock &&
    moreInformative(
      tokenize(onlyBlock).map(expandAbbreviation),
      tokenize(basename).map(expandAbbreviation),
    )
      ? onlyBlock
      : basename;

  return { label, subject: toPhrase(source, context) };
}

function capitalizeFirst(phrase) {
  return phrase.replace(/^[a-z]/, (letter) => letter.toUpperCase());
}

function dropParenthetical(phrase) {
  return phrase.replace(/\s*\([^()]*\)\s*$/, "").trim();
}

function trimToWords(phrase, budget) {
  const words = phrase.split(" ");
  let text = "";

  for (const word of words) {
    const candidate = text ? `${text} ${word}` : word;

    if (candidate.length > budget) break;

    text = candidate;
  }

  return (text || phrase.slice(0, budget)).replace(/[,;:-]+$/, "");
}

// R6 and R9. The prefix is the first thing shed when the name will not fit:
// the board already groups by area, so it is the most repeated word on screen
// and the least missed.
function renderName({ label, subject }, suffix = "") {
  const bare = capitalizeFirst(subject);
  const startsWithLabel =
    label && wordKey(subject).startsWith(wordKey(label.split(" ")[0]));
  const prefixed = label && !startsWithLabel ? `${label}: ${subject}` : bare;
  const budget = NAME_LIMIT - suffix.length;

  for (const candidate of [prefixed, bare, dropParenthetical(bare)]) {
    if (candidate.length <= budget) return `${candidate}${suffix}`;
  }

  return `${trimToWords(dropParenthetical(bare), budget)}${suffix}`;
}

// R11: the question after "what does this check" is always "how long will it
// take", so the count and the cost travel together, and the path stays in the
// description where there is room for it.
function costHint(testCount, runner) {
  if (runner === "vitest") return "No browser, seconds.";

  let hint;

  if (testCount <= 3) hint = "A few seconds.";
  else if (testCount <= 20) hint = "Under a minute.";
  else if (testCount <= 60) hint = "1-2 minutes locally, longer on CI.";
  else hint = "Several minutes.";

  return runner === "playwright-visual" ? `${hint} ${VISUAL_WARNING}` : hint;
}

function cardDescription(file, describe) {
  const { detail } = SUBJECTS[subjectKey(file.specPath, describe?.title)] || {};
  const count = describe ? describe.testCount : file.testCount;

  // Offline discovery cannot count tests. Say where to look and stop rather
  // than promise a cost this run had no way to measure.
  if (!count) {
    return describe
      ? `The "${describe.title}" block in ${file.specPath}.`
      : `Every test in ${file.specPath}.`;
  }

  const where = describe
    ? `the "${describe.title}" block of ${file.specPath}`
    : file.specPath;
  const checks = `${count} check${count === 1 ? "" : "s"} in ${where}`;

  return `${checks}${detail ? `, ${detail}` : ""}. ${costHint(count, file.runner)}`;
}

// R10: a spec card and its only describe block cover the same tests and so
// render the same words. Two identical cards is worse than a long one, so the
// block keeps the wording and says what it is. `reserved` carries the curated
// group names, which are written by hand in flow-groups.json and can drift
// into a discovered name at any time: a group that runs exactly one spec file
// is the case to watch.
function planCards(files, reserved = []) {
  const cards = new Map();

  for (const file of files) {
    cards.set(subjectKey(file.specPath), {
      kind: "spec",
      parts: cardParts(file, null),
    });

    for (const describe of file.describes) {
      if (!describe.title) continue;

      cards.set(subjectKey(file.specPath, describe.title), {
        kind: "suite",
        parts: cardParts(file, describe),
      });
    }
  }

  const counts = new Map();

  for (const name of reserved) {
    counts.set(name, (counts.get(name) || 0) + 1);
  }

  for (const card of cards.values()) {
    card.name = renderName(card.parts);
    counts.set(card.name, (counts.get(card.name) || 0) + 1);
  }

  const bump = (name, delta) =>
    counts.set(name, (counts.get(name) || 0) + delta);

  // The block card moves first, because it is the narrower of the two: the
  // file card is the one a person picks by default and keeps the plain name.
  for (const card of cards.values()) {
    if (card.kind !== "suite" || counts.get(card.name) < 2) continue;

    bump(card.name, -1);
    card.name = renderName(card.parts, BLOCK_SUFFIX);
    bump(card.name, 1);
  }

  // Whatever still collides collides with a curated group name, which no rule
  // here may rewrite: flow-groups.json is hand-maintained on purpose.
  for (const card of cards.values()) {
    if (counts.get(card.name) < 2) continue;

    bump(card.name, -1);
    card.name = renderName(card.parts, FILE_SUFFIX);
    bump(card.name, 1);
  }

  return cards;
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
