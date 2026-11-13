// Starts the site with Playground Bank's tracing on, sending spans to Jaeger on
// this PC. `npm run trace:start` builds the React app, then runs this; start
// Jaeger first with `npm run trace:up`. Started any other way (npm start, the
// test suite, Render, CI), the site runs with tracing off.

// Jaeger's way in for spans on this PC, unless the caller already chose one.
process.env.OTEL_EXPORTER_OTLP_ENDPOINT ||= "http://127.0.0.1:4318";
// The name the viewer lists the bank's spans under.
process.env.OTEL_SERVICE_NAME ||= "playground-bank";
// Send spans after one second instead of five, so a click shows in the viewer
// almost at once.
process.env.OTEL_BSP_SCHEDULE_DELAY ||= "1000";

// Say where to look, then start the site exactly as `npm start` does (port 4173,
// or the first argument: `npm run trace:start -- 4180`).
console.log(
  "Tracing on. Jaeger: http://127.0.0.1:16686 (service: playground-bank)",
);
require("../../server.js");
