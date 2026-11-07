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
 * Three stale selectors on the landing page (a button, a link and an input)
 * each fail, and the same generic router heals all three.
 */
test("heals stale button, link, and input locators through the generic router", async ({
  context,
  homePage,
  page,
}) => {
  expected(
    "button heal recovers to /dashboard; link heal recovers to /dashboard; input heal recovers and the triage output contains 'Checkout alerts'; report recovered",
  );
  // A report for this scenario, and one router for all three heals.
  const scenario = "generic-self-healing";
  const report = createScenarioReport(scenario);
  const router = new RecoveryRouter(page);
  let scenarioError: unknown;

  await startScenarioTrace(context);

  try {
    await homePage.goto();

    // 1. A button whose old label is gone.
    let buttonFailure = "";

    try {
      await page
        .locator('button:has-text("Launch Console")')
        .click({ timeout: 400 });
      buttonFailure =
        "The stale Launch Console button selector unexpectedly resolved.";
    } catch (error) {
      buttonFailure = serializeError(error);
    }

    // Heal it by intent ("join", "dashboard", "start"); it reaches the dashboard.
    const buttonRecovery = await router.recover({
      failureEvidence: {
        errorMessage: buttonFailure,
        staleSelector: 'button:has-text("Launch Console")',
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
            staleSelector: 'button:has-text("Launch Console")',
            targetType: "button",
          },
        },
      ],
    });
    fact("button", buttonRecovery.finalStatus);

    expect(buttonRecovery.finalStatus).toBe("recovered");
    await expect(page).toHaveURL(/\/dashboard(?:\?.*)?$/);

    await homePage.goto();

    // 2. A link whose old label is gone.
    let linkFailure = "";

    try {
      await page
        .locator('a:has-text("Operations Console")')
        .click({ timeout: 400 });
      linkFailure =
        "The stale Operations Console link selector unexpectedly resolved.";
    } catch (error) {
      linkFailure = serializeError(error);
    }

    // Heal it; it reaches the dashboard too.
    const linkRecovery = await router.recover({
      failureEvidence: {
        errorMessage: linkFailure,
        staleSelector: 'a:has-text("Operations Console")',
        targetType: "link",
      },
      pageLabel: "Landing Page",
      scenario,
      strategies: [
        {
          kind: "locator-heal",
          request: {
            action: "click",
            intentTokens: ["dashboard", "orders", "console"],
            staleSelector: 'a:has-text("Operations Console")',
            targetType: "link",
          },
        },
      ],
    });
    fact("link", linkRecovery.finalStatus);

    expect(linkRecovery.finalStatus).toBe("recovered");
    await expect(page).toHaveURL(/\/dashboard(?:\?.*)?$/);

    await homePage.goto();

    // 3. An input whose old placeholder is gone.
    let inputFailure = "";

    try {
      await page
        .locator('input[placeholder="Incident prompt"]')
        .fill("Checkout alerts", {
          timeout: 400,
        });
      inputFailure =
        "The stale Incident prompt input selector unexpectedly resolved.";
    } catch (error) {
      inputFailure = serializeError(error);
    }

    // Heal it and type the text; the triage output shows it.
    const inputRecovery = await router.recover({
      failureEvidence: {
        errorMessage: inputFailure,
        staleSelector: 'input[placeholder="Incident prompt"]',
        targetType: "input",
      },
      pageLabel: "Landing Page",
      scenario,
      strategies: [
        {
          kind: "locator-heal",
          request: {
            action: "fill",
            fillValue: "Checkout alerts",
            intentTokens: ["triage", "incident", "summary"],
            staleSelector: 'input[placeholder="Incident prompt"]',
            targetType: "input",
          },
        },
      ],
    });
    fact("input", inputRecovery.finalStatus);

    expect(inputRecovery.finalStatus).toBe("recovered");
    await expect(homePage.triageOutput).toContainText("Checkout alerts");

    // What goes in the report.
    report.initialFailure = [buttonFailure, linkFailure, inputFailure].join(
      " | ",
    );
    report.evidence = {
      buttonRecovery,
      inputRecovery,
      linkRecovery,
    };
    report.agentDecision =
      "Recovered three unrelated stale locator failures through the generic router: a button click, a navigation link click, and an input fill path on the landing page.";
    report.finalStatus = "recovered";
    report.suggestedPermanentFix =
      "Prefer durable page-object contracts built from data-testid, label, and role signals so locator healing becomes a fallback instead of the primary path.";
    report.engine = "deterministic";
  } catch (error) {
    // Any failure is recorded in the report, then thrown on after it is written.
    scenarioError = error;
    report.finalStatus = "failed";
    report.agentDecision ||=
      "The generic self-healing scenario failed before all three locator classes recovered.";
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
