/** The framework's page checker: is the product page whole and readable? */
import { PageValidationAgent } from "../../../framework/agents/validation/PageValidationAgent";
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
 * The product page passes the checker in its valid state and fails it in its
 * broken state for four reasons; the report and trace are saved.
 */
test("validates both valid and broken dynamic product states", async ({
  context,
  page,
  productPage,
}) => {
  expected(
    "valid state passes; broken state fails naming a non-finite number, a NaN token, an undefined token and a visual overlap; report status validated",
  );
  // A report for this scenario, and the page checker.
  const scenario = "dynamic-content-validation";
  const report = createScenarioReport(scenario);
  const validationAgent = new PageValidationAgent(page);
  let scenarioError: unknown;

  await startScenarioTrace(context);

  try {
    // The valid state passes.
    await productPage.goto("sku-123", "valid");
    await productPage.expectStateText("Valid state");

    const validResult = await validationAgent.validateProductPage();
    fact("valid ok", validResult.valid);

    expect(validResult.valid).toBeTruthy();

    // The broken state fails.
    await productPage.goto("sku-123", "broken");
    await productPage.expectStateText("Broken state");

    const brokenResult = await validationAgent.validateProductPage();
    fact("broken issues", brokenResult.issues);

    report.initialFailure = brokenResult.explanation;

    // For all four reasons.
    expect(brokenResult.valid).toBeFalsy();
    expect(
      brokenResult.issues.some((issue) =>
        issue.includes("not a finite number"),
      ),
    ).toBeTruthy();
    expect(
      brokenResult.issues.some((issue) => issue.includes("NaN token")),
    ).toBeTruthy();
    expect(
      brokenResult.issues.some((issue) => issue.includes("undefined token")),
    ).toBeTruthy();
    expect(
      brokenResult.issues.some((issue) =>
        issue.includes("Visual overlap detected"),
      ),
    ).toBeTruthy();

    // What goes in the report.
    report.evidence = {
      brokenState: brokenResult,
      validState: validResult,
    };
    report.agentDecision =
      "Validated the live product page twice: the valid state passed without hardcoded price assertions, and the broken state failed on malformed price text, undefined content, and element overlap.";
    report.finalStatus = "validated";
    report.suggestedPermanentFix =
      "Normalize product payloads before render and prevent the broken overlap class from being applied when runtime data is invalid.";
    report.engine = "deterministic";
  } catch (error) {
    // Any failure is recorded in the report, then thrown on after it is written.
    scenarioError = error;
    report.finalStatus = "failed";
    report.agentDecision ||=
      "The dynamic content validation scenario failed before both product states were assessed.";
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
