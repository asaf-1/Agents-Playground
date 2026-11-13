// Playground Bank's tracing (bank/tracing.js), proved without Docker: the spec
// starts its own server.js with tracing on, sends its spans to a pretend trace
// viewer inside the test, and checks what arrives. Four tests check the bank's
// pure pieces directly, and the last four the tests' side: each test's trace
// and header (framework/helpers/testTrace.ts) and the reporter that sends its
// steps, with their names made safe (framework/reporting/otelReporter.ts). Run with `npm run test:tracing`;
// the normal suite and CI never run it (playwright.tracing.config.ts says why).

// Node's process, network, path and random tools.
import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import net from "node:net";
import path from "node:path";
// The [RESULT] block's test tools.
import {
  expect,
  expected,
  fact,
  test,
} from "../../framework/fixtures/resultBlock";
// The pretend trace viewer, and OTLP's numbers for span kinds and an error.
import {
  SPAN_KIND,
  STATUS_ERROR,
  startOtlpReceiver,
  type OtlpReceiver,
} from "../../framework/helpers/otlpReceiver";
// The tracing module's pure pieces, checked directly at the end.
import {
  errorLabel,
  isEnabled,
  recordStatus,
  routeOf,
  traceRequest,
  wrapDatabase,
} from "../../bank/tracing.js";
// The tests' side: a trace per test, and the reporter, with its types.
import type { TestCase, TestResult } from "@playwright/test/reporter";
import {
  newTestTrace,
  rootSpanIdOf,
  traceIdFromUrl,
  withTraceparent,
} from "../../framework/helpers/testTrace";
import OtelReporter, {
  TEST_SERVICE,
  safeTitle,
} from "../../framework/reporting/otelReporter";

// The repository root, two folders up from this file.
const ROOT = path.resolve(__dirname, "..", "..");

// The traced server, its address, its output (shown if it fails to start), and
// the pretend viewer it sends to. Shared by every test (one worker).
let server: ChildProcess;
let base = "";
let receiver: OtlpReceiver;
const serverOutput: string[] = [];

// A free port on 127.0.0.1: open one, read its number, close it.
async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address() as net.AddressInfo;
      probe.close(() => resolve(port));
    });
  });
}

// A new W3C traceparent, as a caller (later, the test fixture) would send it:
// version 00, a 32-character trace id, the caller's 16-character span id, and
// 01 for "recorded".
function newTraceparent() {
  const traceId = randomBytes(16).toString("hex");
  const spanId = randomBytes(8).toString("hex");
  return { traceId, spanId, header: `00-${traceId}-${spanId}-01` };
}

// Before the tests: the pretend viewer, then server.js with tracing on and
// pointed at it. PGlite and the demo data take a while, hence the long wait.
test.beforeAll(async () => {
  test.setTimeout(120_000);
  receiver = await startOtlpReceiver();
  const port = await freePort();
  base = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ["server.js", String(port)], {
    cwd: ROOT,
    env: {
      ...process.env,
      HOST: "127.0.0.1",
      // Always PGlite in memory, never a real database.
      DATABASE_URL: "",
      // Tracing on, into the pretend viewer, sent every 100 ms.
      OTEL_EXPORTER_OTLP_ENDPOINT: receiver.url,
      OTEL_BSP_SCHEDULE_DELAY: "100",
      OTEL_SERVICE_NAME: "",
      OTEL_SDK_DISABLED: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  // Keep the server's output, to show it if the start fails.
  server.stdout?.on("data", (chunk) => serverOutput.push(String(chunk)));
  server.stderr?.on("data", (chunk) => serverOutput.push(String(chunk)));

  // Ready when /api/bank/status answers 200; a server that exits first fails.
  const deadline = Date.now() + 110_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) break;
    const ok = await fetch(`${base}/api/bank/status`)
      .then((answer) => answer.ok)
      .catch(() => false);
    if (ok) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`The traced server did not start:\n${serverOutput.join("")}`);
});

// After the tests: stop the server and the pretend viewer.
test.afterAll(async () => {
  server?.kill();
  await receiver?.close();
});

test.describe("Playground Bank tracing", () => {
  // A caller's traceparent: the bank's span joins that trace, as a child of
  // the caller's span, and carries the request id the answer carries.
  test("keeps the trace the caller sends", async ({ request }) => {
    expected(
      "the bank's span joins the caller's trace under the caller's span, named by its route, with the request id",
    );
    const { traceId, spanId, header } = newTraceparent();
    const answer = await request.get(`${base}/api/bank/shop/products`, {
      headers: { traceparent: header },
    });
    const requestId = answer.headers()["x-request-id"];
    const span = await receiver.waitFor(
      (s) => s.traceId === traceId && s.kind === SPAN_KIND.server,
    );
    fact("trace id", traceId);
    fact("caller span", spanId);
    fact("bank span", `${span.name} (${span.spanId})`);
    fact("request id", requestId);

    expect(answer.status()).toBe(200);
    expect(span.parentSpanId).toBe(spanId);
    expect(span.name).toBe("GET /api/bank/shop/products");
    expect(span.service).toBe("playground-bank");
    expect(span.attributes["http.response.status_code"]).toBe(200);
    expect(span.attributes["bank.request_id"]).toBe(requestId);
    expect(span.statusCode).not.toBe(STATUS_ERROR);
  });

  // The product lookup's query is a span inside the request's span, and inside
  // its time too. Its text keeps the $1 placeholder; the sku sent with it
  // appears in no query span.
  test("puts each query under its request, without the values", async ({
    request,
  }) => {
    expected(
      "SELECT bank_shop_products is a client span under the request span and within its time; its text has $1 and no query span holds the sku",
    );
    const sku = `trace-probe-${randomBytes(4).toString("hex")}`;
    const { traceId, header } = newTraceparent();
    const answer = await request.get(`${base}/api/bank/shop/products/${sku}`, {
      headers: { traceparent: header },
    });
    // The request span ends last, so once it is in, its queries are in too.
    const requestSpan = await receiver.waitFor(
      (s) => s.traceId === traceId && s.kind === SPAN_KIND.server,
    );
    const queries = receiver.spans.filter(
      (s) => s.traceId === traceId && s.kind === SPAN_KIND.client,
    );
    const lookup = queries.find((s) => s.name === "SELECT bank_shop_products");
    fact("sku sent", sku);
    fact("http", answer.status());
    fact("request span", `${requestSpan.name} (${requestSpan.spanId})`);
    fact(
      "queries",
      queries.map((s) => `${s.name}: ${s.attributes["db.query.text"]}`),
    );

    expect(lookup, "the product lookup's query span").toBeDefined();
    expect(lookup!.parentSpanId).toBe(requestSpan.spanId);
    expect(lookup!.attributes["db.system.name"]).toBe("postgresql");
    expect(lookup!.attributes["bank.database"]).toBe("pglite");
    expect(String(lookup!.attributes["db.query.text"])).toContain("$1");
    expect(JSON.stringify(queries.map((s) => s.attributes))).not.toContain(sku);
    // Every query starts and ends within its request. Before the bank gave
    // spans exact times, starts were rounded to whole milliseconds and a query
    // could seem to end after its own request.
    const outside = queries
      .filter((s) => s.start < requestSpan.start || s.end > requestSpan.end)
      .map((s) => s.name);
    fact("queries outside the request's time", outside);
    expect(outside).toEqual([]);
    // The sure sign of the old rounding: every start a whole millisecond. With
    // exact times, a start that lands exactly on one is a one-in-a-million.
    const wholeMs = [requestSpan, ...queries].filter(
      (s) => s.start % 1_000_000n === 0n,
    ).length;
    fact("starts on a whole millisecond", wholeMs);
    expect(wholeMs).toBe(0);
  });

  // A 4xx is the caller's mistake, so it shows as its status code but is not
  // marked as an error (OpenTelemetry's rule for a server span).
  test("records a 4xx without calling it an error", async ({ request }) => {
    expected(
      "GET /api/bank/me with no session answers 401; its span shows 401, with no error status",
    );
    const { traceId, header } = newTraceparent();
    const answer = await request.get(`${base}/api/bank/me`, {
      headers: { traceparent: header },
    });
    const span = await receiver.waitFor(
      (s) => s.traceId === traceId && s.kind === SPAN_KIND.server,
    );
    fact("trace id", traceId);
    fact("span", span.name);
    fact("span status code", span.statusCode);

    expect(answer.status()).toBe(401);
    expect(span.attributes["http.response.status_code"]).toBe(401);
    expect(span.statusCode).not.toBe(STATUS_ERROR);
    expect(span.attributes["error.type"]).toBeUndefined();
  });

  // A broken traceparent is ignored: the request still works and its span
  // starts a trace of its own. Found by the request id the test sends.
  test("starts a fresh trace when the traceparent is broken", async ({
    request,
  }) => {
    expected(
      "a malformed traceparent is ignored: 200, and the span has a new valid trace id and no parent",
    );
    const requestId = `trace-probe-${randomBytes(6).toString("hex")}`;
    const answer = await request.get(`${base}/api/bank/shop/products`, {
      headers: { traceparent: "00-not-a-trace-01", "X-Request-Id": requestId },
    });
    const span = await receiver.waitFor(
      (s) =>
        s.kind === SPAN_KIND.server &&
        s.attributes["bank.request_id"] === requestId,
    );
    fact("request id", requestId);
    fact("new trace id", span.traceId);

    expect(answer.status()).toBe(200);
    expect(span.traceId).toMatch(/^[0-9a-f]{32}$/);
    expect(span.traceId).not.toMatch(/^0+$/);
    expect(span.parentSpanId).toBe("");
  });

  // Off unless the endpoint is set. Off, the database comes back unchanged and
  // a request just runs (this test process never turned tracing on).
  test("is off unless the endpoint is set", async () => {
    expected(
      "on only with OTEL_EXPORTER_OTLP_ENDPOINT and without OTEL_SDK_DISABLED=true; off, nothing is wrapped",
    );
    const endpoint = "http://127.0.0.1:4318";
    const cases = {
      nothing: isEnabled({}),
      blank: isEnabled({ OTEL_EXPORTER_OTLP_ENDPOINT: "  " }),
      endpoint: isEnabled({ OTEL_EXPORTER_OTLP_ENDPOINT: endpoint }),
      disabled: isEnabled({
        OTEL_EXPORTER_OTLP_ENDPOINT: endpoint,
        OTEL_SDK_DISABLED: "true",
      }),
    };
    const db = { kind: "pglite" };
    const ran = await traceRequest({}, {}, new URL(base), async () => "ran");
    fact("cases", cases);
    fact("request with tracing off", ran);

    expect(cases).toEqual({
      nothing: false,
      blank: false,
      endpoint: true,
      disabled: false,
    });
    expect(wrapDatabase(db, null)).toBe(db);
    expect(ran).toBe("ran");
  });

  // Paths that differ only by an id share one span name, so the viewer groups
  // them; the area name and words stay.
  test("gives one name to routes that differ only by id", () => {
    expected(
      "a part with a digit after /api/bank/<area> becomes :id; the rest stays",
    );
    const routes = {
      "/api/bank/accounts/12/history": routeOf("/api/bank/accounts/12/history"),
      "/api/bank/shop/products/gear-001": routeOf(
        "/api/bank/shop/products/gear-001",
      ),
      "/api/bank/shop/products": routeOf("/api/bank/shop/products"),
      "/api/bank/v2": routeOf("/api/bank/v2"),
    };
    fact("routes", routes);

    expect(routes).toEqual({
      "/api/bank/accounts/12/history": "/api/bank/accounts/:id/history",
      "/api/bank/shop/products/gear-001": "/api/bank/shop/products/:id",
      "/api/bank/shop/products": "/api/bank/shop/products",
      "/api/bank/v2": "/api/bank/v2",
    });
  });

  // The database wrapper, with a pretend tracer that writes down each span it
  // is asked to open. A query keeps its text, exec doesn't, a transaction
  // holds its queries, a call outside a request gets none, and no span is ever
  // handed a value.
  test("wraps each query in a span that never gets the values", async () => {
    expected(
      "SELECT/INSERT/transaction/UPDATE spans in order; exec keeps no text; nothing outside a request; no value in any span",
    );
    type Opened = {
      name: string;
      kind: string;
      attributes: Record<string, unknown>;
    };
    const opened: Opened[] = [];
    let insideRequest = true;
    const pretendTracer = {
      inSpanNow: () => insideRequest,
      inSpan: async (
        name: string,
        options: { kind: string; attributes: Record<string, unknown> },
        work: (span: unknown) => Promise<unknown>,
      ) => {
        opened.push({
          name,
          kind: options.kind,
          attributes: { ...options.attributes },
        });
        return work({ set: () => {}, fail: () => {} });
      },
    };
    const runner = {
      query: async () => ({ rows: [] }),
      exec: async () => ({}),
    };
    const db = wrapDatabase(
      {
        kind: "pglite",
        ...runner,
        transaction: async (work: (tx: typeof runner) => Promise<unknown>) =>
          work(runner),
        close: async () => {},
      },
      pretendTracer,
    );

    await db.query("SELECT * FROM bank_users WHERE email = $1", [
      "maya@playgroundbank.test",
    ]);
    await db.exec(
      "INSERT INTO bank_users (email) VALUES ('lee@playgroundbank.test')",
    );
    await db.transaction((tx: typeof db) =>
      tx.query(
        "UPDATE bank_accounts SET balance = $1 WHERE id = $2",
        [987654, 7],
      ),
    );
    insideRequest = false;
    await db.query("SELECT 1", []);
    fact(
      "spans",
      opened.map((s) => `${s.kind} ${s.name}`),
    );

    expect(opened.map((s) => s.name)).toEqual([
      "SELECT bank_users",
      "INSERT bank_users",
      "transaction",
      "UPDATE bank_accounts",
    ]);
    expect(opened[0].kind).toBe("client");
    expect(opened[0].attributes["db.query.text"]).toBe(
      "SELECT * FROM bank_users WHERE email = $1",
    );
    expect(opened[1].attributes["db.query.text"]).toBeUndefined();
    expect(db.kind).toBe("pglite");
    const everything = JSON.stringify(opened);
    expect(everything).not.toContain("maya@playgroundbank.test");
    expect(everything).not.toContain("lee@playgroundbank.test");
    expect(everything).not.toContain("987654");
  });

  // An error is labelled by its code or kind, never its message; only a 5xx
  // answer marks a request span as an error.
  test("labels an error by its code, never its message", () => {
    expected(
      "a Postgres error is labelled 23505, a TypeError TypeError; 503 marks the span, 404 doesn't",
    );
    const duplicate = Object.assign(
      new Error("Key (email)=(maya@playgroundbank.test) already exists"),
      { code: "23505" },
    );
    const labels = {
      postgres: errorLabel(duplicate),
      typeError: errorLabel(new TypeError("cannot read maya@playgroundbank")),
    };
    // A pretend span handle that writes down what recordStatus does to it.
    const statusOf = (code: number) => {
      const seen = { attributes: {} as Record<string, unknown>, failed: "" };
      recordStatus(
        {
          set: (key: string, value: unknown) => (seen.attributes[key] = value),
          fail: (label: string) => (seen.failed = label),
        },
        code,
      );
      return seen;
    };
    const unavailable = statusOf(503);
    const notFound = statusOf(404);
    fact("labels", labels);
    fact("503", unavailable);
    fact("404", notFound);

    expect(labels).toEqual({ postgres: "23505", typeError: "TypeError" });
    expect(unavailable).toEqual({
      attributes: { "http.response.status_code": 503 },
      failed: "503",
    });
    expect(notFound).toEqual({
      attributes: { "http.response.status_code": 404 },
      failed: "",
    });
  });
});

test.describe("The tests' side of tracing", () => {
  // Each traced test gets its own trace: a fresh 32-character id, its own span
  // id (the id's first half), the header that carries both, and its link.
  test("gives each test its own trace, header and link", () => {
    expected(
      "two traces differ; the span id is the trace id's first half; header 00-<trace>-<span>-01; link /trace/<id>",
    );
    const one = newTestTrace();
    const two = newTestTrace();
    fact("trace", one);

    expect(one.traceId).toMatch(/^[0-9a-f]{32}$/);
    expect(one.traceId).not.toBe(two.traceId);
    expect(one.spanId).toBe(rootSpanIdOf(one.traceId));
    expect(one.spanId).toBe(one.traceId.slice(0, 16));
    expect(one.header).toBe(`00-${one.traceId}-${one.spanId}-01`);
    expect(one.url).toBe(`http://127.0.0.1:16686/trace/${one.traceId}`);
    expect(traceIdFromUrl(one.url)).toBe(one.traceId);
    expect(traceIdFromUrl("http://127.0.0.1:16686/search")).toBeNull();
  });

  // The fixture's header rule: with a trace, `traceparent` joins the test's
  // other headers; without one, the headers come back exactly as they were.
  test("adds traceparent only when the test has a trace", () => {
    expected(
      "no trace: the same headers object; a trace: a copy with traceparent added, the original untouched",
    );
    const headers = { Authorization: "Bearer test" };
    const trace = newTestTrace();
    const off = withTraceparent(headers, null);
    const on = withTraceparent(headers, trace);
    fact("with a trace", on);

    expect(off).toBe(headers);
    expect(withTraceparent(undefined, null)).toBeUndefined();
    expect(on).toEqual({
      Authorization: "Bearer test",
      traceparent: trace.header,
    });
    expect(headers).toEqual({ Authorization: "Bearer test" });
  });

  // The reporter, fed one finished test (a pretend TestCase and TestResult),
  // sends it to the pretend viewer: the test as the parent span, with the span
  // id its requests carried, and its steps nested under it. Fixture steps are
  // left out and their own steps move up; a failed step and the failed test are
  // marked as errors.
  test("sends a test and its steps as spans under the test's trace", async () => {
    expected(
      "a playwright-tests span with the test's span id, covering every step; steps nested under it, the fixture step left out, failures marked",
    );
    const trace = newTestTrace();
    const file = path.join(ROOT, "tests", "e2e", "app", "bills.spec.ts");
    const t0 = Date.now() - 2_000;
    // One step, as Playwright reports it.
    const step = (
      title: string,
      category: string,
      offset: number,
      duration: number,
      steps: object[] = [],
      error?: { message: string },
    ) => ({
      title,
      category,
      startTime: new Date(t0 + offset),
      duration,
      steps,
      error,
      location: { file, line: 20, column: 5 },
    });
    const finished = {
      title: "pays a bill",
      titlePath: () => [
        "",
        "default",
        "app/bills.spec.ts",
        "Bills",
        "pays a bill",
      ],
      location: { file, line: 12, column: 3 },
      expectedStatus: "passed",
      annotations: [],
      parent: { project: () => ({ name: "default" }) },
    } as unknown as TestCase;
    const result = {
      status: "failed",
      retry: 0,
      startTime: new Date(t0),
      // Shorter than its steps (they run to 720 ms), as Playwright reported
      // on the first real traced run.
      duration: 500,
      annotations: [{ type: "trace", description: trace.url }],
      error: { message: "\u001b[31mExpected: 200\u001b[39m\nReceived: 500" },
      steps: [
        step("Before Hooks", "hook", 0, 100, [
          step('Fixture "page"', "fixture", 5, 90, [
            step("Create page", "pw:api", 10, 50),
          ]),
        ]),
        step("Pay the bill", "test.step", 120, 600, [
          step("Click Pay", "pw:api", 130, 80),
          step("Expect toBe", "expect", 300, 10, [], {
            message: "Expected: 200",
          }),
        ]),
      ],
    } as unknown as TestResult;

    const reporter = new OtelReporter({ endpoint: receiver.url });
    reporter.onTestEnd(finished, result);
    await reporter.onEnd();
    const mine = receiver.spans.filter((s) => s.traceId === trace.traceId);
    const byName = (name: string) => mine.find((s) => s.name === name)!;
    fact(
      "spans",
      mine.map((s) => `${s.name} (parent ${s.parentSpanId || "-"})`),
    );

    expect(mine.map((s) => s.name)).toEqual([
      "pays a bill",
      "Before Hooks",
      "Create page",
      "Pay the bill",
      "Click Pay",
      "Expect toBe",
    ]);
    const root = byName("pays a bill");
    expect(root.spanId).toBe(trace.spanId);
    expect(root.parentSpanId).toBe("");
    expect(root.service).toBe(TEST_SERVICE);
    expect(root.statusCode).toBe(STATUS_ERROR);
    expect(root.attributes["test.suite.name"]).toBe("Bills");
    expect(root.attributes["code.file.path"]).toBe(
      "tests/e2e/app/bills.spec.ts",
    );
    expect(root.start).toBe(BigInt(t0) * 1_000_000n);
    // The test's span reaches its last step's end, not result.duration.
    expect(root.end).toBe(BigInt(t0 + 720) * 1_000_000n);
    const outside = mine.filter(
      (s) => s.start < root.start || s.end > root.end,
    );
    expect(outside.map((s) => s.name)).toEqual([]);
    expect(byName("Before Hooks").parentSpanId).toBe(root.spanId);
    expect(byName("Create page").parentSpanId).toBe(
      byName("Before Hooks").spanId,
    );
    expect(byName("Click Pay").parentSpanId).toBe(
      byName("Pay the bill").spanId,
    );
    expect(byName("Expect toBe").statusCode).toBe(STATUS_ERROR);
    expect(byName("Click Pay").statusCode).not.toBe(STATUS_ERROR);
  });

  // A step's name is made safe before it leaves: Playwright names an expect
  // with a custom message after the message, and framework/helpers/bank.ts
  // passes response bodies as messages, so a body (with any API key in it)
  // would become a span name. Found on the first real traced run.
  test("never sends a response body, key or token as a step's name", () => {
    expected(
      "a JSON-looking name is hidden; pbk_ keys and Bearer tokens become ***; long names are cut at 120",
    );
    const names = {
      body: safeTitle('{"key":{"token":"pbk_live_123"}}', "expect"),
      list: safeTitle('[{"id":1}]', "pw:api"),
      key: safeTitle("Revoke pbk_abc123XYZ", "test.step"),
      bearer: safeTitle("Call with Bearer secret-value", "test.step"),
      long: safeTitle("x".repeat(300), "test.step"),
      plain: safeTitle('Expect "toBe"', "expect"),
    };
    fact("names", names);

    expect(names.body).toBe("Expect (message hidden: it looks like data)");
    expect(names.list).toBe("Step (message hidden: it looks like data)");
    expect(names.key).toBe("Revoke pbk_***");
    expect(names.bearer).toBe("Call with Bearer ***");
    expect(names.long).toBe(`${"x".repeat(120)}...`);
    expect(names.plain).toBe('Expect "toBe"');
  });
});
