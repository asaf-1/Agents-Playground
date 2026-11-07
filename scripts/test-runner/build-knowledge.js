// Builds the test runner's knowledge base: the notes its "similar known
// problems" search ranks (test-runner/src/knowledge.js).
//
// The runner is deployed from test-runner/ alone, so it cannot read
// practice.js at run time. This script copies what the search needs out of the
// planted-bug catalogue into test-runner/src/knowledge-base.json, one note per
// bug, plus the spec files that exercise it. Only public files feed it: the
// runner is public, so nothing from the private md/ folder goes in.
//
// The failure-category notes are not here; they live beside their rules in
// test-runner/src/triage.js and the runner reads them directly.
//
// Usage:
//   node scripts/test-runner/build-knowledge.js            # write the file
//   node scripts/test-runner/build-knowledge.js --check    # exit 1 if stale
//
// Like the flow catalog, the file has no timestamp, so it changes only when the
// catalogue does.

// Files and paths.
const fs = require("node:fs");
const path = require("node:path");

// The repo's root folder.
const REPO_ROOT = path.resolve(__dirname, "..", "..");
// The file this writes.
const OUTPUT = path.join(
  REPO_ROOT,
  "test-runner",
  "src",
  "knowledge-base.json",
);
// Where the browser specs are.
const E2E_ROOT = path.join(REPO_ROOT, "tests", "e2e");
// The file's format version.
const SCHEMA_VERSION = 1;

// Every .spec.ts file under a folder, in a stable order.
function specFiles(dir) {
  // The files found so far.
  const found = [];

  // Go into folders; keep the spec files.
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) found.push(...specFiles(full));
    else if (entry.name.endsWith(".spec.ts")) found.push(full);
  }

  // Sorted, so the output is the same on every machine.
  return found.sort();
}

// A path from the repo root, with forward slashes.
function relative(file) {
  return path.relative(REPO_ROOT, file).split(path.sep).join("/");
}

// The knowledge base: one note per planted bug, with the specs that name its
// flag.
function build() {
  // The planted bugs, and the text of every spec.
  const { BUGS } = require(path.join(REPO_ROOT, "practice.js"));
  const specs = specFiles(E2E_ROOT).map((file) => ({
    file: relative(file),
    text: fs.readFileSync(file, "utf8"),
  }));

  // One note per bug, from its catalogue entry.
  const notes = BUGS.map((bug) => ({
    id: `fault:${bug.flag}`,
    kind: "fault",
    flag: bug.flag,
    title: bug.title,
    family: bug.kind,
    verdict: bug.verdict,
    where: bug.where,
    meaning: bug.reveal,
    hint: bug.hint,
    // Word-bounded, so "bankStaleBalance" does not also claim a file that only
    // mentions "bankStaleBalanceCheck".
    specs: specs
      .filter((spec) => new RegExp(`\\b${bug.flag}\\b`).test(spec.text))
      .map((spec) => spec.file),
  }));

  // The whole file's content.
  return {
    schemaVersion: SCHEMA_VERSION,
    source:
      "practice.js (BUGS) and the specs under tests/e2e that name each flag",
    notes,
  };
}

// As JSON, two-space indented, with a final newline.
function serialize(data) {
  return `${JSON.stringify(data, null, 2)}\n`;
}

// Write the file, or with --check only say whether it is current.
function main() {
  // Whether this is a check, and the file as it should be now.
  const check = process.argv.includes("--check");
  const next = serialize(build());

  // --check: fail when the file differs, and change nothing.
  if (check) {
    // The file as it is on disk.
    const current = fs.existsSync(OUTPUT)
      ? fs.readFileSync(OUTPUT, "utf8")
      : "";

    // Stale: say how to fix it and stop with an error.
    if (current !== next) {
      console.error(
        "[knowledge] test-runner/src/knowledge-base.json is stale. Run npm run knowledge:build.",
      );
      process.exit(1);
    }

    // Current: say so.
    console.log(
      `[knowledge] Knowledge base is current: ${build().notes.length} notes.`,
    );
    return;
  }

  // Otherwise write it.
  fs.writeFileSync(OUTPUT, next);
  console.log(
    `[knowledge] Wrote test-runner/src/knowledge-base.json: ${build().notes.length} notes.`,
  );
}

// Run only when started directly, not when a test loads this file.
if (require.main === module) main();

// What the runner tests use.
module.exports = { build, serialize, OUTPUT };
