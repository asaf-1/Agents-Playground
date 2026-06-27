import { RecoveryRouter } from "../../../framework/agents/recovery/RecoveryRouter";
import {
  createScenarioReport,
  serializeError,
  startScenarioTrace,
  writeScenarioArtifacts,
} from "../../../framework/reporting/scenarioArtifacts";
import { expect, test } from "../../../framework/fixtures/baseTest";

test("heals stale button, link, and input locators through the generic router", async ({
  context,
  homePage,
  page,
}) => {
  const scenario = "generic-self-healing";
  const report = createScenarioReport(scenario);
  const router = new RecoveryRouter(page);
  let scenarioError: unknown;

  await startScenarioTrace(context);

  try {
    await homePage.goto();

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

    expect(buttonRecovery.finalStatus).toBe("recovered");
    await expect(page).toHaveURL(/\/dashboard(?:\?.*)?$/);

    await homePage.goto();

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

    expect(linkRecovery.finalStatus).toBe("recovered");
    await expect(page).toHaveURL(/\/dashboard(?:\?.*)?$/);

    await homePage.goto();

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

    expect(inputRecovery.finalStatus).toBe("recovered");
    await expect(homePage.triageOutput).toContainText("Checkout alerts");

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
    scenarioError = error;
    report.finalStatus = "failed";
    report.agentDecision ||=
      "The generic self-healing scenario failed before all three locator classes recovered.";
    report.initialFailure ||= serializeError(error);
  } finally {
    await writeScenarioArtifacts({
      context,
      page,
      report,
      scenario,
    });
  }

  if (scenarioError) {
    throw scenarioError;
  }
});
