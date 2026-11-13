// Proof the walk's watcher sees what goes wrong, in a real page against the
// real site, before any walk starts (the "logic" project): a clean hunt only
// means something if the hunt would have noticed. The probe makes the page
// fail on purpose: a console error, an uncaught error, the Orders API's flaky
// mode (its first answer per run key is a 503, by design) and its slow mode,
// then an address the app does not have.

// The [RESULT] block's test tools.
import {
  expect,
  expected,
  fact,
  test,
} from "../../framework/fixtures/resultBlock";
// The watcher, the walk, and the slow-answer limit.
import { PageWatch, walkSite } from "../../framework/helpers/bugHunt/walk";
import { SLOW_MS } from "../../framework/helpers/bugHunt/findings";

test.describe("The walk's watcher", () => {
  // Each kind of signal, made on purpose in a real page.
  test("sees a 5xx, an uncaught error, a console error and a slow answer", async ({
    page,
    baseURL,
  }) => {
    expected(
      "console-error, page-error, server-error 503 on /api/orders and slow on /api/orders, each seen once",
    );
    const watch = new PageWatch(page, new URL(baseURL!).origin);
    watch.at("/app/about", "probe");
    await page.goto("/app/about");
    // A console error, and an error nothing catches.
    await page.evaluate(() => console.error("hunt probe: console"));
    await page.evaluate(() => {
      setTimeout(() => {
        throw new Error("hunt probe: uncaught");
      }, 0);
    });
    // The flaky mode's first answer for a fresh run key (503), and the slow
    // mode held just past the limit.
    const runKey = `hunt-probe-${Date.now()}`;
    await page.evaluate(
      ({ key, wait }) =>
        Promise.all([
          fetch(`/api/orders?mode=flaky&runKey=${key}`),
          fetch(`/api/orders?mode=stable&delayMs=${wait}&runKey=${key}-slow`),
        ]),
      { key: runKey, wait: SLOW_MS + 300 },
    );
    await page.waitForTimeout(300);
    const kinds = watch.signals.map((s) => s.kind);
    fact(
      "signals",
      watch.signals.map((s) =>
        `${s.kind} ${s.status ?? ""} ${s.message ?? s.path ?? ""}`.trim(),
      ),
    );

    expect(kinds).toContain("console-error");
    expect(kinds).toContain("page-error");
    const server = watch.signals.find((s) => s.kind === "server-error");
    expect(server).toMatchObject({
      method: "GET",
      path: "/api/orders",
      status: 503,
    });
    const slow = watch.signals.find((s) => s.kind === "slow");
    expect(slow?.path).toBe("/api/orders");
    expect(slow?.ms).toBeGreaterThan(SLOW_MS);
  });

  // A walk over an address the app does not have, and a real page: the
  // first is a dead link, the second is clean.
  test("tells a dead link from a real page", async ({
    page,
    baseURL,
  }, testInfo) => {
    expected(
      "an unknown /app address is a dead link (bug, high); /app/about gives no finding",
    );
    const missing = `/app/no-such-page-${Date.now()}`;
    const result = await walkSite(page, {
      pass: "signed out",
      base: baseURL!,
      pressButtons: false,
      screenshotDir: testInfo.outputPath("screens"),
      starts: [missing, "/app/about"],
      maxPages: 2,
    });
    fact("pages", result.pages);
    fact(
      "findings",
      result.findings.map((f) => `${f.kind}: ${f.page}`),
    );

    expect(result.pages).toEqual([missing, "/app/about"]);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({
      kind: "dead-link",
      page: missing,
      classification: "bug",
      confidence: "high",
    });
  });
});
