// Node's file and path tools.
import fs from "node:fs";
import path from "node:path";
// Playwright's test tools, with the [RESULT] block printed after every test.
import {
  expect,
  expected,
  fact,
  test,
} from "../../framework/fixtures/resultBlock";
// The runner's triage rules: which kind of problem a failure message is.
import { classify } from "../../test-runner/src/triage.js";
// The runner's "similar known problems" search.
import { similarProblems } from "../../test-runner/src/knowledge.js";
// The runner's report building and its HTML and CSV downloads.
import {
  buildReport,
  csvCell,
  parseRunTitle,
  signatureOf,
  toCsv,
  toHtml,
} from "../../test-runner/src/reports.js";
// The knowledge-base builder: what the file should say, and where it is.
import {
  build,
  serialize,
  OUTPUT,
} from "../../scripts/test-runner/build-knowledge.js";

// The Triage tab's logic, without a browser or a server: how a failure is
// categorised, what the "similar known problems" search finds, how errors are
// grouped, and that the downloads cannot be turned against the person who
// opens them. Fast enough to run on every `npm run test:runner`.

// The repository root, two folders up from this file.
const ROOT = path.resolve(__dirname, "..", "..");

test.describe("Failure categories (FailureClassifier's names)", () => {
  // One message per category the stub and real runs produce, and the traps:
  // a balance of "1,500.00" is not an HTTP 500.
  const CASES: [string, string][] = [
    [
      "Error: expect(received).toBe(expected)\n\nExpected: 200\nReceived: 500",
      "api-server-error",
    ],
    ["Expected: 403\nReceived: 200", "permissions-or-rbac"],
    ["Expected: 200\nReceived: 401", "auth-or-session"],
    ["Expected: 201\nReceived: 409", "api-client-error"],
    [
      "locator.click: Timeout 5000ms exceeded.\nCall log:\n  - waiting for getByTestId('x')",
      "ui-missing-locator",
    ],
    [
      "strict mode violation: getByRole('button') resolved to 2 elements",
      "ui-missing-locator",
    ],
    ["Test timeout of 30000ms exceeded.", "ui-loading-or-network"],
    ["apiRequestContext.post: Timeout 10000ms exceeded.", "api-timeout"],
    [
      'expect(received).toMatchObject(expected)\n- "price": Any<Number>',
      "api-contract-drift",
    ],
    ["expect(page).toHaveURL(expected) failed", "ui-route-or-navigation"],
    [
      "expect(locator).toHaveCount(expected) failed\nExpected: 3\nReceived: 0",
      "ui-empty-state",
    ],
    [
      'expect(locator).toHaveText(expected) failed\nExpected: "1,250.00"\nReceived: "1,500.00"',
      "ui-delayed-data",
    ],
    ["expect(locator).toBeVisible() failed", "ui-contract-or-render"],
    ["Error: response status 503 Service Unavailable", "api-server-error"],
    ["", "unknown"],
    ["something nobody planned for", "unknown"],
  ];

  // One test per message: it lands in its category.
  for (const [message, category] of CASES) {
    test(`${category}: ${message.split("\n")[0].slice(0, 50) || "(empty)"}`, () => {
      expected(`classified as ${category}`);
      fact("message", message);
      expect(classify(message)).toBe(category);
    });
  }
});

// The retrieval eval. Every planted-bug spec titles its tests
// "<flag>: <what goes wrong>". Take the sentence, drop the flag (which would
// make the search trivial), search with it and the file name, and check the
// right bug's note comes back. hit@1 is "first", hit@3 is "in the top three".
function evalCases() {
  // The planted bugs' flag names.
  const { BUGS } = require(path.join(ROOT, "practice.js"));
  const flags = new Set(BUGS.map((bug: { flag: string }) => bug.flag));
  const cases: { flag: string; title: string; file: string }[] = [];
  // Every .spec.ts file under a folder, at any depth.
  const walk = (dir: string): string[] =>
    fs
      .readdirSync(dir, { withFileTypes: true })
      .flatMap((entry) =>
        entry.isDirectory()
          ? walk(path.join(dir, entry.name))
          : entry.name.endsWith(".spec.ts")
            ? [path.join(dir, entry.name)]
            : [],
      );

  // Each test titled "<flag>: <sentence>" whose flag is a planted bug is a case.
  for (const file of walk(path.join(ROOT, "tests", "e2e"))) {
    const text = fs.readFileSync(file, "utf8");
    for (const match of text.matchAll(
      /test\(\s*["'`]([A-Za-z]+): ([^"'`]+)["'`]/g,
    )) {
      if (flags.has(match[1])) {
        cases.push({
          flag: match[1],
          title: match[2],
          file: path.relative(ROOT, file).split(path.sep).join("/"),
        });
      }
    }
  }

  return cases;
}

test.describe("Similar known problems (retrieval, BM25)", () => {
  // Searching with a planted-bug test's own sentence finds that bug's note in
  // the top three, for at least 90% of the cases.
  test("finds the planted bug a failing test belongs to", () => {
    expected(
      "at least 20 cases; the right bug in the top three for at least 90%",
    );
    const cases = evalCases();
    let hit1 = 0;
    let hit3 = 0;
    const misses: string[] = [];

    // Search for each case and see where its own bug lands.
    for (const c of cases) {
      const ids = similarProblems({
        title: c.title,
        file: c.file,
        message: "",
      }).map((hit: { id: string }) => hit.id);
      if (ids[0] === `fault:${c.flag}`) hit1 += 1;
      if (ids.includes(`fault:${c.flag}`)) hit3 += 1;
      else
        misses.push(
          `${c.flag}: "${c.title}" -> ${ids.join(", ") || "nothing"}`,
        );
    }
    fact("cases", cases.length);
    fact("hit@1", hit1);
    fact("hit@3", hit3);

    // The score goes into the report as well as the console.
    test.info().annotations.push({
      type: "eval",
      description: `${cases.length} cases, hit@1 ${hit1}/${cases.length}, hit@3 ${hit3}/${cases.length}`,
    });
    console.log(
      `[eval] ${cases.length} cases · hit@1 ${hit1}/${cases.length} · hit@3 ${hit3}/${cases.length}`,
    );

    // At least twenty cases, so a broken regex that finds none fails here
    // rather than passing an empty eval.
    expect(cases.length).toBeGreaterThanOrEqual(20);
    expect(hit3 / cases.length, misses.join("\n")).toBeGreaterThanOrEqual(0.9);
  });

  // A generic click timeout lands on the "missing locator" category note.
  test("a generic failure lands on its kind of problem", () => {
    expected("the first hit is category:ui-missing-locator");
    const hits = similarProblems({
      title: "Cards › check 2",
      file: "tests/e2e/app/react-bank-cards.spec.ts",
      message:
        "locator.click: Timeout 5000ms exceeded.\nCall log:\n  - waiting for getByTestId('card-freeze')",
    });
    fact("first hit", hits[0]?.id);

    expect(hits[0].id).toBe("category:ui-missing-locator");
  });

  // Words that appear in no note return nothing, not a random guess.
  test("returns nothing rather than noise for words no note has", () => {
    expected("no hits for 'zzqx'");
    expect(similarProblems({ title: "zzqx", file: "", message: "" })).toEqual(
      [],
    );
  });
});

test.describe("Report building", () => {
  // The run title gives the flow and who asked; a title in another shape gives neither.
  test("reads the flow and the person from the run title", () => {
    expected(
      "'group-app · requested by maya' -> group-app and maya; another title -> empty",
    );
    expect(parseRunTitle("group-app · requested by maya")).toEqual({
      flowId: "group-app",
      requester: "maya",
    });
    expect(parseRunTitle("Some title from GitHub's own form")).toEqual({
      flowId: "",
      requester: "",
    });
  });

  // Errors that differ only in their numbers group together; a different
  // status does not.
  test("groups the same error worded with different numbers, not different statuses", () => {
    expected(
      "'Expected 3/5, Received 0' share a signature; 200/500 and 403/200 do not",
    );
    const a = signatureOf("Expected: 3\nReceived: 0\n    at a.spec.ts:10:5");
    const b = signatureOf("Expected: 5\nReceived: 0\n    at b.spec.ts:99:5");
    fact("signature", a);
    expect(a).toBe(b);

    expect(signatureOf("Expected: 200\nReceived: 500")).not.toBe(
      signatureOf("Expected: 403\nReceived: 200"),
    );
  });

  // A report over made-up runs counts outcomes, leaves pipeline failures out
  // of the pass rate, sums the tests, and ranks the failing and flaky ones.
  test("counts, ranks and keeps pipeline problems out of the test figures", () => {
    expected(
      "4 runs in 14 days (1 passed, 2 failed, 1 infra); pass rate 33; tests 30/2/1/3; the top failing test failed in 2 runs as api-server-error; 1 flaky; 1 group of 2; 3 rows",
    );
    // A fixed "now", and makers for runs, a failure and a results file.
    const now = Date.parse("2026-10-27T12:00:00Z");
    const at = (hoursAgo: number) =>
      new Date(now - hoursAgo * 3600_000).toISOString();
    const run = (
      id: number,
      hoursAgo: number,
      outcome: string,
      flow = "group-app",
    ) => ({
      id,
      runNumber: id,
      status: "completed",
      outcome,
      createdAt: at(hoursAgo),
      updatedAt: at(hoursAgo - 0.1),
      displayTitle: `${flow} · requested by maya`,
    });
    const failure = {
      title: "Cards › check 1",
      file: "tests/e2e/app/api-bank-cards.spec.ts",
      line: 17,
      message: "Expected: 200\nReceived: 500",
    };
    const results = (failed: number, flaky = 0) => ({
      available: true,
      passed: 10,
      failed,
      flaky,
      skipped: 1,
      failures: failed ? [failure] : [],
      flakyTests: flaky
        ? [{ ...failure, title: "Cards › check 2", message: "Timeout" }]
        : [],
    });

    // Five runs: two failed, one passed, one pipeline failure, one too old.
    const report = buildReport({
      runs: [
        run(1, 30, "failed"),
        run(2, 20, "failed"),
        run(3, 10, "passed"),
        run(4, 5, "infra"),
        run(5, 400, "failed"), // outside 14 days
      ],
      resultsById: new Map([
        ["1", results(1)],
        ["2", results(1, 1)],
        ["3", results(0)],
      ]),
      filters: { window: "14d", flow: "", actor: "", outcome: "" },
      now,
    });
    fact("summary", report.summary);

    expect(report.summary.runs).toBe(4);
    expect(report.summary.outcomes).toEqual({
      passed: 1,
      failed: 2,
      infra: 1,
      cancelled: 0,
    });
    // Two out of three runs with a verdict failed; the pipeline problem has no vote.
    expect(report.summary.passRate).toBe(33);
    expect(report.summary.tests).toEqual({
      passed: 30,
      failed: 2,
      flaky: 1,
      skipped: 3,
    });
    // The rankings.
    expect(report.mostFailing[0]).toMatchObject({
      title: "Cards › check 1",
      runsFailed: 2,
      category: "api-server-error",
    });
    expect(report.flaky[0]).toMatchObject({
      title: "Cards › check 2",
      runsFlaky: 1,
    });
    expect(report.groups[0]).toMatchObject({ count: 2, tests: 1 });
    expect(report.rows).toHaveLength(3);
  });
});

test.describe("Downloads", () => {
  // A cell starting with = or + is made inert; commas are quoted.
  test("a CSV cell cannot become a spreadsheet formula", () => {
    expected(
      "=HYPERLINK and +1 get a leading quote; 'a, b' is quoted; 'plain' is unchanged",
    );
    expect(csvCell('=HYPERLINK("http://x")')).toBe(
      '"\'=HYPERLINK(""http://x"")"',
    );
    expect(csvCell("+1")).toBe("'+1");
    expect(csvCell("a, b")).toBe('"a, b"');
    expect(csvCell("plain")).toBe("plain");
  });

  // Markup a test printed is escaped in the HTML report, which has no script;
  // the CSV starts with its header.
  test("the HTML report escapes what tests printed and carries no script", () => {
    expected(
      "no <script> and no raw <img> in the HTML; the script shown escaped; the CSV header first",
    );
    // A report with a failure whose title and message are markup.
    const report = buildReport({
      runs: [
        {
          id: 1,
          runNumber: 1,
          status: "completed",
          outcome: "failed",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          displayTitle: "group-app · requested by maya",
        },
      ],
      resultsById: new Map([
        [
          "1",
          {
            available: true,
            passed: 1,
            failed: 1,
            flaky: 0,
            skipped: 0,
            failures: [
              {
                title: "<img src=x onerror=alert(1)>",
                file: "a.spec.ts",
                line: 1,
                message: "<script>alert(1)</script>",
              },
            ],
            flakyTests: [],
          },
        ],
      ]),
      filters: { window: "14d", flow: "", actor: "", outcome: "" },
      now: Date.now(),
    });
    const html = toHtml(report);
    fact("html chars", html.length);

    expect(html).not.toContain("<script");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(toCsv(report).split("\r\n")[0]).toBe(
      "﻿run,date,flow,started_by,test,file,line,status,category,message",
    );
  });
});

test.describe("Knowledge base", () => {
  // The runner's notes file is exactly what the builder makes from practice.js.
  test("test-runner/src/knowledge-base.json matches practice.js", () => {
    expected(
      "the file equals what the builder makes (else: run npm run knowledge:build)",
    );
    expect(
      fs.readFileSync(OUTPUT, "utf8") === serialize(build()),
      "practice.js or a planted-bug spec changed. Run npm run knowledge:build.",
    ).toBe(true);
  });
});
