// Adds DOM matchers like toBeInTheDocument() to Vitest's expect.
import "@testing-library/jest-dom/vitest";
// Vitest's hooks around the whole run and around each test.
import { afterAll, afterEach, beforeAll, beforeEach } from "vitest";
// MSW's Node server, which answers the app's API calls during unit tests.
import { setupServer } from "msw/node";
// The default answers for each endpoint.
import { handlers } from "./handlers";
// The [RESULT] block printed after each unit test.
import { printResultBlock, recordCall, startResultBlock } from "./resultBlock";

// One MSW server for the whole Vitest run; each test starts from the default
// handlers and may override per-test with server.use(...).
export const server = setupServer(...handlers);

// Every answer MSW gives goes into the running test's block.
server.events.on("response:mocked", ({ request, response }) => {
  recordCall(request.method, request.url, response.status);
});

// Start the server before the first test; any call with no handler is an error.
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
// Each test starts with an empty [RESULT] record.
beforeEach(() => startResultBlock());
// After each test: back to the default handlers, then print the block.
afterEach(() => server.resetHandlers());
afterEach(({ task }) => printResultBlock(task));
// Stop the server after the last test.
afterAll(() => server.close());
