/** The router that picks and runs a recovery strategy. */
import { RecoveryRouter } from "../../../framework/agents/recovery/RecoveryRouter";
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
 * The old "Sign Up" selector fails on the landing page; the recovery router
 * finds the renamed Join button, clicks it, and lands on the dashboard.
 */
test("heals the outdated Join CTA selector and navigates to the dashboard", async ({
  context,
  homePage,
  page,
}) => {
  expected(
    "the 'Sign Up' click fails; recovery recovered; the page is /dashboard with the 'Orders Recovery Console' heading; report recovered",
  );
  // A report for this scenario.
  const scenario = "ui-change-healing";
  const report = createScenarioReport(scenario);
  let scenarioError: unknown;

  await startScenarioTrace(context);

  try {
    await homePage.goto();

    // The old label no longer exists, so the click fails.
    try {
      await page.locator('button:has-text("Sign Up")').click({ timeout: 1200 });
      report.initialFailure =
        "The outdated Sign Up selector unexpectedly resolved.";
    } catch (error) {
      report.initialFailure = serializeError(error);
    }

    expect(report.initialFailure).not.toBe("");

    // Ask the router to heal the locator, steered by words like "join".
    const router = new RecoveryRouter(page);
    const recovery = await router.recover({
      failureEvidence: {
        errorMessage: report.initialFailure,
        staleSelector: 'button:has-text("Sign Up")',
        targetType: "button",
      },
      pageLabel: "Landing Page",
      scenario,
      strategies: [
        {
          kind: "locator-heal",
          request: {
            action: "click",
            intentTokens: ["join", "dashboard", "start"],
            staleSelector: 'button:has-text("Sign Up")',
            targetType: "button",
          },
        },
      ],
    });
    fact("outcome", recovery.finalStatus);
    fact("picked", recovery.recoveryEvidence.selectedCandidate);

    // It recovered, and the click reached the dashboard.
    expect(recovery.finalStatus).toBe("recovered");
    await expect(page).toHaveURL(/\/dashboard(?:\?.*)?$/);
    await expect(
      page.getByRole("heading", { name: "Orders Recovery Console" }),
    ).toBeVisible();

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
      "Replace the stale CTA selector with data-testid=join-now or the Join Now button label.";
    report.engine = recovery.engine;
  } catch (error) {
    // Any failure is recorded in the report, then thrown on after it is written.
    scenarioError = error;
    report.finalStatus = "failed";
    report.agentDecision ||=
      "The selector healing scenario failed before recovery completed.";
    report.initialFailure ||= serializeError(error);
  } finally {
    // Always write the report and the trace.
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
