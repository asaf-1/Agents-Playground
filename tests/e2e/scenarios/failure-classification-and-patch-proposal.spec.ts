import { ApiDiagnosisAgent } from "../../../framework/agents/diagnosis/ApiDiagnosisAgent";
import { FailureClassifier } from "../../../framework/agents/diagnosis/FailureClassifier";
import { PatchProposalAgent } from "../../../framework/agents/diagnosis/PatchProposalAgent";
import { typeMismatchCreateUserPayload } from "../../../framework/data/scenarioPayloads";
import { PageValidationAgent } from "../../../framework/agents/validation/PageValidationAgent";
import { productPageContract } from "../../../framework/agents/validation/contracts";
import { expect, test } from "../../../framework/fixtures/baseTest";

test("classifies UI render failures and API contract drift and produces deterministic patch proposals", async ({
  page,
  productPage,
  request
}) => {
  const classifier = new FailureClassifier();
  const patchProposalAgent = new PatchProposalAgent();

  await productPage.goto("sku-123", "broken");
  const validation = await new PageValidationAgent(page).validateContract(productPageContract);
  const validationEvidence = validation.evidence as Record<string, any>;
  const uiClassification = classifier.classify({
    errorMessage: validation.explanation,
    forbiddenTextMatches: validationEvidence.forbiddenTextMatches,
    invalidNumericFields: validationEvidence.invalidNumericFields,
    missingElements: validationEvidence.missingElements,
    overlapPairs: validationEvidence.overlapPairs
  });
  const uiPatchProposal = patchProposalAgent.propose({
    classification: uiClassification,
    forbiddenTextMatches: validationEvidence.forbiddenTextMatches,
    invalidNumericFields: validationEvidence.invalidNumericFields,
    pageLabel: "Product Page",
    scenario: "failure-classification-and-patch-proposal"
  });

  expect(uiClassification.category).toBe("ui-contract-or-render");
  expect(uiPatchProposal.qaAutoMitigationEligible).toBeTruthy();
  expect(uiPatchProposal.likelyFileTargets).toContain("public/product.js");

  const response = await request.post("/api/create-user", {
    data: typeMismatchCreateUserPayload
  });
  const diagnosis = await new ApiDiagnosisAgent().diagnose({
    requestBody: typeMismatchCreateUserPayload,
    responseHeaders: response.headers(),
    responseText: await response.text(),
    status: response.status()
  });

  expect(diagnosis.classification.category).toBe("api-contract-drift");
  expect(diagnosis.patchProposal.qaAutoMitigationEligible).toBeFalsy();
  expect(diagnosis.patchProposal.likelyFileTargets).toContain("server.js");
});
