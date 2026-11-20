// A payment whose answer is lost on the way back: the request reaches the
// bank and is done there, then the page gets a broken connection instead of
// the answer, as if the network failed at the worst moment. Only the page's
// own requests pass through page.route; the test's API calls (page.request)
// always reach the bank.

// Playwright's page and route types.
import type { Page, Route } from "@playwright/test";

// Lets the next request to this path, with this method, reach the bank, then
// drops its answer. Every later one goes through as usual. Returns what the
// bank answered the dropped one, and how many were dropped.
export async function loseNextAnswer(
  page: Page,
  path: RegExp,
  method = "POST",
): Promise<{ dropped: () => number; bankStatus: () => number }> {
  let dropped = 0;
  let bankStatus = 0;
  // Matches on the address's path, so a ?runKey= on the end never matters.
  const matches = (url: URL) => path.test(url.pathname);
  const handler = async (route: Route) => {
    if (route.request().method() !== method || dropped > 0) {
      return route.fallback();
    }
    // The bank does the work and answers; the page never sees it.
    const response = await route.fetch();
    bankStatus = response.status();
    dropped++;
    await route.abort("connectionreset");
  };
  await page.route(matches, handler);
  return { dropped: () => dropped, bankStatus: () => bankStatus };
}
