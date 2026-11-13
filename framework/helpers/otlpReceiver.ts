// A pretend trace viewer for the tracing spec (tests/tracing/). A tiny HTTP
// server that accepts what OpenTelemetry sends (OTLP over HTTP as JSON, POST
// /v1/traces), keeps every span, and lets a test wait for the one it needs. So
// the spec needs no Docker and no Jaeger, and nothing leaves the machine.

// Node's HTTP server, its address type, and gunzip for a compressed batch.
import http from "node:http";
import type { AddressInfo } from "node:net";
import { gunzipSync } from "node:zlib";

// One span as the spec reads it. OTLP's JSON spells span kinds and statuses as
// numbers: kind 2 is a server span (a request arriving), 3 a client span (a
// call made, like a query); status 2 is an error.
export type ReceivedSpan = {
  service: string;
  traceId: string;
  spanId: string;
  parentSpanId: string;
  name: string;
  kind: number;
  statusCode: number;
  attributes: Record<string, string | number | boolean>;
  // When it started and ended, in nanoseconds since 1970. A bigint, because a
  // plain number can't hold that many digits exactly.
  start: bigint;
  end: bigint;
};

// The kind and status numbers the spec checks.
export const SPAN_KIND = { server: 2, client: 3 } as const;
export const STATUS_ERROR = 2;

export type OtlpReceiver = {
  // What to put in OTEL_EXPORTER_OTLP_ENDPOINT.
  url: string;
  // Every span received so far.
  spans: ReceivedSpan[];
  // Waits until a span matches, or fails after the timeout.
  waitFor(
    match: (span: ReceivedSpan) => boolean,
    timeoutMs?: number,
  ): Promise<ReceivedSpan>;
  close(): Promise<void>;
};

// OTLP's JSON shapes, as far as the spec reads them.
type OtlpValue = {
  stringValue?: string;
  intValue?: number | string;
  doubleValue?: number;
  boolValue?: boolean;
};
type OtlpAttribute = { key: string; value: OtlpValue };
type OtlpSpan = {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind: number;
  status?: { code?: number };
  attributes?: OtlpAttribute[];
  startTimeUnixNano?: string | number;
  endTimeUnixNano?: string | number;
};
type OtlpBody = {
  resourceSpans?: {
    resource?: { attributes?: OtlpAttribute[] };
    scopeSpans?: { spans?: OtlpSpan[] }[];
  }[];
};

// Starts the receiver on a free port of 127.0.0.1.
export async function startOtlpReceiver(): Promise<OtlpReceiver> {
  const spans: ReceivedSpan[] = [];

  // Each POST is one batch of spans; any other request gets a 404.
  const server = http.createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      if (request.method !== "POST" || request.url !== "/v1/traces") {
        response.writeHead(404).end();
        return;
      }
      // The exporter sends plain JSON by default; gzip only if it says so.
      let raw = Buffer.concat(chunks);
      if (request.headers["content-encoding"] === "gzip") raw = gunzipSync(raw);
      spans.push(...flatten(JSON.parse(raw.toString("utf8")) as OtlpBody));
      // The answer OTLP expects: accepted, nothing rejected.
      response
        .writeHead(200, { "Content-Type": "application/json" })
        .end('{"partialSuccess":{}}');
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}`,
    spans,
    // Checks every 50 ms. A miss lists the names of what did arrive, so a
    // failure shows what the bank sent instead.
    async waitFor(match, timeoutMs = 10_000) {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const found = spans.find(match);
        if (found) return found;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      const seen = spans.map((span) => span.name).join(", ") || "none";
      throw new Error(`No matching span in ${timeoutMs} ms. Received: ${seen}`);
    },
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

// The nested OTLP body as a flat list of spans, each with its service name.
function flatten(body: OtlpBody): ReceivedSpan[] {
  return (body.resourceSpans ?? []).flatMap((resourceSpan) => {
    const service = String(
      attributesOf(resourceSpan.resource?.attributes)["service.name"] ?? "",
    );
    return (resourceSpan.scopeSpans ?? []).flatMap((scope) =>
      (scope.spans ?? []).map((span) => ({
        service,
        traceId: span.traceId,
        spanId: span.spanId,
        parentSpanId: span.parentSpanId ?? "",
        name: span.name,
        kind: span.kind,
        statusCode: span.status?.code ?? 0,
        attributes: attributesOf(span.attributes),
        start: nanos(span.startTimeUnixNano),
        end: nanos(span.endTimeUnixNano),
      })),
    );
  });
}

// A time from OTLP's JSON as a bigint. It normally arrives as a string of
// digits; a number is rounded first, since BigInt takes whole numbers only.
function nanos(value: string | number | undefined): bigint {
  if (value === undefined) return 0n;
  return typeof value === "number" ? BigInt(Math.round(value)) : BigInt(value);
}

// OTLP's attribute list as a plain object. A whole number can arrive as a
// number or a string; it becomes a number either way.
function attributesOf(
  list: OtlpAttribute[] = [],
): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const { key, value } of list) {
    if (value.stringValue !== undefined) out[key] = value.stringValue;
    else if (value.intValue !== undefined) out[key] = Number(value.intValue);
    else if (value.doubleValue !== undefined) out[key] = value.doubleValue;
    else if (value.boolValue !== undefined) out[key] = value.boolValue;
  }
  return out;
}
