import { ApiDiagnosisAgent } from "../../../framework/agents/diagnosis/ApiDiagnosisAgent";
import {
  createScenarioReport,
  serializeError,
  startScenarioTrace,
  writeScenarioArtifacts
} from "../../../framework/reporting/scenarioArtifacts";
import { expect, test } from "../../../framework/fixtures/baseTest";

test("diagnoses the create-user phone number type mismatch", async ({
  context,
  homePage,
  page,
  request
}) => {
  const scenario = "api-error-diagnosis";
  const report = createScenarioReport(scenario);
  const requestBody = {
    phone_number: "0541234567"
  };
  let scenarioError: unknown;

  await startScenarioTrace(context);

  try {
    await homePage.goto();
    const response = await request.post("/api/create-user", {
      data: requestBody
    });

    report.initialFailure = "POST /api/create-user returned 500 for a string phone_number payload.";

    expect(response.status()).toBe(500);

    const diagnosis = await new ApiDiagnosisAgent().diagnose({
      requestBody,
      responseHeaders: response.headers(),
      responseText: await response.text(),
      status: response.status()
    });

    expect(diagnosis.rootCause.field).toBe("phone_number");
    expect(diagnosis.rootCause.expectedType).toBe("integer");
    expect(diagnosis.rootCause.receivedType).toBe("string");

    report.evidence = {
      classification: diagnosis.classification,
      explanation: diagnosis.explanation,
      patchProposal: diagnosis.patchProposal,
      requestBody,
      responseBody: diagnosis.responseBody,
      responseHeaders: diagnosis.responseHeaders,
      rootCause: diagnosis.rootCause,
      status: diagnosis.status
    };
    report.agentDecision = diagnosis.agentDecision;
    report.finalStatus = "diagnosed";
    report.suggestedPermanentFix = diagnosis.suggestion;
    report.engine = diagnosis.engine;
  } catch (error) {
    scenarioError = error;
    report.finalStatus = "failed";
    report.agentDecision ||= "The API diagnosis scenario failed before the RCA was produced.";
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
