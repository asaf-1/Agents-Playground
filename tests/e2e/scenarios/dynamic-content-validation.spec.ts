/** The framework's page checker: is the product page whole and readable? */
import { PageValidationAgent } from "../../../framework/agents/validation/PageValidationAgent";
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
 * A gear-shop product page passes the checker as it is, and fails it in the
 * AI agents' broken state (the test flag productRenderBroken: a NaN price
 * drawn over the buy area) for three reasons; the report is saved. (Until
 * 2026-11-20 this ran on the original demo site's product page.)
 */
test("validates both valid and broken dynamic product states", async ({
  context,
  page,
  productPage,
  request,
}) => {
  expected(
    "the product as it is passes; with productRenderBroken armed it fails naming a non-finite number, a NaN token and a visual overlap; report status validated",
  );
  // A report for this scenario, the page checker, and the first product.
  const scenario = "dynamic-content-validation";
  const report = createScenarioReport(scenario);
  const validationAgent = new PageValidationAgent(page);
  const runKey = uniqueRunKey(scenario);
  const catalogue = await (await request.get("/api/products")).json();
  const productId: string = catalogue.products[0].id;
  fact("product", productId);
  let scenarioError: unknown;

  try {
    // As it is: it passes.
    await productPage.goto(productId);
    const validResult = await validationAgent.validateProductPage();
    fact("valid ok", validResult.valid);

    expect(validResult.valid, validResult.explanation).toBe(true);

    // Broken, for this test's runKey only: it fails.
    await armFlags(request, runKey, { productRenderBroken: true });
    await productPage.goto(productId, runKey);
    await expect(productPage.price, "the broken price has drawn").toContainText(
      "NaN",
    );

    const brokenResult = await validationAgent.validateProductPage();
    fact("broken issues", brokenResult.issues);

    report.initialFailure = brokenResult.explanation;

    // For all three reasons.
    expect(brokenResult.valid, "the broken page is not valid").toBe(false);
    expect(
      brokenResult.issues.some((issue) =>
        issue.includes("not a finite number"),
      ),
      "the price is not a number",
    ).toBe(true);
    expect(
      brokenResult.issues.some((issue) => issue.includes("NaN token")),
      "NaN is on the page",
    ).toBe(true);
    expect(
      brokenResult.issues.some((issue) =>
        issue.includes("Visual overlap detected"),
      ),
      "the price is drawn over the buy area",
    ).toBe(true);

    // What goes in the report.
    report.evidence = {
      brokenState: brokenResult,
      validState: validResult,
    };
    report.agentDecision =
      "Validated the live product page twice: as it is, it passed without hardcoded price assertions; in the broken state it failed on a malformed price and an overlap with the buy area.";
    report.finalStatus = "validated";
    report.suggestedPermanentFix =
      "Normalize product payloads before render, refuse a price that is not a number, and keep the price out of the buy area's box.";
    report.engine = "deterministic";
  } catch (error) {
    // Any failure is recorded in the report, then thrown on after it is written.
    scenarioError = error;
    report.finalStatus = "failed";
    report.agentDecision ||=
      "The dynamic content validation scenario failed before both product states were assessed.";
    report.initialFailure ||= serializeError(error);
  } finally {
    // Always write the report and the screenshot, and clear the flag.
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
