/** The agents under test: API diagnosis, failure classification, patch proposals. */
import { ApiDiagnosisAgent } from "../../../framework/agents/diagnosis/ApiDiagnosisAgent";
import { FailureClassifier } from "../../../framework/agents/diagnosis/FailureClassifier";
import { PatchProposalAgent } from "../../../framework/agents/diagnosis/PatchProposalAgent";
/** A user whose phone number is the wrong type. */
import { typeMismatchCreateUserPayload } from "../../../framework/data/scenarioPayloads";
/** The page checker, and the product page's contract. */
import { PageValidationAgent } from "../../../framework/agents/validation/PageValidationAgent";
import { productPageContract } from "../../../framework/agents/validation/contracts";
/** Playwright's test tools with the framework's page objects and the [RESULT] block. */
import {
  expect,
  expected,
  fact,
  test,
} from "../../../framework/fixtures/appTest";

/**
 * A broken product page is classed as a UI render problem with a fix the QA
 * pipeline may apply; a type-mismatch API error is classed as contract drift
 * with a fix it may not.
 */
test("classifies UI render failures and API contract drift and produces deterministic patch proposals", async ({
  page,
  productPage,
  request,
}) => {
  expected(
    "UI: ui-contract-or-render, auto-mitigation eligible, targets public/product.js; API: api-contract-drift, not eligible, targets server.js",
  );
  const classifier = new FailureClassifier();
  const patchProposalAgent = new PatchProposalAgent();

  // The broken product page: check it, class the failure, propose a fix.
  await productPage.goto("sku-123", "broken");
  const validation = await new PageValidationAgent(page).validateContract(
    productPageContract,
  );
  const validationEvidence = validation.evidence as Record<string, any>;
  const uiClassification = classifier.classify({
    errorMessage: validation.explanation,
    forbiddenTextMatches: validationEvidence.forbiddenTextMatches,
    invalidNumericFields: validationEvidence.invalidNumericFields,
    missingElements: validationEvidence.missingElements,
    overlapPairs: validationEvidence.overlapPairs,
  });
  const uiPatchProposal = patchProposalAgent.propose({
    classification: uiClassification,
    forbiddenTextMatches: validationEvidence.forbiddenTextMatches,
    invalidNumericFields: validationEvidence.invalidNumericFields,
    pageLabel: "Product Page",
    scenario: "failure-classification-and-patch-proposal",
  });
  fact("ui class", uiClassification.category);
  fact("ui targets", uiPatchProposal.likelyFileTargets);

  expect(uiClassification.category).toBe("ui-contract-or-render");
  expect(uiPatchProposal.qaAutoMitigationEligible).toBeTruthy();
  expect(uiPatchProposal.likelyFileTargets).toContain("public/product.js");

  // The type-mismatch API call: diagnose it.
  const response = await request.post("/api/create-user", {
    data: typeMismatchCreateUserPayload,
  });
  const diagnosis = await new ApiDiagnosisAgent().diagnose({
    requestBody: typeMismatchCreateUserPayload,
    responseHeaders: response.headers(),
    responseText: await response.text(),
    status: response.status(),
  });
  fact("api class", diagnosis.classification.category);
  fact("api targets", diagnosis.patchProposal.likelyFileTargets);

  expect(diagnosis.classification.category).toBe("api-contract-drift");
  expect(diagnosis.patchProposal.qaAutoMitigationEligible).toBeFalsy();
  expect(diagnosis.patchProposal.likelyFileTargets).toContain("server.js");
});
