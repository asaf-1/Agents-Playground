// Playwright's test tools, and the types for a request context, an API answer, a
// page and "info about the running test".
import {
  test as base,
  expect,
  type APIRequestContext,
  type APIResponse,
  type Page,
  type TestInfo,
} from "@playwright/test";
// For turning a test's full file path into a short one, like tests/e2e/app/x.spec.ts.
import { relative } from "node:path";

// Every test prints one [RESULT] block when it ends, passed or failed: the test,
// its status, what it expected, each API call it made and the status that came
// back, the values it checked, and the page it ended on.
//
// It uses only values the test already has: no extra calls, no extra page reads.
// It never prints headers, cookies or request bodies, and it hides the value of
// any query parameter whose name looks secret (token, key, password...).
//
// The layout follows the Wix project's resultBlock.ts. What goes in it follows
// the Verteil rule: every ID, amount and status the test touched, one per line,
// so a failure can be traced from the report alone.

// One API call, ready to print.
type Call = { method: string; path: string; http: string };

// What the running test has recorded so far.
type TestRecord = {
  expected: string;
  calls: Call[];
  facts: string[];
  page?: string;
};

// Each worker runs one test at a time, so one record per worker is enough. It is
// null between tests, so a call made outside a test (in beforeAll, for example)
// is not counted against the next test.
let current: TestRecord | null = null;

// The test says what it checks, in a few words. It is printed as "expected".
export function expected(text: string): void {
  if (current) current.expected = text;
}

// The test adds a value it used or checked, like an account ID or an amount.
// A list prints one item per line.
export function fact(label: string, value: unknown): void {
  if (!current) return;
  if (Array.isArray(value)) {
    current.facts.push(
      row(label, value.length ? "" : "-"),
      ...value.map((item) => `  ${text(item)}`),
    );
    return;
  }
  current.facts.push(row(label, text(value)));
}

// The methods a test uses to call the API. Playwright sends each one through its
// own fetch, so wrapping these six records every call.
const METHODS = ["get", "post", "put", "patch", "delete", "head"] as const;
// Marks the class once it is wrapped, so it is never wrapped twice.
const WRAPPED = Symbol.for("agents-playground.result-block.wrapped");

// The `request` fixture, page.request, context.request and every
// playwright.request.newContext() are the same Playwright class. Wrapping its
// methods once records the calls made through any of them.
function recordCallsOn(proto: Record<string | symbol, unknown>): void {
  if (proto[WRAPPED]) return;
  proto[WRAPPED] = true;
  for (const method of METHODS) {
    // The method as Playwright wrote it.
    const original = proto[method] as (
      this: APIRequestContext,
      url: string,
      options?: unknown,
    ) => Promise<APIResponse>;
    // The same method, plus one line in the record once the answer is back.
    proto[method] = async function (
      this: APIRequestContext,
      url: string,
      options?: unknown,
    ) {
      try {
        const response = await original.call(this, url, options);
        record(method, response.url(), String(response.status()));
        return response;
      } catch (error) {
        // A call that got no answer (a timeout, a server that went away) is
        // recorded too, then the error goes on to the test as before.
        record(method, url, "no answer");
        throw error;
      }
    };
  }
}

// Adds one call to the running test's record.
function record(method: string, url: string, http: string): void {
  if (!current) return;
  current.calls.push({ method: method.toUpperCase(), path: pathOf(url), http });
}

// Query parameter names whose values are never printed.
const SECRET_PARAM =
  /token|secret|password|passwd|key|auth|session|cookie|code/i;

// The path and query of a URL, without the host. Secret-looking values become
// ***, and long values are cut short so one call stays on one line.
export function pathOf(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url, "http://local");
  } catch {
    return shorten(url, 100);
  }
  const query = [...parsed.searchParams]
    .map(
      ([key, value]) =>
        `${key}=${SECRET_PARAM.test(key) ? "***" : shorten(value, 30)}`,
    )
    .join("&");
  return shorten(parsed.pathname + (query ? `?${query}` : ""), 120);
}

// The same test tools as @playwright/test, plus the [RESULT] block. A spec that
// imports `test` from here prints its blocks with no other change.
export const test = base.extend<
  { resultBlock: void },
  { recordApiCalls: void }
>({
  // Once per worker: find the class every request context shares, and wrap it.
  recordApiCalls: [
    async ({ playwright }, use) => {
      const probe = await playwright.request.newContext();
      recordCallsOn(Object.getPrototypeOf(probe));
      await probe.dispose();
      await use();
    },
    { scope: "worker", auto: true },
  ],
  // The page, exactly as Playwright makes it. When the test is done, remember
  // the address it ended on. Only tests that use a page get a "page" line.
  page: async ({ page }, use) => {
    await use(page);
    if (current) current.page = pageUrl(page);
  },
  // Around every test: start an empty record, run the test, print the block.
  resultBlock: [
    async ({}, use, testInfo) => {
      current = { expected: "-", calls: [], facts: [] };
      await use();
      console.log(formatResultBlock(testInfo, current));
      current = null;
    },
    { auto: true },
  ],
});

// Specs take expect from here too, so one import line brings both.
export { expect };

// The parts of TestInfo the block reads. A plain shape, so the guard test can
// build one by hand.
type BlockInfo = Pick<
  TestInfo,
  | "title"
  | "file"
  | "line"
  | "status"
  | "expectedStatus"
  | "retry"
  | "annotations"
  | "errors"
>;

// The whole block as one string. One console.log keeps it in one piece, even
// when several workers print at once.
export function formatResultBlock(info: BlockInfo, rec: TestRecord): string {
  const lines = [
    row("test", info.title),
    row("spec", `${shortPath(info.file)}:${info.line}`),
    row("status", statusText(info)),
  ];
  // A retry in CI says which attempt this block belongs to.
  if (info.retry > 0) lines.push(row("retry", info.retry));
  lines.push(row("expected", rec.expected));
  // A failed test gets the first line of its error, so the block says why.
  const error = firstErrorLine(info);
  if (error) lines.push(row("error", error));
  lines.push(...callLines(rec.calls, rec.page));
  // The values the test added, then the page it ended on.
  lines.push(...rec.facts);
  if (rec.page !== undefined) lines.push(row("page", rec.page));
  // A 42-character line on top with [RESULT] in the middle, and a plain one at
  // the bottom. Blank lines above and below make the block stand out.
  const top = `${"=".repeat(16)} [RESULT] ${"=".repeat(16)}`;
  const bottom = "=".repeat(42);
  return ["", top, ...lines.map((line) => `  ${line}`), bottom, ""].join("\n");
}

// PASSED, FAILED, TIMEDOUT, SKIPPED or INTERRUPTED. A skipped test says why. A
// test marked test.fail says the failure is expected.
function statusText(info: BlockInfo): string {
  const status = (info.status ?? "unknown").toUpperCase();
  if (info.status === "skipped") {
    const reason = info.annotations.find(
      (a) => a.type === "skip" || a.type === "fixme",
    )?.description;
    return reason ? `${status} (${oneLine(reason)})` : status;
  }
  if (info.expectedStatus !== "failed") return status;
  return `${status} (${info.status === "failed" ? "expected" : "expected to fail"})`;
}

// The first line of the test's first error, without terminal colours.
function firstErrorLine(info: BlockInfo): string {
  const message = info.errors[0]?.message;
  if (!message) return "";
  const plain = message.replace(/\u001b\[[0-9;]*m/g, "");
  return shorten(plain.split("\n").find((l) => l.trim()) ?? "", 160);
}

// The calls: one call reads as "request" and "http", several as a numbered list.
// A test with no calls and no page shows "request: -", like the Wix block.
function callLines(calls: Call[], page?: string): string[] {
  if (calls.length === 0)
    return page === undefined ? [row("request", "-")] : [];
  if (calls.length === 1) {
    return [
      row("request", `${calls[0].method} ${calls[0].path}`),
      row("http", calls[0].http),
    ];
  }
  // Up to 50 calls, one per line; a longer test says how many more there were.
  const shown = calls.slice(0, 50).map((call, i) => {
    return `  ${String(i + 1).padStart(2)}. ${call.method} ${call.path} -> ${call.http}`;
  });
  const more = calls.length > 50 ? [`  + ${calls.length - 50} more`] : [];
  return [row("calls", calls.length), ...shown, ...more];
}

// The address the page ended on, or "-" when the page was closed or never used.
function pageUrl(page: Page): string {
  try {
    const url = page.url();
    return url && url !== "about:blank" ? pathOf(url) : "-";
  } catch {
    return "-";
  }
}

// A value as one short line: "-" for nothing, JSON for an object.
function text(value: unknown): string {
  if (value === undefined || value === null || value === "") return "-";
  if (typeof value === "string") return shorten(oneLine(value), 160);
  if (typeof value === "object") return shorten(JSON.stringify(value), 160);
  return String(value);
}

// The test's file, relative to the repository, with forward slashes.
function shortPath(file: string): string {
  return relative(process.cwd(), file).replace(/\\/g, "/");
}

// "label     : value", with the labels lined up.
function row(label: string, value: unknown): string {
  return `${label.padEnd(10)}: ${value}`.trimEnd();
}

// Line breaks become spaces, so a value never breaks the block's layout.
function oneLine(value: string): string {
  return value.replace(/\s*\n\s*/g, " ");
}

// Cuts a long value and adds "...".
function shorten(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}...` : value;
}
