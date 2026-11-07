// Every spec must take `test` from the [RESULT] block, or it prints no block
// and nobody notices; this file checks that, and the block's own layout. The
// block is framework/fixtures/resultBlock.ts (appTest.ts adds the page
// objects). Offline: it reads files and calls pure functions.

// Node's file and path tools.
import fs from "node:fs";
import path from "node:path";
// The [RESULT] block's test tools, and its formatter and path cleaner.
import {
  expect,
  expected,
  fact,
  formatResultBlock,
  pathOf,
  test,
} from "../../../framework/fixtures/resultBlock";

// The repository root, three folders up from this file.
const ROOT = path.resolve(__dirname, "..", "..", "..");

// Every file under a folder, at any depth, as a path from the repository root.
function filesUnder(dir: string): string[] {
  return fs
    .readdirSync(path.join(ROOT, dir), { withFileTypes: true })
    .flatMap((entry) => {
      const rel = `${dir}/${entry.name}`;
      return entry.isDirectory() ? filesUnder(rel) : [rel];
    });
}

// The module each `import { ... test ... }` line in a file takes `test` from.
function testImports(source: string): string[] {
  const found: string[] = [];
  for (const match of source.matchAll(
    /import\s*\{([^}]*)\}\s*from\s*["']([^"']+)["']/g,
  )) {
    const names = match[1].split(",").map((name) => name.trim());
    if (names.some((name) => /^test(\s+as\s+\w+)?$/.test(name))) {
      found.push(match[2]);
    }
  }
  return found;
}

test.describe("The [RESULT] block guard", () => {
  // Every spec and setup file takes `test` from the result block (directly
  // or through appTest), never from @playwright/test or baseTest.
  test("every Playwright test file takes test from the result block", () => {
    expected(
      "every .spec.ts and .setup.ts under tests/ imports test from framework/fixtures/resultBlock or appTest",
    );
    const files = ["tests/e2e", "tests/runner", "tests/visual"]
      .flatMap(filesUnder)
      .filter((file) => /\.(spec|setup)\.ts$/.test(file));
    fact("files", files.length);
    // A file that takes `test` from anywhere else, with where from.
    const wrong = files.flatMap((file) => {
      const modules = testImports(
        fs.readFileSync(path.join(ROOT, file), "utf8"),
      );
      const ok = modules.some((m) =>
        /framework\/fixtures\/(resultBlock|appTest)$/.test(m),
      );
      return ok ? [] : [`${file}: ${modules.join(", ") || "no test import"}`];
    });
    fact("wrong", wrong);
    expect(files.length).toBeGreaterThan(70);
    expect(wrong, wrong.join("\n")).toEqual([]);
  });

  // tests/ holds only tests: the shared code lives in framework/.
  test("tests/ holds only test files", () => {
    expected("every .ts file under tests/ is a .spec.ts or a .setup.ts");
    const others = filesUnder("tests").filter(
      (file) => file.endsWith(".ts") && !/\.(spec|setup)\.ts$/.test(file),
    );
    fact("others", others);
    expect(others, others.join("\n")).toEqual([]);
  });

  // The unit tests print the same block: their setup starts and prints it,
  // and the verbose reporter shows it.
  test("the unit tests' setup prints the block", () => {
    expected(
      "vitest.config.ts loads web/test/setup.ts with the verbose reporter; setup.ts starts and prints the block",
    );
    const config = fs.readFileSync(path.join(ROOT, "vitest.config.ts"), "utf8");
    const setup = fs.readFileSync(path.join(ROOT, "web/test/setup.ts"), "utf8");
    expect(config).toContain('setupFiles: ["./web/test/setup.ts"]');
    expect(config).toContain('reporters: ["verbose"]');
    expect(setup).toContain("startResultBlock()");
    expect(setup).toContain("printResultBlock(task)");
  });

  // The value of a query parameter whose name looks secret is never printed.
  test("a secret-looking query value is never printed", () => {
    expected(
      "token, key, password, session and code values print as ***; page and q print as they are",
    );
    const shown = pathOf(
      "http://127.0.0.1:4173/api/x?token=abc&key=k1&password=p&session=s&code=c&page=2&q=cards",
    );
    fact("shown", shown);
    expect(shown).toBe(
      "/api/x?token=***&key=***&password=***&session=***&code=***&page=2&q=cards",
    );
  });

  // The block keeps the Wix layout: the [RESULT] top line, labels lined up,
  // calls numbered, a known bug marked, and a 42-character bottom line.
  test("the block has the Wix layout", () => {
    expected(
      "top '==== [RESULT] ====', aligned test/spec/status/expected rows, 2 numbered calls, a fact, a page, a 42-character bottom",
    );
    // A hand-made test that passed, with two calls, a fact and a page.
    const block = formatResultBlock(
      {
        title: "a made-up test",
        file: path.join(process.cwd(), "tests", "e2e", "x.spec.ts"),
        line: 7,
        status: "passed",
        expectedStatus: "passed",
        retry: 0,
        annotations: [],
        errors: [],
      },
      {
        expected: "201 then 200",
        calls: [
          { method: "POST", path: "/api/a", http: "201" },
          { method: "GET", path: "/api/a/1", http: "200" },
        ],
        facts: ["id        : 1"],
        page: "/app",
      },
    );
    fact("lines", block.split("\n").length);
    expect(block.split("\n")).toEqual([
      "",
      "================ [RESULT] ================",
      "  test      : a made-up test",
      "  spec      : tests/e2e/x.spec.ts:7",
      "  status    : PASSED",
      "  expected  : 201 then 200",
      "  calls     : 2",
      "     1. POST /api/a -> 201",
      "     2. GET /api/a/1 -> 200",
      "  id        : 1",
      "  page      : /app",
      "==========================================",
      "",
    ]);
  });
});
