// Playground Bank's tracing: an OpenTelemetry span for each /api/bank request
// and for each database query inside it, sent to a trace viewer (Jaeger, on
// the PC: `npm run trace:up`). A span is one timed piece of work: a name, a
// start, an end, ok or error. Spans that share a trace id make one timeline.
//
// Off unless OTEL_EXPORTER_OTLP_ENDPOINT is set, OpenTelemetry's own standard
// variable. Render, CI and the normal test runs don't set it, so there the
// OpenTelemetry packages are never even loaded and every function below just
// runs the work it is given.
//
// What a span keeps: names, times, status codes, the bank's request id and the
// SQL text with its $1 placeholders. Never the values sent with a query, a
// cookie, a header or a request body, and never an error's message (it can
// quote a value); an error is labelled by its code.

// Our small tracer once start() has run; null while tracing is off.
let tracer = null;
// OpenTelemetry's provider, kept so stop() can send what is still queued.
let provider = null;

// On when the endpoint is set, unless OTEL_SDK_DISABLED=true (OpenTelemetry's
// standard "off" switch) says otherwise.
function isEnabled(env = process.env) {
  const endpoint = String(env.OTEL_EXPORTER_OTLP_ENDPOINT || "").trim();
  const disabled =
    String(env.OTEL_SDK_DISABLED || "")
      .trim()
      .toLowerCase() === "true";
  return Boolean(endpoint) && !disabled;
}

// Loads OpenTelemetry and sets it up for the whole process. Returns true when
// tracing is on. Calling it twice changes nothing.
function start() {
  if (tracer) return true;
  if (!isEnabled()) return false;

  // Loaded only here, so a server with tracing off never loads them.
  const api = require("@opentelemetry/api");
  const {
    AsyncLocalStorageContextManager,
  } = require("@opentelemetry/context-async-hooks");
  const { W3CTraceContextPropagator } = require("@opentelemetry/core");
  const { resourceFromAttributes } = require("@opentelemetry/resources");
  const {
    BatchSpanProcessor,
    TracerProvider,
  } = require("@opentelemetry/sdk-trace");
  const {
    OTLPTraceExporter,
  } = require("@opentelemetry/exporter-trace-otlp-http");

  // Finished spans wait in a queue and go out in batches, every 5 seconds by
  // default. OTEL_BSP_SCHEDULE_DELAY (the standard name) changes the wait; the
  // tracing spec sets it short so it doesn't sit waiting.
  const delay = Number(process.env.OTEL_BSP_SCHEDULE_DELAY);
  // The exporter sends each batch as JSON to OTEL_EXPORTER_OTLP_ENDPOINT plus
  // /v1/traces: Jaeger's OTLP port, or the spec's pretend viewer.
  const exporter = new OTLPTraceExporter();
  provider = new TracerProvider({
    // The name the viewer lists the spans under.
    resource: resourceFromAttributes({
      "service.name":
        String(process.env.OTEL_SERVICE_NAME || "").trim() || "playground-bank",
    }),
    spanProcessors: [
      new BatchSpanProcessor({
        exporter,
        ...(delay > 0 ? { scheduledDelayMillis: delay } : {}),
      }),
    ],
  });

  // Three process-wide pieces. The provider makes the spans. The context
  // manager remembers which span is open across each `await`, so a query
  // knows the request it belongs to. The propagator reads the W3C
  // `traceparent` header a caller sends, so the bank's spans join the
  // caller's trace.
  api.trace.setGlobalTracerProvider(provider);
  api.context.setGlobalContextManager(
    new AsyncLocalStorageContextManager().enable(),
  );
  api.propagation.setGlobalPropagator(new W3CTraceContextPropagator());

  tracer = makeTracer(api, provider.getTracer("playground-bank"));
  return true;
}

// Sends whatever is still queued, then stops. Called when the server stops.
async function stop() {
  if (!provider) return;
  const stopping = provider;
  provider = null;
  tracer = null;
  await stopping.shutdown().catch(() => {});
}

// The time now, in milliseconds since 1970 with the fraction kept: when the
// process started, plus the precise counter since then. Left to itself,
// OpenTelemetry starts each span at Date.now(), which only counts whole
// milliseconds, so a query that began at 2.6 ms was drawn at 3.0 ms and seemed
// to end after its own request (Jaeger then warned about "clock skew"). Every
// span reading this one clock keeps them in their true order.
function preciseNow() {
  return performance.timeOrigin + performance.now();
}

// Our tracer, a thin layer over OpenTelemetry's. inSpan opens a span, runs the
// work inside it and closes it, even when the work throws. The work gets a
// handle with two methods: set(key, value) adds an attribute, fail(label)
// marks the span as an error. The tracing spec gives wrapDatabase a pretend
// tracer with the same three methods.
function makeTracer(api, otel) {
  // Our kind names and OpenTelemetry's numbers: server for a request that
  // arrives, client for a call the bank makes (a query), internal otherwise.
  const KIND = {
    server: api.SpanKind.SERVER,
    client: api.SpanKind.CLIENT,
    internal: api.SpanKind.INTERNAL,
  };
  return {
    // Whether the code is running inside a span right now.
    inSpanNow: () => Boolean(api.trace.getSpan(api.context.active())),

    // Runs work under the trace a caller's headers name (`traceparent`). A
    // missing or broken header names none, and the work starts a new trace.
    withCallerTrace(headers, work) {
      const parent = api.propagation.extract(api.context.active(), headers);
      return api.context.with(parent, work);
    },

    // Opens a span under the one that is open now, runs work in it, closes it.
    // Its start and end both come from preciseNow, so spans keep their true
    // order on the timeline.
    inSpan(name, { kind = "internal", attributes = {} } = {}, work) {
      return otel.startActiveSpan(
        name,
        { kind: KIND[kind], attributes, startTime: preciseNow() },
        async (span) => {
          const handle = {
            set: (key, value) => span.setAttribute(key, value),
            fail: (label) => {
              span.setAttribute("error.type", label);
              span.setStatus({
                code: api.SpanStatusCode.ERROR,
                message: label,
              });
            },
          };
          try {
            return await work(handle);
          } catch (error) {
            // A failure marks the span, then goes on as before.
            handle.fail(errorLabel(error));
            throw error;
          } finally {
            span.end(preciseNow());
          }
        },
      );
    },
  };
}

// One /api/bank request as one span, named like "GET /api/bank/accounts/:id".
// With tracing off it just runs the work.
function traceRequest(request, response, requestUrl, work) {
  if (!tracer) return work();
  const method = request.method || "GET";
  const route = routeOf(requestUrl.pathname);
  return tracer.withCallerTrace(request.headers, () =>
    tracer.inSpan(
      `${method} ${route}`,
      {
        kind: "server",
        // The standard HTTP attribute names, and the bank's request id, so a
        // span and the audit log's row for the same request point at each
        // other. The path, never the query string.
        attributes: {
          "http.request.method": method,
          "http.route": route,
          "url.path": requestUrl.pathname,
          "bank.request_id": request.requestId || "",
        },
      },
      async (span) => {
        await work();
        recordStatus(span, response.statusCode);
      },
    ),
  );
}

// The answer's status code on the span. Only a 5xx marks it as an error: a 4xx
// is the caller's mistake, not the bank's (OpenTelemetry's rule for a server
// span). A 4xx still shows, as its status code.
function recordStatus(span, statusCode) {
  span.set("http.response.status_code", statusCode);
  if (statusCode >= 500) span.fail(String(statusCode));
}

// The route as a pattern: any part after /api/bank/<area> that holds a digit
// becomes :id, so /api/bank/accounts/12/history and .../13/history share one
// name and the viewer can group them. The real path stays in url.path.
function routeOf(pathname) {
  return String(pathname)
    .split("/")
    .map((part, index) => (index > 3 && /\d/.test(part) ? ":id" : part))
    .join("/");
}

// How an error is labelled on a span: its code (Postgres gives one, like 23505
// for a duplicate), else its kind (TypeError). Never its message, which can
// quote the value that caused it.
function errorLabel(error) {
  if (error && typeof error.code === "string" && error.code) return error.code;
  return (error && error.name) || "Error";
}

// The database with a span around each query, exec and transaction. A call
// made outside a request (the migrations and demo data at start-up) gets no
// span, so the viewer shows request traces only. With tracing off it returns
// the database unchanged.
function wrapDatabase(db, spans = tracer) {
  if (!spans) return db;
  // query keeps its SQL text; exec (raw statements, the migrations) doesn't,
  // because raw SQL can hold literal values.
  const traced = (runner) => ({
    query: (text, params) =>
      querySpan(spans, db.kind, text, true, () => runner.query(text, params)),
    exec: (text) =>
      querySpan(spans, db.kind, text, false, () => runner.exec(text)),
  });
  return {
    ...db,
    ...traced(db),
    // A transaction is one span, with its queries inside it.
    transaction: (work) => {
      const run = () => db.transaction((tx) => work(traced(tx)));
      if (!spans.inSpanNow()) return run();
      return spans.inSpan(
        "transaction",
        { kind: "internal", attributes: { "db.system.name": "postgresql" } },
        run,
      );
    },
  };
}

// One query as one span, under the request that runs it. The parameters are
// never handed to the span.
function querySpan(spans, kind, text, keepText, run) {
  if (!spans.inSpanNow()) return run();
  const sql = summarize(text);
  // The standard database attribute names, and which engine answered.
  const attributes = {
    "db.system.name": "postgresql",
    "db.operation.name": sql.operation,
    "bank.database": kind,
  };
  if (sql.table) attributes["db.collection.name"] = sql.table;
  if (keepText) attributes["db.query.text"] = sql.text;
  return spans.inSpan(sql.name, { kind: "client", attributes }, () => run());
}

// A query's span name and text: the first SQL word and the first table it
// names ("SELECT bank_shop_products"), and the text on one line, cut at 1,000
// characters.
function summarize(text) {
  const oneLine = String(text || "")
    .replace(/\s+/g, " ")
    .trim();
  const operation = (oneLine.match(/^\w+/)?.[0] || "QUERY").toUpperCase();
  const table =
    oneLine.match(/\b(?:FROM|INTO|UPDATE|JOIN)\s+"?([A-Za-z_][\w.]*)/i)?.[1] ||
    "";
  return {
    name: table ? `${operation} ${table}` : operation,
    operation,
    table,
    text: oneLine.length > 1000 ? `${oneLine.slice(0, 1000)}...` : oneLine,
  };
}

module.exports = {
  isEnabled,
  start,
  stop,
  traceRequest,
  wrapDatabase,
  recordStatus,
  routeOf,
  errorLabel,
  summarize,
};
