// Watches one page for what a working site never shows: an uncaught error, a
// console error, a request that got no answer, or an answer of 400 or more
// from the site, except the answers the test says are expected (a signed-out
// visitor's GET /api/bank/me answers 401, for example). The test's own API
// calls (page.request) are not the page's, so they are never watched.

// Playwright's page type.
import type { Page } from "@playwright/test";

// An answer the test expects, so it is not a problem.
export type ExpectedAnswer = { method: string; path: string; status: number };

// The console line a browser adds for every answer that is not 2xx: the
// answer itself is watched instead, so these are dropped.
const LOAD_NOISE = /^Failed to load resource/;
// A request the page cancels itself (it moved on): not a problem.
const CANCELLED = /ERR_ABORTED|NS_BINDING_ABORTED/;

// Starts watching. `site` is the address the tests run against (the baseURL):
// only its own requests count. Returns the problems seen so far, one line
// each.
export function watchBrowser(
  page: Page,
  site: string,
  expectedAnswers: ExpectedAnswer[] = [],
): { problems: () => string[] } {
  const host = new URL(site).host;
  const problems: string[] = [];
  // A request to the site itself, and its path.
  const ours = (url: string) => new URL(url).host === host;
  const pathOf = (url: string) => new URL(url).pathname;

  // Uncaught errors in the page.
  page.on("pageerror", (error) =>
    problems.push(`page error: ${error.message}`),
  );
  // Console errors, without the browser's own "failed to load" lines.
  page.on("console", (message) => {
    if (message.type() === "error" && !LOAD_NOISE.test(message.text())) {
      problems.push(`console error: ${message.text()}`);
    }
  });
  // A request to the site that got no answer at all.
  page.on("requestfailed", (request) => {
    const failure = request.failure()?.errorText ?? "";
    if (CANCELLED.test(failure) || !ours(request.url())) return;
    problems.push(
      `no answer: ${request.method()} ${pathOf(request.url())} (${failure})`,
    );
  });
  // An answer of 400 or more from the site that the test did not expect.
  page.on("response", (response) => {
    if (response.status() < 400 || !ours(response.url())) return;
    const method = response.request().method();
    const path = pathOf(response.url());
    const expected = expectedAnswers.some(
      (answer) =>
        answer.method === method &&
        answer.path === path &&
        answer.status === response.status(),
    );
    if (!expected) problems.push(`${response.status()}: ${method} ${path}`);
  });

  return { problems: () => [...problems] };
}
