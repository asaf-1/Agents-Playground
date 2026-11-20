/** The router that runs a failure through the whole agent chain. */
import { IncidentRouter } from "../../../framework/orchestrator/IncidentRouter";
/** The scenario report: start it, and write it out at the end. */
import {
  createScenarioReport,
  serializeError,
  writeScenarioArtifacts,
} from "../../../framework/reporting/scenarioArtifacts";
/** The Users page's contract. */
import { usersPageContract } from "../../../framework/agents/validation/contracts";
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
 * A click on a stale button selector fails on the bank's Users page; the
 * IncidentRouter classifies it, heals the locator (New user), validates the
 * page, and the incident is mitigated. (Until 2026-11-20 this ran on the
 * original demo site's User Manager.)
 */
test("routes a stale-locator failure through IncidentRouter and recovers on the Users page", async ({
  context,
  page,
  usersPage,
}) => {
  expected(
    "the stale click fails; recovered, ui-missing-locator, chain includes locator-heal and validate, strategy [locator-heal], an evidence-collect step, mitigated, the Create user dialog open; report recovered",
  );
  // A report for this scenario.
  const scenario = "orchestrated-recovery";
  const report = createScenarioReport(scenario);
  let scenarioError: unknown;

  try {
    // The Users page under a runKey of the test's own.
    await usersPage.goto(uniqueRunKey(scenario));
    await usersPage.waitForUsersLoaded();

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

    expect(report.initialFailure, "the stale click failed").not.toBe("");

    // Route through IncidentRouter — proves multi-agent orchestration
    const router = new IncidentRouter();
    const incidentResult = await router.route({
      page,
      scenario,
      pageLabel: "Users",
      contract: usersPageContract,
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
    expect(incidentResult.recovered, "recovered").toBe(true);
    expect(incidentResult.classified.category, "a stale locator").toBe(
      "ui-missing-locator",
    );
    expect(incidentResult.agentChain.agents, "healed").toContain(
      "locator-heal",
    );
    expect(incidentResult.agentChain.agents, "and validated").toContain(
      "validate",
    );
    expect(incidentResult.executionPlan.strategyOrder, "one strategy").toEqual([
      "locator-heal",
    ]);
    expect(
      incidentResult.executionPlan.plannedAgentSteps.map((step) => step.agent),
      "evidence was planned",
    ).toContain("evidence-collect");
    expect(incidentResult.finalStatus, "mitigated").toBe("mitigated");
    await expect(
      usersPage.createDialog,
      "the healed click opened Create user",
    ).toBeVisible();

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
    // Always write the report and the screenshot.
    await writeScenarioArtifacts({ context, page, report, scenario });
  }
  fact("report", report.finalStatus);

  if (scenarioError) {
    throw scenarioError;
  }
});
