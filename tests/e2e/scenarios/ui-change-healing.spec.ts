/** The router that picks and runs a recovery strategy. */
import { RecoveryRouter } from "../../../framework/agents/recovery/RecoveryRouter";
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
/** Arms a planted bug for one runKey, and makes a runKey of the test's own. */
import { armFlags } from "../../../framework/helpers/flags";
import { uniqueRunKey } from "../../../framework/helpers/bank";

/**
 * The bank's planted HEAL fault: ordersRefreshLabel renames /app/orders'
 * Refresh button to Reload. A test that finds it by its words fails; the
 * recovery router finds the renamed button by what it is for, clicks it, and
 * the orders are asked for again. (Until 2026-11-20 this healed the original
 * demo site's renamed "Sign Up" call to action.)
 */
test("heals the renamed Refresh button and reloads the orders", async ({
  context,
  ordersPage,
  page,
  request,
}) => {
  expected(
    "with ordersRefreshLabel armed, the 'Refresh' click fails; recovery recovered; one more /api/orders request; the table stays; report recovered",
  );
  // A report for this scenario, and the fault armed for this test only.
  const scenario = "ui-change-healing";
  const report = createScenarioReport(scenario);
  const runKey = uniqueRunKey(scenario);
  await armFlags(request, runKey, { ordersRefreshLabel: "Reload" });
  let scenarioError: unknown;

  try {
    await ordersPage.goto(runKey);
    await ordersPage.waitForOrdersLoaded(3);

    // The old label no longer exists, so the click fails.
    try {
      await page.locator('button:has-text("Refresh")').click({ timeout: 1200 });
      report.initialFailure =
        "The outdated Refresh selector unexpectedly resolved.";
    } catch (error) {
      report.initialFailure = serializeError(error);
    }

    expect(report.initialFailure, "the stale click failed").not.toBe("");

    // Count the orders requests, then ask the router to heal the locator,
    // steered by words like "refresh" and "orders".
    let ordersRequests = 0;
    page.on("request", (sent) => {
      if (sent.url().includes("/api/orders")) ordersRequests += 1;
    });
    const router = new RecoveryRouter(page);
    const recovery = await router.recover({
      failureEvidence: {
        errorMessage: report.initialFailure,
        staleSelector: 'button:has-text("Refresh")',
        targetType: "button",
      },
      pageLabel: "Orders",
      scenario,
      strategies: [
        {
          kind: "locator-heal",
          request: {
            action: "click",
            intentTokens: ["refresh", "reload", "orders"],
            staleSelector: 'button:has-text("Refresh")',
            targetType: "button",
          },
        },
      ],
    });
    fact("outcome", recovery.finalStatus);
    fact("picked", recovery.recoveryEvidence.selectedCandidate);

    // It recovered, the click asked for the orders again, and they are there.
    expect(recovery.finalStatus, "the heal recovered").toBe("recovered");
    await expect
      .poll(() => ordersRequests, {
        message: "the orders were asked for again",
      })
      .toBeGreaterThan(0);
    await expect(ordersPage.table, "the orders are still shown").toBeVisible();
    fact("orders requests after the heal", ordersRequests);

    // What goes in the report.
    report.evidence = {
      attempts: recovery.attempts,
      classification: recovery.classification,
      patchProposal: recovery.patchProposal,
      selectedCandidate: recovery.recoveryEvidence.selectedCandidate,
      topCandidates: recovery.recoveryEvidence.topCandidates,
    };
    report.agentDecision = recovery.agentDecision;
    report.finalStatus = "recovered";
    report.suggestedPermanentFix =
      "Find the button by data-testid=orders-refresh instead of its words: the label is allowed to change, the test id is not.";
    report.engine = recovery.engine;
  } catch (error) {
    // Any failure is recorded in the report, then thrown on after it is written.
    scenarioError = error;
    report.finalStatus = "failed";
    report.agentDecision ||=
      "The selector healing scenario failed before recovery completed.";
    report.initialFailure ||= serializeError(error);
  } finally {
    // Always write the report and the screenshot, and clear the fault.
    await writeScenarioArtifacts({
      context,
      page,
      report,
      scenario,
    });
    await request.delete(
      `/api/test/flags?runKey=${encodeURIComponent(runKey)}`,
    );
  }
  fact("report", report.finalStatus);

  if (scenarioError) {
    throw scenarioError;
  }
});
