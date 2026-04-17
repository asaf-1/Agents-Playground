import { PageValidationAgent } from "../../../framework/agents/validation/PageValidationAgent";
import {
  createScenarioReport,
  serializeError,
  startScenarioTrace,
  writeScenarioArtifacts
} from "../../../framework/reporting/scenarioArtifacts";
import { expect, test } from "../../../framework/fixtures/baseTest";

test("validates both valid and broken dynamic product states", async ({
  context,
  page,
  productPage
}) => {
  const scenario = "dynamic-content-validation";
  const report = createScenarioReport(scenario);
  const validationAgent = new PageValidationAgent(page);
  let scenarioError: unknown;

  await startScenarioTrace(context);

  try {
    await productPage.goto("sku-123", "valid");
    await productPage.expectStateText("Valid state");

    const validResult = await validationAgent.validateProductPage();

    expect(validResult.valid).toBeTruthy();

    await productPage.goto("sku-123", "broken");
    await productPage.expectStateText("Broken state");

    const brokenResult = await validationAgent.validateProductPage();

    report.initialFailure = brokenResult.explanation;

    expect(brokenResult.valid).toBeFalsy();
    expect(brokenResult.issues.some((issue) => issue.includes("not a finite number"))).toBeTruthy();
    expect(brokenResult.issues.some((issue) => issue.includes("NaN token"))).toBeTruthy();
    expect(brokenResult.issues.some((issue) => issue.includes("undefined token"))).toBeTruthy();
    expect(brokenResult.issues.some((issue) => issue.includes("Visual overlap detected"))).toBeTruthy();

    report.evidence = {
      brokenState: brokenResult,
      validState: validResult
    };
    report.agentDecision =
      "Validated the live product page twice: the valid state passed without hardcoded price assertions, and the broken state failed on malformed price text, undefined content, and element overlap.";
    report.finalStatus = "validated";
    report.suggestedPermanentFix =
      "Normalize product payloads before render and prevent the broken overlap class from being applied when runtime data is invalid.";
    report.engine = "deterministic";
  } catch (error) {
    scenarioError = error;
    report.finalStatus = "failed";
    report.agentDecision ||= "The dynamic content validation scenario failed before both product states were assessed.";
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
