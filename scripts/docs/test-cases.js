// Writes docs/test-cases.md: every test in the Playwright suite (`npm test`)
// in plain words, what it checks and the result it expects, then the bugs
// planted on purpose, each with where it is, what goes wrong and the tests that
// catch it. Nothing in the page is typed by hand: the tests come from
// Playwright's own list, the words from the note above each test and its
// `expected(...)` line (the one its [RESULT] block prints), and the planted
// bugs from practice.js.
//
//   npm run docs:tests          # write the page
//   npm run docs:tests:check    # fail if the page is out of date
//
// Local only, like knowledge:check: /push runs the check before a push. No
// workflow runs it.

// Node's process, file and path tools.
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
// Playwright's command line and the repository root, as the flow catalog uses
// them.
const { PLAYWRIGHT_CLI, REPO_ROOT } = require("../test-runner/catalog.js");
// The TypeScript parser, to read each test's note and expected line.
const ts = require("typescript");
// Prettier, so the page is written already formatted and the check compares
// like with like.
const prettier = require("prettier");
// The planted bugs.
const practice = require("../../practice.js");

// Where the page goes.
const PAGE = path.join(REPO_ROOT, "docs", "test-cases.md");

// Every test Playwright would run for `npm test`, from its list mode: the file,
// the line and column of the test, its title, and whether it is skipped on
// purpose.
function listTests() {
  const result = spawnSync(
    process.execPath,
    [PLAYWRIGHT_CLI, "test", "--list", "--reporter=json"],
    {
      cwd: REPO_ROOT,
      encoding: "utf8",
      shell: false,
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  if (result.status !== 0 || !result.stdout) {
    throw new Error(
      `Playwright could not list the tests: ${(result.stderr || "").split("\n")[0]}`,
    );
  }
  const listing = JSON.parse(result.stdout);
  const tests = [];
  // Specs sit inside nested suites (a file, then its describe blocks).
  const walk = (suite) => {
    for (const spec of suite.specs || []) {
      tests.push({
        file: toPosix(
          path.relative(
            REPO_ROOT,
            path.resolve(listing.config.rootDir, spec.file),
          ),
        ),
        line: spec.line,
        column: spec.column,
        title: spec.title,
        skipped: (spec.tests || []).every(
          (test) => test.expectedStatus === "skipped",
        ),
      });
    }
    for (const child of suite.suites || []) walk(child);
  };
  walk({ suites: listing.suites });
  return tests;
}

// A path with forward slashes.
function toPosix(value) {
  return String(value).replace(/\\/g, "/");
}

// Each spec file parsed once.
const parsed = new Map();
function sourceOf(file) {
  if (!parsed.has(file)) {
    const text = fs.readFileSync(path.join(REPO_ROOT, file), "utf8");
    parsed.set(
      file,
      ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true),
    );
  }
  return parsed.get(file);
}

// The `test(...)` call Playwright points at: the call that starts at the
// test's line and column (the line alone if the column does not match).
function testCall(source, line, column) {
  let exact = null;
  let onLine = null;
  const visit = (node) => {
    if (exact) return;
    if (ts.isCallExpression(node)) {
      const at = source.getLineAndCharacterOfPosition(node.getStart());
      if (at.line + 1 === line) {
        if (at.character + 1 === column) exact = node;
        else if (!onLine) onLine = node;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return exact || onLine;
}

// The note right above a piece of code: the last group of `//` lines with no
// blank line between them and the code, as one sentence.
function noteAbove(source, node) {
  const ranges = ts.getLeadingCommentRanges(source.text, node.getFullStart());
  if (!ranges || ranges.length === 0) return "";
  // Walk back from the code while the comments touch each other.
  const kept = [];
  let end = node.getStart();
  for (let i = ranges.length - 1; i >= 0; i -= 1) {
    const gap = source.text.slice(ranges[i].end, end);
    if ((gap.match(/\n/g) || []).length > 1) break;
    kept.unshift(ranges[i]);
    end = ranges[i].pos;
  }
  return plain(kept.map((r) => source.text.slice(r.pos, r.end)).join("\n"));
}

// A comment's words, without the comment marks.
function plain(comment) {
  return comment
    .split("\n")
    .map((line) =>
      line
        .replace(/^\s*\/\/\s?/, "")
        .replace(/^\s*\/\*+\s?|\s*\*+\/\s*$/g, "")
        .replace(/^\s*\*\s?/, ""),
    )
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

// The text of a test's first `expected(...)` line. A template's ${value}
// parts read as {value}; two strings joined with + read as one.
function expectedIn(source, call) {
  let text = "";
  const visit = (node) => {
    if (text) return;
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "expected" &&
      node.arguments[0]
    ) {
      text = textOf(source, node.arguments[0]);
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(call);
  return text.replace(/\s+/g, " ").trim();
}

// An expression as the words it stands for.
function textOf(source, node) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
    return node.text;
  if (ts.isTemplateExpression(node)) {
    return (
      node.head.text +
      node.templateSpans
        .map(
          (span) => `{${span.expression.getText(source)}}${span.literal.text}`,
        )
        .join("")
    );
  }
  if (
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.PlusToken
  )
    return textOf(source, node.left) + textOf(source, node.right);
  if (ts.isParenthesizedExpression(node))
    return textOf(source, node.expression);
  return node.getText(source);
}

// The first paragraph of a spec file's header note: what the file is about.
function fileNote(source) {
  const ranges = ts.getLeadingCommentRanges(source.text, 0) || [];
  const lines = [];
  for (const range of ranges) {
    const comment = source.text.slice(range.pos, range.end);
    // A `//` line with nothing after it ends the first paragraph.
    if (/^\/\/\s*$/.test(comment.trim())) {
      if (lines.length) break;
      continue;
    }
    lines.push(comment);
    // A blank line after this comment ends the paragraph too.
    const next = source.text.slice(range.end, range.end + 3);
    if (/^\r?\n\r?\n/.test(next)) break;
  }
  return plain(lines.join("\n"));
}

// Text made safe for Markdown: a tag-like "<word" or a star would be read as
// formatting.
function md(text) {
  return String(text)
    .replace(/<(?=[A-Za-z/!])/g, "&lt;")
    .replace(/\*/g, "\\*");
}

// The area a test file belongs to: its folder under tests/e2e (app,
// scenarios...); "setup" for the files straight in tests/e2e (the sign-in
// set-up and the seed); the folder under tests/ for anything else.
function areaOf(file) {
  const parts = file.split("/");
  if (parts[0] === "tests" && parts[1] === "e2e")
    return parts.length > 3 ? parts[2] : "setup";
  return parts[1] || parts[0];
}

// "1 test", "3 tests".
function count(n, word) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

// A spec file's heading, with its full path so no two are alike:
// "File: `tests/e2e/app/react-bank-locale.spec.ts`".
function fileHeading(file) {
  return `File: \`${file}\``;
}

// The heading's link target, the way GitHub makes it.
function anchor(heading) {
  return heading
    .toLowerCase()
    .replace(/[^a-z0-9 -]/g, "")
    .replace(/ /g, "-");
}

// The whole page, as Markdown.
function buildPage() {
  const tests = listTests();
  const bugs = practice.catalogue();

  // Each test with its plain words.
  const rows = tests.map((test) => {
    const source = sourceOf(test.file);
    const call = testCall(source, test.line, test.column);
    return {
      ...test,
      checks: call ? noteAbove(source, call) : "",
      expected: call ? expectedIn(source, call) : "",
    };
  });

  // Grouped by area, then by file, each in order.
  const areas = new Map();
  for (const row of rows) {
    const area = areaOf(row.file);
    if (!areas.has(area)) areas.set(area, new Map());
    const files = areas.get(area);
    if (!files.has(row.file)) files.set(row.file, []);
    files.get(row.file).push(row);
  }
  const areaNames = [...areas.keys()].sort();
  const fileCount = new Set(rows.map((row) => row.file)).size;

  const lines = [
    "# Test cases",
    "",
    "[← Back to the README](../README.md)",
    "",
    "Every test in the Playwright suite (`npm test`), in plain words: what it",
    "checks, and the result it expects. Then the bugs planted on purpose: where",
    "each one is, what goes wrong, and which tests catch it.",
    "",
    `**${rows.length} tests in ${fileCount} files · ${bugs.length} planted bugs.**`,
    "",
    "Written by `npm run docs:tests` from the tests themselves: the note above",
    "each test, and its `expected(...)` line, which is what its [RESULT] block",
    "prints. Don't edit this page by hand; run the command again after changing",
    "a test.",
    "",
    "## If someone asks",
    "",
    `- **"What do your tests cover?"** ${rows.length} tests over two websites and their APIs: the classic pages at \`/\` and Playground Bank at \`/app\` (accounts, money, cards, loans, trading, the shop, GraphQL), plus the API contracts, the infrastructure and the test framework itself. The areas are listed below with their counts.`,
    '- **"How do you know a test checks the right thing?"** Each test says in one line what it expects, and after it runs it prints a [RESULT] block with that line, every API call and its status, and the ids and amounts it used. The expected results on this page are those lines.',
    `- **"What is a planted bug?"** A bug put in on purpose, ${bugs.length} of them, switched on for one session at a time (practice mode, or a test's own run key) and off for everyone else. Every one is named by at least one test; the list at the end shows which.`,
    '- **"Why plant bugs?"** To prove the tests and the tools can find real problems: a test that never fails proves nothing.',
    "",
    "## Contents",
    "",
    // Each area, and under it each of its files, with links.
    ...areaNames.flatMap((area) => {
      const files = areas.get(area);
      const total = [...files.values()].reduce(
        (sum, list) => sum + list.length,
        0,
      );
      return [
        `- [${area}](#${anchor(area)}): ${count(total, "test")}`,
        ...[...files.keys()]
          .sort()
          .map(
            (file) =>
              `  - [\`${file}\`](#${anchor(fileHeading(file))}): ${count(files.get(file).length, "test")}`,
          ),
      ];
    }),
    `- [Planted bugs](#planted-bugs): ${bugs.length}`,
    "",
  ];

  // The tests, area by area.
  for (const area of areaNames) {
    const files = areas.get(area);
    const total = [...files.values()].reduce((sum, l) => sum + l.length, 0);
    lines.push(
      `## ${area}`,
      "",
      `${count(total, "test")} in ${count(files.size, "file")}.`,
      "",
    );
    for (const file of [...files.keys()].sort()) {
      const list = files.get(file);
      const note = fileNote(sourceOf(file));
      lines.push(
        `### ${fileHeading(file)}`,
        "",
        `${count(list.length, "test")} in this file.`,
        "",
        ...(note ? [`What the file is about: ${md(note)}`, ""] : []),
      );
      for (const row of list) {
        lines.push(
          `- **${md(row.title)}**${row.skipped ? " (skipped on purpose)" : ""}`,
          `  - File: \`${row.file}\``,
        );
        if (row.checks) lines.push(`  - Checks: ${md(row.checks)}`);
        if (row.expected) lines.push(`  - Expected: ${md(row.expected)}`);
      }
      lines.push("");
    }
  }

  // The planted bugs, each with the tests that catch it: the tests named
  // after it ("<flag>: ..."), or else every test in a file that names it.
  lines.push(
    "## Planted bugs",
    "",
    "Each one is off until practice mode (or a test's own run key) switches it",
    "on, for that session only. The site is right with it off.",
    "",
  );
  bugs.forEach((bug, index) => {
    const named = rows.filter((row) => row.title.includes(bug.flag));
    const files = named.length
      ? []
      : [...new Set(rows.map((row) => row.file))].filter((file) =>
          sourceOf(file).text.includes(bug.flag),
        );
    lines.push(
      `### ${index + 1}. ${md(bug.title)}`,
      "",
      `\`${bug.flag}\` · ${md(bug.kind)} · where: ${md(bug.where)}`,
      "",
      `- What goes wrong: ${md(bug.reveal)}`,
      `- How to see it: ${md(bug.hint)}`,
      named.length
        ? `- Caught by: ${named.map((row) => `"${md(row.title)}" (\`${row.file}\`)`).join("; ")}`
        : `- Caught by: the tests in ${files.map((file) => `\`${file}\``).join(", ") || "no spec yet"}`,
      "",
    );
  });

  return lines.join("\n");
}

// Writes the page, or with --check says whether it is current.
async function main() {
  const check = process.argv.includes("--check");
  const options = (await prettier.resolveConfig(PAGE)) || {};
  const page = await prettier.format(buildPage(), {
    ...options,
    parser: "markdown",
  });
  const current = fs.existsSync(PAGE) ? fs.readFileSync(PAGE, "utf8") : "";
  if (check) {
    if (current === page) {
      console.log("[docs] docs/test-cases.md is current.");
      return;
    }
    console.error(
      "[docs] docs/test-cases.md is out of date. Run: npm run docs:tests",
    );
    process.exit(1);
  }
  fs.writeFileSync(PAGE, page);
  console.log(`[docs] Wrote docs/test-cases.md.`);
}

main().catch((error) => {
  console.error(`[docs] ${error.message}`);
  process.exit(1);
});
