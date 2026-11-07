/** The recovery agent, and the tracker that watches the page's orders requests. */
import {
  NetworkRecoveryAgent,
  OrdersRequestTracker,
} from "../../../framework/agents/recovery/NetworkRecoveryAgent";
/** The scenario report: start it, record a trace, and write it out at the end. */
import {
  createScenarioReport,
  serializeError,
  startScenarioTrace,
  writeScenarioArtifacts,
} from "../../../framework/reporting/scenarioArtifacts";
/** Playwright's test tools with the framework's page objects and the [RESULT] block. */
import {
  expect,
  expected,
  fact,
  test,
} from "../../../framework/fixtures/appTest";

/**
 * The flaky dashboard fails its first orders request; the recovery agent
 * brings the orders back, and the scenario's report and trace are saved.
 */
test("recovers a retryable orders failure through live dashboard state", async ({
  context,
  dashboardPage,
  page,
}) => {
  expected(
    "no orders within 1.5 s at first; after the agent recovers, 3 order rows and no error; report status recovered",
  );
  // A report for this scenario, and a tracker on the page's orders requests.
  const scenario = "flaky-network-recovery";
  const report = createScenarioReport(scenario);
  const tracker = new OrdersRequestTracker(page);
  let scenarioError: unknown;

  tracker.start();
  await startScenarioTrace(context);

  try {
    // The flaky dashboard: no rows in the first 1.5 seconds.
    await dashboardPage.goto("flaky");

    try {
      await page.waitForSelector("[data-testid='orders-row']", {
        timeout: 1500,
      });
      report.initialFailure =
        "Orders unexpectedly rendered before recovery was needed.";
    } catch (error) {
      report.initialFailure = serializeError(error);
    }

    expect(report.initialFailure).not.toBe("");

    // The agent recovers it: three rows, no error.
    const agent = new NetworkRecoveryAgent(page, tracker);
    const recovery = await agent.recover({ timeoutMs: 6000 });
    fact("strategy", recovery.strategy);

    await expect(dashboardPage.ordersRows).toHaveCount(3);
    await expect(dashboardPage.ordersError).toBeHidden();

    // What goes in the report.
    report.evidence = {
      ...recovery.evidence,
      strategy: recovery.strategy,
    };
    report.agentDecision = recovery.agentDecision;
    report.finalStatus = "recovered";
    report.suggestedPermanentFix =
      "Treat retryable orders failures as a single refresh path and extend waits only while the spinner or active request is present.";
    report.engine = recovery.engine;
  } catch (error) {
    // Any failure is recorded in the report, then thrown on after it is written.
    scenarioError = error;
    report.finalStatus = "failed";
    report.agentDecision ||=
      "The network recovery scenario failed before the dashboard could recover.";
    report.initialFailure ||= serializeError(error);
  } finally {
    // Always stop the tracker and write the report and trace.
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
