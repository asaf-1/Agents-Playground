// The test side of tracing (bank/tracing.js is the bank's side). With tracing
// on (`npm run test:traced`), every test gets its own trace: a trace id, a W3C
// `traceparent` header that carries it on each request the test sends, and a
// link to the trace in Jaeger. The [RESULT] block fixture
// (framework/fixtures/resultBlock.ts) puts the header on the test's requests
// and the link in its block; the reporter (framework/reporting/otelReporter.ts)
// sends the test's own steps under the same id. With tracing off, nothing
// here is used.

// Random bytes for the ids.
import { randomBytes } from "node:crypto";
// The one rule for "is tracing on", shared with the bank, so the two sides
// can never disagree.
import { isEnabled } from "../../bank/tracing.js";

// One test's trace.
export type TestTrace = {
  // 32 hex characters, shared by the test's spans and the bank's.
  traceId: string;
  // 16 hex characters: the test's own span, the parent of everything else.
  spanId: string;
  // The header value: version 00, the two ids, and 01 for "recorded".
  header: string;
  // The trace in Jaeger.
  url: string;
};

// Jaeger's viewer on this PC; TRACE_VIEWER_URL points the links elsewhere.
export const TRACE_VIEWER = (
  process.env.TRACE_VIEWER_URL || "http://127.0.0.1:16686"
).replace(/\/+$/, "");

// Whether tracing is on for this run: the same switch as the bank's,
// OTEL_EXPORTER_OTLP_ENDPOINT set and OTEL_SDK_DISABLED not "true".
export function tracingOn(env: NodeJS.ProcessEnv = process.env): boolean {
  return isEnabled(env);
}

// The test's own span id is the first half of its trace id. The fixture, which
// sends the header, and the reporter, which sends the span later, both work it
// out from the trace id alone, so nothing else has to be passed between them.
export function rootSpanIdOf(traceId: string): string {
  return traceId.slice(0, 16);
}

// A fresh trace for one test.
export function newTestTrace(): TestTrace {
  const traceId = randomBytes(16).toString("hex");
  const spanId = rootSpanIdOf(traceId);
  return {
    traceId,
    spanId,
    header: `00-${traceId}-${spanId}-01`,
    url: `${TRACE_VIEWER}/trace/${traceId}`,
  };
}

// A test's extra headers with `traceparent` added, or the same headers,
// untouched, when the test has no trace.
export function withTraceparent(
  headers: Record<string, string> | undefined,
  trace: TestTrace | null,
): Record<string, string> | undefined {
  if (!trace) return headers;
  return { ...(headers ?? {}), traceparent: trace.header };
}

// The trace id in a Jaeger link, as the reporter reads it back from the
// test's "trace" annotation.
export function traceIdFromUrl(url: string | undefined): string | null {
  const match = /\/trace\/([0-9a-f]{32})$/.exec(url ?? "");
  return match ? match[1] : null;
}
