/** The router that runs a failure through the whole agent chain. */
import { IncidentRouter } from "../../../framework/orchestrator/IncidentRouter";
/** The scenario report: start it, record a trace, and write it out at the end. */
import {
  createScenarioReport,
  serializeError,
  startScenarioTrace,
  writeScenarioArtifacts,
} from "../../../framework/reporting/scenarioArtifacts";
/** The User Manager page's contract. */
import { userManagerPageContract } from "../../../framework/agents/validation/contracts";
/** Playwright's test tools with the framework's page objects and the [RESULT] block. */
import {
  expect,
  expected,
  fact,
  test,
} from "../../../framework/fixtures/appTest";

/**
 * A click on a stale button selector fails; the IncidentRouter classifies it,
 * heals the locator, validates the page, and the incident is mitigated.
 */
test("routes a stale-locator failure through IncidentRouter and recovers on the User Manager page", async ({
  context,
  userManagerPage,
  page,
}) => {
  expected(
    "the stale click fails; recovered, ui-missing-locator, chain includes locator-heal and validate, strategy [locator-heal], an evidence-collect step, mitigated; report recovered",
  );
  // A report for this scenario.
  const scenario = "orchestrated-recovery";
  const report = createScenarioReport(scenario);
  let scenarioError: unknown;

  await startScenarioTrace(context);

  try {
    // A clean user list; dismiss any prompt; open User Manager.
    await page.request.post("/api/test/reset-users");
    page.on("dialog", (dialog) => dialog.dismiss());
    await userManagerPage.goto();
    await userManagerPage.waitForUsersLoaded();

    // Intentionally use a stale selector that does not exist
    try {
      await page
        .locator('button:has-text("Add Member")')
        .click({ timeout: 1200 });
      report.initialFailure =
        "Stale selector unexpectedly resolved — test setup issue.";
    } catch (error) {
      report.initialFailure = serializeError(error);
    }

    expect(report.initialFailure).not.toBe("");

    // Route through IncidentRouter — proves multi-agent orchestration
    const router = new IncidentRouter();
    const incidentResult = await router.route({
      page,
      scenario,
      pageLabel: "User Manager",
      contract: userManagerPageContract,
      failureEvidence: {
        errorMessage: report.initialFailure,
        staleSelector: 'button:has-text("Add Member")',
        targetType: "button",
      },
      strategies: [
        {
          kind: "locator-heal",
          request: {
            action: "click",
            intentTokens: ["add", "user", "create", "new"],
            staleSelector: 'button:has-text("Add Member")',
            targetType: "button",
          },
        },
      ],
    });
    fact("incidentId", incidentResult.incidentId);
    fact("chain", incidentResult.agentChain.agents);
    fact("outcome", incidentResult.finalStatus);

    // What the router found and did.
    expect(incidentResult.recovered).toBe(true);
    expect(incidentResult.classified.category).toBe("ui-missing-locator");
    expect(incidentResult.agentChain.agents).toContain("locator-heal");
    expect(incidentResult.agentChain.agents).toContain("validate");
    expect(incidentResult.executionPlan.strategyOrder).toEqual([
      "locator-heal",
    ]);
    expect(
      incidentResult.executionPlan.plannedAgentSteps.map((step) => step.agent),
    ).toContain("evidence-collect");
    expect(incidentResult.finalStatus).toBe("mitigated");

    // What goes in the report.
    report.evidence = {
      incidentId: incidentResult.incidentId,
      classified: incidentResult.classified,
      agentChain: incidentResult.agentChain,
      executionPlan: incidentResult.executionPlan,
      recovered: incidentResult.recovered,
      validationPassed: incidentResult.validationPassed,
      finalStatus: incidentResult.finalStatus,
      durationMs: incidentResult.durationMs,
      patchProposal: incidentResult.patchProposal,
      recoveryDetail: incidentResult.recoveryDetail,
    };
    report.agentDecision = `IncidentRouter classified failure as ${incidentResult.classified.category} and routed through agents: ${incidentResult.agentChain.agents.join(" → ")}. Recovery: ${incidentResult.recovered ? "succeeded" : "failed"}.`;
    report.finalStatus =
      incidentResult.finalStatus === "mitigated" ? "recovered" : "failed";
    report.suggestedPermanentFix =
      incidentResult.patchProposal.recommendedPermanentFixDirection;
    report.engine = "multi-agent-orchestrator";
  } catch (error) {
    // Any failure is recorded in the report, then thrown on after it is written.
    scenarioError = error;
    report.finalStatus = "failed";
    report.agentDecision ||=
      "Orchestrated recovery scenario failed before completion.";
    report.initialFailure ||= serializeError(error);
  } finally {
    // Always write the report and the trace.
    await writeScenarioArtifacts({ context, page, report, scenario });
  }
  fact("report", report.finalStatus);

  if (scenarioError) {
    throw scenarioError;
  }
});
