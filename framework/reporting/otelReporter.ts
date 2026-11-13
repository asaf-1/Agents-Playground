// The tracing reporter: when a test ends, its steps become spans in the test's
// own trace, so Jaeger shows the test's steps and the bank's spans (request,
// queries) on one timeline. Used only with tracing on: playwright.config.ts
// adds it when OTEL_EXPORTER_OTLP_ENDPOINT is set (`npm run test:traced`).
//
// It reads the trace id from the test's "trace" annotation (added by the
// fixture in framework/fixtures/resultBlock.ts), works out the test's own span
// id from it, and posts the spans as OTLP JSON to the endpoint's /v1/traces,
// under the service name "playwright-tests". A send that fails prints one
// warning and never fails the run.

// Playwright's reporter types.
import type {
  Reporter,
  TestCase,
  TestResult,
  TestStep,
} from "@playwright/test/reporter";
// Random bytes for the step span ids, and paths for the file attribute.
import { randomBytes } from "node:crypto";
import { relative } from "node:path";
// The test's span id from its trace id, and the trace id from its link.
import { rootSpanIdOf, traceIdFromUrl } from "../helpers/testTrace";

// The service name the test's spans are listed under in Jaeger (the bank's are
// "playground-bank").
export const TEST_SERVICE = "playwright-tests";

// OTLP's JSON shapes: an attribute, a span, and the body that carries them.
type OtlpAttribute = {
  key: string;
  value: { stringValue: string } | { intValue: number };
};
type OtlpSpan = {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind: number;
  startTimeUnixNano: string;
  endTimeUnixNano: string;
  attributes: OtlpAttribute[];
  status: { code: number; message?: string };
};

// OTLP's numbers: an internal span (kind 1), and an unset (0) or error (2)
// status.
const KIND_INTERNAL = 1;
const STATUS_UNSET = 0;
const STATUS_ERROR = 2;

// The reporter itself. Playwright passes the options from the config entry;
// the tracing spec passes an endpoint to send to its pretend viewer.
export default class OtelReporter implements Reporter {
  private readonly endpoint: string;
  // The sends still in flight, awaited before the run ends.
  private readonly sends: Promise<void>[] = [];
  private warned = false;

  constructor(options: { endpoint?: string } = {}) {
    this.endpoint = (
      options.endpoint ||
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT ||
      ""
    ).replace(/\/+$/, "");
  }

  // Each finished test with a trace: its spans, sent at once.
  onTestEnd(test: TestCase, result: TestResult): void {
    const traceId = traceIdOf(test, result);
    if (!traceId || !this.endpoint) return;
    this.sends.push(this.send(otlpBody(test, result, traceId)));
  }

  // Wait for every send before Playwright finishes.
  async onEnd(): Promise<void> {
    await Promise.all(this.sends);
  }

  // It prints nothing of its own, so the other reporters keep the terminal.
  printsToStdio(): boolean {
    return false;
  }

  // One POST to /v1/traces. A failure warns once and is otherwise ignored.
  private async send(body: object): Promise<void> {
    try {
      const answer = await fetch(`${this.endpoint}/v1/traces`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!answer.ok) throw new Error(`HTTP ${answer.status}`);
    } catch (error) {
      if (this.warned) return;
      this.warned = true;
      console.warn(
        `[tracing] could not send test spans to ${this.endpoint}: ${(error as Error).message}`,
      );
    }
  }
}

// The test's trace id, from its "trace" annotation; null when it has none.
export function traceIdOf(test: TestCase, result: TestResult): string | null {
  const annotation = [...(result.annotations ?? []), ...test.annotations].find(
    (a) => a.type === "trace",
  );
  return traceIdFromUrl(annotation?.description);
}

// The OTLP body for one test: a span for the test, and one for each step
// under it, nested as Playwright nested them.
export function otlpBody(
  test: TestCase,
  result: TestResult,
  traceId: string,
): object {
  const spans: OtlpSpan[] = [];
  const rootId = rootSpanIdOf(traceId);
  // The test's span covers the test and every one of its steps. Playwright's
  // result.duration can stop before the last steps do (on the first real run
  // it ended at 122 ms while the steps ran on to 151 ms), and a parent that
  // ends before its children draws them outside it.
  const [start, end] = extentOf(
    result.steps,
    result.startTime.getTime(),
    result.startTime.getTime() + result.duration,
  );
  // The test failed when its result is not the one it expected (a test.fail
  // that fails is fine).
  const unexpected = result.status !== test.expectedStatus;

  // The test's own span, with the span id the fixture sent in `traceparent`.
  spans.push({
    traceId,
    spanId: rootId,
    name: test.title,
    kind: KIND_INTERNAL,
    startTimeUnixNano: nanos(start),
    endTimeUnixNano: nanos(end),
    // titlePath is the root, the project, the file, the describes, then the
    // test, so the describes are the parts from the fourth to the last but one.
    attributes: [
      text("test.case.name", test.title),
      text("test.suite.name", test.titlePath().slice(3, -1).join(" > ")),
      text("playwright.project", test.parent.project()?.name ?? ""),
      text("test.case.result.status", result.status),
      text("code.file.path", repoPath(test.location.file)),
      number("code.line.number", test.location.line),
      number("playwright.retry", result.retry),
    ],
    status: unexpected
      ? { code: STATUS_ERROR, message: firstLine(result.error?.message) }
      : { code: STATUS_UNSET },
  });

  // Each step under its parent. Fixture steps (Playwright setting up `page`,
  // `request` and the like) are left out as noise; their own steps move up to
  // the fixture's parent.
  const addSteps = (steps: TestStep[], parentId: string): void => {
    for (const step of steps) {
      if (step.category === "fixture") {
        addSteps(step.steps, parentId);
        continue;
      }
      const spanId = randomBytes(8).toString("hex");
      const begin = step.startTime.getTime();
      const attributes = [text("playwright.step.category", step.category)];
      if (step.location) {
        attributes.push(
          text("code.file.path", repoPath(step.location.file)),
          number("code.line.number", step.location.line),
        );
      }
      spans.push({
        traceId,
        spanId,
        parentSpanId: parentId,
        name: safeTitle(step.title, step.category),
        kind: KIND_INTERNAL,
        startTimeUnixNano: nanos(begin),
        endTimeUnixNano: nanos(begin + step.duration),
        attributes,
        status: step.error
          ? { code: STATUS_ERROR, message: firstLine(step.error.message) }
          : { code: STATUS_UNSET },
      });
      addSteps(step.steps, spanId);
    }
  };
  addSteps(result.steps, rootId);

  // One resource (the test service) and one scope (this reporter).
  return {
    resourceSpans: [
      {
        resource: { attributes: [text("service.name", TEST_SERVICE)] },
        scopeSpans: [
          { scope: { name: "agents-playground/otel-reporter" }, spans },
        ],
      },
    ],
  };
}

// The earliest start and latest end among the steps (at any depth) and the
// given start and end, in milliseconds since 1970.
function extentOf(
  steps: TestStep[],
  start: number,
  end: number,
): [number, number] {
  let first = start;
  let last = end;
  for (const step of steps) {
    const begin = step.startTime.getTime();
    const [childFirst, childLast] = extentOf(
      step.steps,
      begin,
      begin + step.duration,
    );
    first = Math.min(first, childFirst);
    last = Math.max(last, childLast);
  }
  return [first, last];
}

// Milliseconds since 1970 as OTLP's nanoseconds, a string of digits.
function nanos(ms: number): string {
  return (BigInt(Math.round(ms * 1000)) * 1000n).toString();
}

// A text attribute, and a whole-number one.
function text(key: string, value: string): OtlpAttribute {
  return { key, value: { stringValue: value } };
}
function number(key: string, value: number): OtlpAttribute {
  return { key, value: { intValue: value } };
}

// A file as a path from the repository, with forward slashes.
function repoPath(file: string): string {
  return relative(process.cwd(), file).replace(/\\/g, "/");
}

// The first line of an error (the line the [RESULT] block prints), made safe
// the same way as a step's name: hidden when it looks like data, keys and
// tokens masked.
function firstLine(message: string | undefined): string {
  const line = firstLineRaw(message);
  return /^\s*[{[]/.test(line)
    ? "(message hidden: it looks like data)"
    : maskSecrets(line);
}

// A step's name as Jaeger may show it. Playwright names an `expect` with a
// custom message after that message, and a helper that passes a response body
// as the message would put the whole body in the name, with any key or token
// in it. So a name that looks like data (it starts with { or [) is hidden, a
// key or bearer token is masked, and the name is cut at 120 characters.
export function safeTitle(title: string, category: string): string {
  if (/^\s*[{[]/.test(title)) {
    return `${category === "expect" ? "Expect" : "Step"} (message hidden: it looks like data)`;
  }
  const masked = maskSecrets(title);
  return masked.length > 120 ? `${masked.slice(0, 120)}...` : masked;
}

// API keys (pbk_...) and bearer tokens, as *** wherever they appear.
function maskSecrets(text: string): string {
  return text
    .replace(/pbk_[A-Za-z0-9_-]+/g, "pbk_***")
    .replace(/(Bearer\s+)\S+/gi, "$1***");
}

// The first line of an error, without terminal colours, cut at 200 characters.
function firstLineRaw(message: string | undefined): string {
  const plain = (message ?? "").replace(/\u001b\[[0-9;]*m/g, "");
  const line = plain.split("\n").find((l) => l.trim()) ?? "";
  return line.length > 200 ? `${line.slice(0, 200)}...` : line;
}
