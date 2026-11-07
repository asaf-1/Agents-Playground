/** The agent under test: it explains why an API call failed. */
import { ApiDiagnosisAgent } from "../../../framework/agents/diagnosis/ApiDiagnosisAgent";
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
 * A string phone number makes create-user answer 500; the diagnosis agent
 * finds the field and the types, and the report and trace are saved.
 */
test("diagnoses the create-user phone number type mismatch", async ({
  context,
  homePage,
  page,
  request,
}) => {
  expected(
    "create-user 500; root cause phone_number, expected integer, received string; report status diagnosed",
  );
  // A report for this scenario, and the bad request body.
  const scenario = "api-error-diagnosis";
  const report = createScenarioReport(scenario);
  const requestBody = {
    phone_number: "0541234567",
  };
  let scenarioError: unknown;

  await startScenarioTrace(context);

  try {
    // Send the phone number as a string: the server answers 500.
    await homePage.goto();
    const response = await request.post("/api/create-user", {
      data: requestBody,
    });

    report.initialFailure =
      "POST /api/create-user returned 500 for a string phone_number payload.";

    expect(response.status()).toBe(500);

    // The agent reads the answer and names the field and the types.
    const diagnosis = await new ApiDiagnosisAgent().diagnose({
      requestBody,
      responseHeaders: response.headers(),
      responseText: await response.text(),
      status: response.status(),
    });
    fact("root cause", diagnosis.rootCause);

    expect(diagnosis.rootCause.field).toBe("phone_number");
    expect(diagnosis.rootCause.expectedType).toBe("integer");
    expect(diagnosis.rootCause.receivedType).toBe("string");

    // What goes in the report.
    report.evidence = {
      classification: diagnosis.classification,
      explanation: diagnosis.explanation,
      patchProposal: diagnosis.patchProposal,
      requestBody,
      responseBody: diagnosis.responseBody,
      responseHeaders: diagnosis.responseHeaders,
      rootCause: diagnosis.rootCause,
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
