// The [RESULT] block for the Vitest unit tests: the same layout as the
// Playwright one in framework/fixtures/resultBlock.ts. That file can't be used
// here, because it builds on Playwright's test runner.
//
// setup.ts starts a record before each test, adds every API call MSW answers,
// and prints the block after each test. A test fills in `expected()` and
// `fact()` like a Playwright test does. Nothing secret is printed: no headers,
// no bodies.

// One API call MSW answered, ready to print.
type Call = { method: string; path: string; http: number };

// What the running test has recorded so far. Null between tests.
type TestRecord = { expected: string; calls: Call[]; facts: string[] };
let current: TestRecord | null = null;

// The test says what it checks, in a few words. It is printed as "expected".
export function expected(text: string): void {
  if (current) current.expected = text;
}

// The test adds a value it used or checked. A list prints one item per line.
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

// Before each test: an empty record.
export function startResultBlock(): void {
  current = { expected: "-", calls: [], facts: [] };
}

// Each request MSW answers: its method, its path and the status it was given.
export function recordCall(method: string, url: string, http: number): void {
  if (!current) return;
  let path = url;
  try {
    const parsed = new URL(url, "http://local");
    path = parsed.pathname + parsed.search;
  } catch {
    // Not a URL: print it as it is.
  }
  current.calls.push({ method, path, http });
}

// The parts of Vitest's test the block reads.
type TaskInfo = {
  name: string;
  file?: { name: string };
  result?: { errors?: { message?: string }[] };
};

// After each test: print the block, then forget the record.
export function printResultBlock(task: TaskInfo): void {
  const rec = current ?? { expected: "-", calls: [], facts: [] };
  // A test with errors failed; afterEach runs before Vitest marks the result.
  const errors = task.result?.errors ?? [];
  const lines = [
    row("test", task.name),
    row("spec", task.file?.name ?? "-"),
    row("status", errors.length ? "FAILED" : "PASSED"),
    row("expected", rec.expected),
  ];
  // The first line of the first error, when there is one.
  const message = errors[0]?.message?.split("\n").find((l) => l.trim());
  if (message) lines.push(row("error", shorten(message, 160)));
  // The calls: "request: -" when there were none, as in the Playwright block.
  if (rec.calls.length === 0) lines.push(row("request", "-"));
  else {
    lines.push(row("calls", rec.calls.length));
    rec.calls.forEach((call, i) =>
      lines.push(
        `  ${String(i + 1).padStart(2)}. ${call.method} ${call.path} -> ${call.http}`,
      ),
    );
  }
  lines.push(...rec.facts);
  // The same 42-character lines as the Playwright block.
  const top = `${"=".repeat(16)} [RESULT] ${"=".repeat(16)}`;
  console.log(
    ["", top, ...lines.map((line) => `  ${line}`), "=".repeat(42), ""].join(
      "\n",
    ),
  );
  current = null;
}

// A value as one short line: "-" for nothing, JSON for an object.
function text(value: unknown): string {
  if (value === undefined || value === null || value === "") return "-";
  if (typeof value === "string")
    return shorten(value.replace(/\s*\n\s*/g, " "), 160);
  if (typeof value === "object") return shorten(JSON.stringify(value), 160);
  return String(value);
}

// "label     : value", with the labels lined up.
function row(label: string, value: unknown): string {
  return `${label.padEnd(10)}: ${value}`.trimEnd();
}

// Cuts a long value and adds "...".
function shorten(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}...` : value;
}
