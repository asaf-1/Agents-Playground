/** The agents under test: API diagnosis, failure classification, patch proposals. */
import { ApiDiagnosisAgent } from "../../../framework/agents/diagnosis/ApiDiagnosisAgent";
import { FailureClassifier } from "../../../framework/agents/diagnosis/FailureClassifier";
import { PatchProposalAgent } from "../../../framework/agents/diagnosis/PatchProposalAgent";
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
/** Arms a planted bug for one runKey, and makes a runKey of the test's own. */
import { armFlags } from "../../../framework/helpers/flags";
import { uniqueRunKey } from "../../../framework/helpers/bank";

/**
 * The bank's broken product page (the test flag productRenderBroken) is
 * classed as a UI render problem with a fix the QA pipeline may apply; the
 * products price drift (the planted productSchemaDrift) is classed as contract
 * drift with a fix it may not. (Until 2026-11-20 this ran on the original demo
 * site's product page and create-user API.)
 */
test("classifies UI render failures and API contract drift and produces deterministic patch proposals", async ({
  page,
  productPage,
  request,
}) => {
  expected(
    "UI: ui-contract-or-render, auto-mitigation eligible, targets web/src/pages/ProductDetailPage.tsx; API: api-contract-drift, not eligible, targets server.js",
  );
  const classifier = new FailureClassifier();
  const patchProposalAgent = new PatchProposalAgent();
  const runKey = uniqueRunKey("failure-classification");
  await armFlags(request, runKey, {
    productRenderBroken: true,
    productSchemaDrift: true,
  });

  try {
    await test.step("the broken product page: check, class, propose", async () => {
      const catalogue = await (await request.get("/api/products")).json();
      await productPage.goto(catalogue.products[0].id, runKey);
      await expect(
        productPage.price,
        "the broken price has drawn",
      ).toContainText("NaN");
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

      expect(uiClassification.category, "a render problem").toBe(
        "ui-contract-or-render",
      );
      expect(
        uiPatchProposal.qaAutoMitigationEligible,
        "QA may mitigate it",
      ).toBe(true);
      expect(uiPatchProposal.likelyFileTargets, "the bank's page").toContain(
        "web/src/pages/ProductDetailPage.tsx",
      );
    });

    await test.step("the products price drift: diagnose it", async () => {
      const requestUrl = `/api/products?runKey=${encodeURIComponent(runKey)}`;
      const response = await request.get(requestUrl);
      const diagnosis = await new ApiDiagnosisAgent().diagnose({
        requestUrl,
        responseHeaders: response.headers(),
        responseSchema: "ProductsResponse",
        responseText: await response.text(),
        scenario: "failure-classification-and-patch-proposal",
        status: response.status(),
      });
      fact("api class", diagnosis.classification.category);
      fact("api targets", diagnosis.patchProposal.likelyFileTargets);

      expect(diagnosis.classification.category, "contract drift").toBe(
        "api-contract-drift",
      );
      expect(
        diagnosis.patchProposal.qaAutoMitigationEligible,
        "QA may not work around it",
      ).toBe(false);
      expect(
        diagnosis.patchProposal.likelyFileTargets,
        "the route that sends it",
      ).toContain("server.js");
    });
  } finally {
    await request.delete(
      `/api/test/flags?runKey=${encodeURIComponent(runKey)}`,
    );
  }
});
