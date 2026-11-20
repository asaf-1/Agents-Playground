// Reads the bank's test files and the runner's suites.
import { readFileSync, readdirSync } from "node:fs";
// Playwright's test tools, with the [RESULT] block printed after every test.
import {
  expect,
  expected,
  fact,
  test,
} from "../../../framework/fixtures/resultBlock";
// The runner's rule for which files a suite's filter picks, and its catalog.
import {
  buildArgv,
  findFlow,
  readCatalog,
  specFilterPicks,
} from "../../../scripts/test-runner/catalog.js";

// The guard on the test runner's suites (scripts/test-runner/flow-groups.json):
// one suite per test type, the way a QA team's catalogue reads (Asaf,
// 2026-11-20), each under one of the runner's four headings. The bank's tests
// split three ways (API, End-to-End, Seeded Defect) by their file names, so a
// new test file must land in exactly one of them, or the suite that should
// run it would quietly miss it.

// The suites as the file writes them.
type Group = {
  id: string;
  name: string;
  label: string;
  category?: string;
  specs?: string[];
};
const GROUPS: Group[] = JSON.parse(
  readFileSync("scripts/test-runner/flow-groups.json", "utf8"),
).groups;

// The headings the runner shows (test-runner/public/app.js SUITE_CATEGORIES).
const CATEGORIES = ["functional", "non-functional", "performance", "agents"];

// Whether a suite's spec filters pick this file, by the runner's own rule.
function picks(group: Group, file: string): boolean {
  return (group.specs || []).some((filter) => specFilterPicks(filter, file));
}

// A function's text without its comments and spaces, to compare two copies.
function bodyOf(source: string, name: string): string {
  const start = source.indexOf(`function ${name}(`);
  const end = source.indexOf("\n}\n", start);
  return source
    .slice(start, end)
    .replace(/\/\/.*$/gm, "")
    .replace(/\s+/g, "");
}

test.describe("Test runner suites (guard)", () => {
  // Every suite sits under a heading, with a name and a label no other has.
  test("every suite has a heading, and no two share a name or a label", async () => {
    expected(
      "each suite's category is functional, non-functional, performance or agents; names and labels unique",
    );
    fact("suites", GROUPS.length);
    await test.step("a heading each", () => {
      for (const group of GROUPS) {
        expect(
          CATEGORIES,
          `${group.id} is under one of the runner's headings`,
        ).toContain(group.category);
      }
    });
    await test.step("unique names and labels", () => {
      const names = GROUPS.map((group) => group.name);
      const labels = GROUPS.map((group) => group.label);
      expect(new Set(names).size, "no two suites share a name").toBe(
        names.length,
      );
      expect(new Set(labels).size, "no two suites share a label").toBe(
        labels.length,
      );
    });
  });

  // The bank's test files split three ways, with none left out and none
  // counted twice.
  test("each bank test file belongs to exactly one of API, End-to-End and Seeded Defect", async () => {
    expected(
      "every tests/e2e/app spec is picked by exactly one of group-api, group-e2e and group-seeded-defects",
    );
    const three = ["group-api", "group-e2e", "group-seeded-defects"].map((id) =>
      GROUPS.find((group) => group.id === id)!,
    );
    const files = readdirSync("tests/e2e/app")
      .filter((file) => file.endsWith(".spec.ts"))
      .map((file) => `tests/e2e/app/${file}`);
    fact("bank test files", files.length);
    for (const file of files) {
      const owners = three.filter((group) => picks(group, file));
      expect(
        owners.map((group) => group.id),
        `${file} belongs to exactly one bank suite`,
      ).toHaveLength(1);
    }
  });

  // The counts the runner shows are the tests the suite runs: the three bank
  // suites' counts add up to every bank test, the contract tests included,
  // so a filter that picks nothing (an E2E suite of 0 tests, 2026-11-20)
  // can't pass unseen.
  test("the API, End-to-End and Seeded Defect counts add up to every bank test", async () => {
    expected(
      "each of the three counts above 0; together they equal the tests in tests/e2e/app and tests/e2e/contracts",
    );
    const flows = readCatalog().flows;
    const count = (id: string) =>
      flows.find((flow: { id: string }) => flow.id === id).testCount as number;
    const bankTests = flows
      .filter(
        (flow: { kind: string; path: string }) =>
          flow.kind === "spec" &&
          (flow.path.startsWith("tests/e2e/app/") ||
            flow.path.startsWith("tests/e2e/contracts/")),
      )
      .reduce(
        (total: number, flow: { testCount: number }) => total + flow.testCount,
        0,
      );
    const api = count("group-api");
    const e2e = count("group-e2e");
    const seeded = count("group-seeded-defects");
    fact(
      "api / e2e / seeded / all",
      `${api} / ${e2e} / ${seeded} / ${bankTests}`,
    );
    for (const [name, value] of [
      ["API", api],
      ["End-to-End", e2e],
      ["Seeded Defect", seeded],
    ] as const) {
      expect(value, `the ${name} suite runs some tests`).toBeGreaterThan(0);
    }
    expect(api + e2e + seeded, "together they are every bank test").toBe(
      bankTests,
    );
  });

  // The runner app ships on its own, so its stub keeps a copy of the rule:
  // the two must stay the same.
  test("the runner app's copy of the filter rule matches the catalog's", () => {
    expected(
      "specFilterPicks in test-runner/src/github-stub.js is the same code as in scripts/test-runner/catalog.js",
    );
    const original = bodyOf(
      readFileSync("scripts/test-runner/catalog.js", "utf8"),
      "specFilterPicks",
    );
    const copy = bodyOf(
      readFileSync("test-runner/src/github-stub.js", "utf8"),
      "specFilterPicks",
    );
    expect(original.length, "the rule is found").toBeGreaterThan(50);
    expect(copy, "the stub's copy is the same code").toBe(original);
  });

  // A run on GitHub prints each test's [RESULT] block in its log, which the
  // runner app's console shows: "blob" alone prints nothing per test (Asaf,
  // 2026-11-20: "can u make the result blocks there too?").
  test("a Playwright suite run on GitHub prints each test's [RESULT] block in its log", () => {
    expected(
      "group-smoke's command ends --reporter=blob,list (the merged report's file, and each test's line and block in the log); a run asked for 'list' keeps list",
    );
    const flow = findFlow(readCatalog(), "group-smoke");
    const onGithub = buildArgv(flow, {});
    fact("command", onGithub.join(" "));
    expect(
      onGithub,
      "the report file and the log's per-test lines with their blocks",
    ).toContain("--reporter=blob,list");
    expect(
      buildArgv(flow, { reporter: "list" }),
      "a run asked for the list reporter keeps it",
    ).toContain("--reporter=list");
  });
});
