/** The agent under test: it explains why an API answer is wrong. */
import { ApiDiagnosisAgent } from "../../../framework/agents/diagnosis/ApiDiagnosisAgent";
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
 * The bank's planted fault productSchemaDrift: GET /api/products sends each
 * price as text while its schema (ProductsResponse in bank/openapi.json) says
 * a number. The page prints it the same either way. The diagnosis agent checks
 * the answer against the schema, finds the field and the types, and the report
 * is saved. (Until 2026-11-20 this diagnosed the original demo site's
 * create-user 500.)
 */
test("diagnoses the products price type drift against the published schema", async ({
  context,
  page,
  request,
}) => {
  expected(
    "with productSchemaDrift armed, GET /api/products 200; root cause products[0].price, expected number, received string; api-contract-drift; report status diagnosed",
  );
  // A report for this scenario, and the fault armed for this test only.
  const scenario = "api-error-diagnosis";
  const report = createScenarioReport(scenario);
  const runKey = uniqueRunKey(scenario);
  await armFlags(request, runKey, { productSchemaDrift: true });
  const requestUrl = `/api/products?runKey=${encodeURIComponent(runKey)}`;
  let scenarioError: unknown;

  try {
    // The page the answer feeds, for the report's screenshot, then the call.
    await page.goto(`/app/products?runKey=${encodeURIComponent(runKey)}`);
    const response = await request.get(requestUrl);

    report.initialFailure =
      "GET /api/products answered every price as text, which its published ProductsResponse schema does not allow.";

    expect(response.status(), "the API answered").toBe(200);

    // The agent checks the answer against its schema and names the field and
    // the types.
    const diagnosis = await new ApiDiagnosisAgent().diagnose({
      requestUrl,
      responseHeaders: response.headers(),
      responseSchema: "ProductsResponse",
      responseText: await response.text(),
      scenario,
      status: response.status(),
    });
    fact("root cause", diagnosis.rootCause);
    fact("fields that drifted", diagnosis.schemaMismatches.length);

    expect(diagnosis.rootCause.field, "the field").toBe("products[0].price");
    expect(diagnosis.rootCause.expectedType, "what the schema says").toBe(
      "number",
    );
    expect(diagnosis.rootCause.receivedType, "what came").toBe("string");
    expect(diagnosis.classification.category, "classed as drift").toBe(
      "api-contract-drift",
    );

    // What goes in the report.
    report.evidence = {
      classification: diagnosis.classification,
      explanation: diagnosis.explanation,
      patchProposal: diagnosis.patchProposal,
      requestUrl,
      responseHeaders: diagnosis.responseHeaders,
      rootCause: diagnosis.rootCause,
      schemaMismatches: diagnosis.schemaMismatches.slice(0, 3),
      status: diagnosis.status,
    };
    report.agentDecision = diagnosis.agentDecision;
    report.finalStatus = "diagnosed";
    report.suggestedPermanentFix = diagnosis.suggestion;
    report.engine = diagnosis.engine;
  } catch (error) {
    // Any failure is recorded in the report, then thrown on after it is written.
    scenarioError = error;
    report.finalStatus = "failed";
    report.agentDecision ||=
      "The API diagnosis scenario failed before the RCA was produced.";
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
