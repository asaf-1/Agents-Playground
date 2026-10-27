import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { classify } from "../../test-runner/src/triage.js";
import { similarProblems } from "../../test-runner/src/knowledge.js";
import {
  buildReport,
  csvCell,
  parseRunTitle,
  signatureOf,
  toCsv,
  toHtml,
} from "../../test-runner/src/reports.js";
import {
  build,
  serialize,
  OUTPUT,
} from "../../scripts/test-runner/build-knowledge.js";

// The Triage tab's logic, without a browser or a server: how a failure is
// categorised, what the "similar known problems" search finds, how errors are
// grouped, and that the downloads cannot be turned against the person who
// opens them. Fast enough to run on every `npm run test:runner`.

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

  for (const [message, category] of CASES) {
    test(`${category}: ${message.split("\n")[0].slice(0, 50) || "(empty)"}`, () => {
      expect(classify(message)).toBe(category);
    });
  }
});

// The retrieval eval. Every planted-bug spec titles its tests
// "<flag>: <what goes wrong>". Take the sentence, drop the flag (which would
// make the search trivial), search with it and the file name, and check the
// right bug's note comes back. hit@1 is "first", hit@3 is "in the top three".
function evalCases() {
  const { BUGS } = require(path.join(ROOT, "practice.js"));
  const flags = new Set(BUGS.map((bug: { flag: string }) => bug.flag));
  const cases: { flag: string; title: string; file: string }[] = [];
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
  test("finds the planted bug a failing test belongs to", () => {
    const cases = evalCases();
    let hit1 = 0;
    let hit3 = 0;
    const misses: string[] = [];

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

  test("a generic failure lands on its kind of problem", () => {
    const hits = similarProblems({
      title: "Cards › check 2",
      file: "tests/e2e/app/react-bank-cards.spec.ts",
      message:
        "locator.click: Timeout 5000ms exceeded.\nCall log:\n  - waiting for getByTestId('card-freeze')",
    });

    expect(hits[0].id).toBe("category:ui-missing-locator");
  });

  test("returns nothing rather than noise for words no note has", () => {
    expect(similarProblems({ title: "zzqx", file: "", message: "" })).toEqual(
      [],
    );
  });
});

test.describe("Report building", () => {
  test("reads the flow and the person from the run title", () => {
    expect(parseRunTitle("group-app · requested by maya")).toEqual({
      flowId: "group-app",
      requester: "maya",
    });
    expect(parseRunTitle("Some title from GitHub's own form")).toEqual({
      flowId: "",
      requester: "",
    });
  });

  test("groups the same error worded with different numbers, not different statuses", () => {
    const a = signatureOf("Expected: 3\nReceived: 0\n    at a.spec.ts:10:5");
    const b = signatureOf("Expected: 5\nReceived: 0\n    at b.spec.ts:99:5");
    expect(a).toBe(b);

    expect(signatureOf("Expected: 200\nReceived: 500")).not.toBe(
      signatureOf("Expected: 403\nReceived: 200"),
    );
  });

  test("counts, ranks and keeps pipeline problems out of the test figures", () => {
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
  test("a CSV cell cannot become a spreadsheet formula", () => {
    expect(csvCell('=HYPERLINK("http://x")')).toBe(
      '"\'=HYPERLINK(""http://x"")"',
    );
    expect(csvCell("+1")).toBe("'+1");
    expect(csvCell("a, b")).toBe('"a, b"');
    expect(csvCell("plain")).toBe("plain");
  });

  test("the HTML report escapes what tests printed and carries no script", () => {
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

    expect(html).not.toContain("<script");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(toCsv(report).split("\r\n")[0]).toBe(
      "﻿run,date,flow,started_by,test,file,line,status,category,message",
    );
  });
});

test.describe("Knowledge base", () => {
  test("test-runner/src/knowledge-base.json matches practice.js", () => {
    expect(
      fs.readFileSync(OUTPUT, "utf8") === serialize(build()),
      "practice.js or a planted-bug spec changed. Run npm run knowledge:build.",
    ).toBe(true);
  });
});
