/** The recovery agent, and the tracker that watches the page's orders requests. */
import {
  NetworkRecoveryAgent,
  OrdersRequestTracker,
} from "../../../framework/agents/recovery/NetworkRecoveryAgent";
/** The scenario report: start it, and write it out at the end. */
import {
  createScenarioReport,
  serializeError,
  writeScenarioArtifacts,
} from "../../../framework/reporting/scenarioArtifacts";
/** Playwright's test tools with the framework's page objects and the [RESULT] block. */
import {
  expect,
  expected,
  fact,
  test,
} from "../../../framework/fixtures/appTest";
/** A runKey of the test's own. */
import { uniqueRunKey } from "../../../framework/helpers/bank";

/**
 * The orders service fails twice in a row, one more time than the bank's
 * orders page retries by itself, so the page gives up and shows its error with
 * Retry. The recovery agent sees the failed requests, presses Retry, and the
 * orders come back; the scenario's report is saved. The outage is injected in
 * the browser (Playwright's route), so nothing on the server changes. (Until
 * 2026-11-20 this ran on the original demo site's flaky dashboard.)
 */
test("recovers a retryable orders failure through live orders page state", async ({
  context,
  ordersPage,
  page,
}) => {
  expected(
    "two 503s: no orders within 1.5 s and the error with Retry; after the agent recovers, 3 order rows and no error; report status recovered",
  );
  // A report for this scenario, and a tracker on the page's orders requests.
  const scenario = "flaky-network-recovery";
  const report = createScenarioReport(scenario);
  const tracker = new OrdersRequestTracker(page);
  let scenarioError: unknown;

  // The outage: the first two orders answers are 503s.
  let failures = 0;
  await page.route("**/api/orders?**", (route) => {
    if (failures < 2) {
      failures += 1;
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          code: "ORDERS_UPSTREAM_TIMEOUT",
          message: "Orders API timed out.",
          retryable: true,
        }),
      });
    }
    return route.continue();
  });

  tracker.start();

  try {
    // The orders page during the outage: no rows in the first 1.5 seconds.
    await ordersPage.goto(uniqueRunKey(scenario));

    try {
      await page.waitForSelector("[data-testid^='order-row-']", {
        timeout: 1500,
      });
      report.initialFailure =
        "Orders unexpectedly rendered before recovery was needed.";
    } catch (error) {
      report.initialFailure = serializeError(error);
    }

    expect(report.initialFailure, "no orders at first").not.toBe("");
    await expect(
      ordersPage.retryButton,
      "the page gave up: Retry",
    ).toBeVisible();
    fact("failed answers", failures);

    // The agent recovers it: three rows, no error.
    const agent = new NetworkRecoveryAgent(page, tracker);
    const recovery = await agent.recover({ timeoutMs: 6000 });
    fact("strategy", recovery.strategy);

    await expect(ordersPage.rows, "the orders are back").toHaveCount(3);
    await expect(ordersPage.error, "and the error is gone").toBeHidden();

    // What goes in the report.
    report.evidence = {
      ...recovery.evidence,
      strategy: recovery.strategy,
    };
    report.agentDecision = recovery.agentDecision;
    report.finalStatus = "recovered";
    report.suggestedPermanentFix =
      "Treat retryable orders failures as a single retry path and extend waits only while the loading line or an active request is present.";
    report.engine = recovery.engine;
  } catch (error) {
    // Any failure is recorded in the report, then thrown on after it is written.
    scenarioError = error;
    report.finalStatus = "failed";
    report.agentDecision ||=
      "The network recovery scenario failed before the orders page could recover.";
    report.initialFailure ||= serializeError(error);
  } finally {
    // Always stop the tracker and write the report and the screenshot.
    tracker.stop();

    await writeScenarioArtifacts({
      context,
      page,
      report,
      scenario,
    });
  }
  fact("report", report.finalStatus);

  if (scenarioError) {
    throw scenarioError;
  }
});
