// Practice mode for one visitor, for the tests: what the server says is on,
// turning faults on through the API, and making the page's own practice calls
// fail or wait, while the test's own calls still reach the server.

// Playwright's page and route types, and the status check.
import type { Page, Route } from "@playwright/test";
import { expectStatus } from "./apiCheck";

// What the server says about this visitor's practice mode.
export type PracticeTruth = {
  on: boolean;
  armed: string[];
  total: number;
  flags: string[];
};

// The page's practice address. The test's own calls (page.request) never pass
// through page.route, so they always see the real server.
const PRACTICE = "**/api/practice";

// Asks the server directly which faults are on for this visitor, and lists the
// catalogue's flags in order, so a test never writes a flag into its file.
export async function practiceTruth(page: Page): Promise<PracticeTruth> {
  const response = await page.request.get("/api/practice");
  await expectStatus(response, 200, "the server answers the practice state");
  const state = await response.json();
  return {
    on: state.on,
    armed: state.armed,
    total: state.total,
    flags: state.bugs.map((bug: { flag: string }) => bug.flag),
  };
}

// Turns exactly these faults on for this visitor (every other one off).
export async function armFaults(page: Page, flags: string[]): Promise<void> {
  const response = await page.request.post("/api/practice", {
    data: { flags },
  });
  await expectStatus(response, 200, "the server turns the faults on");
}

// From now on, the page's practice calls of this kind (GET loads the state,
// POST switches faults) are answered 503 without reaching the server. Returns
// how many were answered so, and a way to let them through again.
export async function failPractice(
  page: Page,
  method: "GET" | "POST",
): Promise<{ count: () => number; stop: () => Promise<void> }> {
  let count = 0;
  // Only the chosen kind is failed; the other goes to the server as usual.
  const handler = (route: Route) => {
    if (route.request().method() !== method) return route.continue();
    count++;
    return route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ message: "Service unavailable" }),
    });
  };
  await page.route(PRACTICE, handler);
  return {
    count: () => count,
    stop: () => page.unroute(PRACTICE, handler),
  };
}

// From now on, the page's practice loads wait until release() is called, then
// go to the server as usual. A slow server, without a timer.
export async function holdPracticeLoads(
  page: Page,
): Promise<{ release: () => Promise<void> }> {
  // The loads waiting, and whether they may go.
  const waiting: Route[] = [];
  let released = false;
  const handler = (route: Route) => {
    if (route.request().method() !== "GET" || released) return route.continue();
    waiting.push(route);
  };
  await page.route(PRACTICE, handler);
  return {
    // Let the waiting loads go first, then stop holding: once the hold is
    // removed, Playwright would let them through itself.
    release: async () => {
      released = true;
      await Promise.all(waiting.map((route) => route.continue()));
      await page.unroute(PRACTICE, handler);
    },
  };
}
