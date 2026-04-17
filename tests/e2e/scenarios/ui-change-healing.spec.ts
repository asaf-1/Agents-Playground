import { RecoveryRouter } from "../../../framework/agents/recovery/RecoveryRouter";
import {
  createScenarioReport,
  serializeError,
  startScenarioTrace,
  writeScenarioArtifacts
} from "../../../framework/reporting/scenarioArtifacts";
import { expect, test } from "../../../framework/fixtures/baseTest";

test("heals the outdated Join CTA selector and navigates to the dashboard", async ({
  context,
  homePage,
  page
}) => {
  const scenario = "ui-change-healing";
  const report = createScenarioReport(scenario);
  let scenarioError: unknown;

  await startScenarioTrace(context);

  try {
    await homePage.goto();

    try {
      await page.locator('button:has-text("Sign Up")').click({ timeout: 1200 });
      report.initialFailure = "The outdated Sign Up selector unexpectedly resolved.";
    } catch (error) {
      report.initialFailure = serializeError(error);
    }

    expect(report.initialFailure).not.toBe("");

    const router = new RecoveryRouter(page);
    const recovery = await router.recover({
      failureEvidence: {
        errorMessage: report.initialFailure,
        staleSelector: 'button:has-text("Sign Up")',
        targetType: "button"
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
            targetType: "button"
          }
        }
      ]
    });

    expect(recovery.finalStatus).toBe("recovered");
    await expect(page).toHaveURL(/\/dashboard(?:\?.*)?$/);
    await expect(page.getByRole("heading", { name: "Orders Recovery Console" })).toBeVisible();

    report.evidence = {
      attempts: recovery.attempts,
      classification: recovery.classification,
      patchProposal: recovery.patchProposal,
      selectedCandidate: recovery.recoveryEvidence.selectedCandidate,
      topCandidates: recovery.recoveryEvidence.topCandidates
    };
    report.agentDecision = recovery.agentDecision;
    report.finalStatus = "recovered";
    report.suggestedPermanentFix =
      "Replace the stale CTA selector with data-testid=join-now or the Join Now button label.";
    report.engine = recovery.engine;
  } catch (error) {
    scenarioError = error;
    report.finalStatus = "failed";
    report.agentDecision ||= "The selector healing scenario failed before recovery completed.";
    report.initialFailure ||= serializeError(error);
  } finally {
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
