import {
  NetworkRecoveryAgent,
  OrdersRequestTracker
} from "../../../framework/agents/recovery/NetworkRecoveryAgent";
import {
  createScenarioReport,
  serializeError,
  startScenarioTrace,
  writeScenarioArtifacts
} from "../../../framework/reporting/scenarioArtifacts";
import { expect, test } from "../../../framework/fixtures/baseTest";

test("recovers a retryable orders failure through live dashboard state", async ({
  context,
  dashboardPage,
  page
}) => {
  const scenario = "flaky-network-recovery";
  const report = createScenarioReport(scenario);
  const tracker = new OrdersRequestTracker(page);
  let scenarioError: unknown;

  tracker.start();
  await startScenarioTrace(context);

  try {
    await dashboardPage.goto("flaky");

    try {
      await page.waitForSelector("[data-testid='orders-row']", { timeout: 1500 });
      report.initialFailure = "Orders unexpectedly rendered before recovery was needed.";
    } catch (error) {
      report.initialFailure = serializeError(error);
    }

    expect(report.initialFailure).not.toBe("");

    const agent = new NetworkRecoveryAgent(page, tracker);
    const recovery = await agent.recover({ timeoutMs: 6000 });

    await expect(dashboardPage.ordersRows).toHaveCount(3);
    await expect(dashboardPage.ordersError).toBeHidden();

    report.evidence = {
      ...recovery.evidence,
      strategy: recovery.strategy
    };
    report.agentDecision = recovery.agentDecision;
    report.finalStatus = "recovered";
    report.suggestedPermanentFix =
      "Treat retryable orders failures as a single refresh path and extend waits only while the spinner or active request is present.";
    report.engine = recovery.engine;
  } catch (error) {
    scenarioError = error;
    report.finalStatus = "failed";
    report.agentDecision ||= "The network recovery scenario failed before the dashboard could recover.";
    report.initialFailure ||= serializeError(error);
  } finally {
    tracker.stop();

    await writeScenarioArtifacts({
      context,
      page,
      report,
      scenario
    });
  }

  if (scenarioError) {
    throw scenarioError;
  }
});
