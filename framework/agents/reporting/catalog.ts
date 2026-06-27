import type { ScenarioBugDefinition } from "./types";

export const scenarioBugCatalog: ScenarioBugDefinition[] = [
  {
    allowedFinalStatuses: ["diagnosed", "failed"],
    confirmation: {
      actualResult:
        "The create-user route still returns a 500 typed contract failure when phone_number is sent as a string.",
      body: {
        phone_number: "0541234567",
      },
      expectedFailureStatus: 500,
      expectedJsonFields: [
        { path: "problem.field", value: "phone_number" },
        { path: "problem.expectedType", value: "integer" },
        { path: "problem.receivedType", value: "string" },
      ],
      expectedResult:
        "The API should reject invalid phone_number input with a stable contract boundary instead of a server error.",
      kind: "api-response",
      method: "POST",
      pageLabel: "/api/create-user",
      path: "/api/create-user",
      signatureKey: "api-create-user-phone-number-type-mismatch",
      steps: [
        "POST /api/create-user with phone_number sent as a string value.",
        "Inspect the response status and problem payload.",
        "Observe whether the route still throws a server-side type mismatch.",
      ],
    },
    defaultPriority: "P2",
    defaultSeverity: "S2",
    notes:
      "This is a real product bug candidate because the live route returns a server error for invalid client input.",
    productBugCandidate: true,
    scenario: "api-error-diagnosis",
    title: "Create-user phone_number type mismatch returns 500",
  },
  {
    allowedFinalStatuses: ["validated", "failed"],
    buildFailureInput(report) {
      const brokenState =
        (report.evidence as Record<string, any>).brokenState || {};
      const evidence = (brokenState.evidence as Record<string, any>) || {};

      return {
        errorMessage: report.initialFailure,
        forbiddenTextMatches: Array.isArray(evidence.forbiddenTextMatches)
          ? evidence.forbiddenTextMatches
          : [],
        invalidNumericFields: Array.isArray(evidence.invalidNumericFields)
          ? evidence.invalidNumericFields
          : [],
        overlapPairs: Array.isArray(evidence.overlapPairs)
          ? evidence.overlapPairs
          : [],
      };
    },
    confirmation: {
      actualResult:
        "The broken product page still renders malformed content, including NaN, undefined, or overlapping buy-box layout.",
      contractName: "product-page",
      expectedIssueTokens: [
        "not a finite number",
        "undefined token",
        "NaN token",
        "Visual overlap detected",
      ],
      expectedResult:
        "The product page should render valid product content without malformed numeric output, undefined copy, or visual overlap.",
      kind: "contract-failure",
      pageLabel: "Product Page",
      path: "/product/sku-123?state=broken",
      signatureKey: "product-broken-state-render-contract",
      steps: [
        "Open /product/sku-123?state=broken.",
        "Allow the runtime payload to render on the page.",
        "Validate the product contract for numeric output, forbidden tokens, and overlap.",
      ],
    },
    defaultPriority: "P2",
    defaultSeverity: "S2",
    notes:
      "This scenario already proves a product-side render defect and should remain bug-trackable even though it is an intentional demo branch.",
    productBugCandidate: true,
    scenario: "dynamic-content-validation",
    title: "Broken product state violates the render contract",
  },
  {
    allowedFinalStatuses: ["recovered", "failed"],
    confirmation: {
      actualResult:
        "The dashboard still fails to render orders rows on the first flaky-mode load and falls into the retryable error state.",
      errorHintTestId: "orders-error",
      expectedResult:
        "The dashboard should load orders rows on the first page visit without requiring a manual refresh path.",
      expectation: {
        kind: "testid",
        value: "orders-row",
      },
      kind: "page-expectation",
      pageLabel: "Orders Recovery Dashboard",
      path: "/dashboard?mode=flaky",
      settleMs: 1600,
      signatureKey: "dashboard-flaky-first-load-orders-row-missing",
      steps: [
        "Open /dashboard?mode=flaky.",
        "Wait for the initial orders request to finish without clicking Refresh data.",
        "Check whether any orders rows rendered on the first page load.",
      ],
    },
    defaultPriority: "P2",
    defaultSeverity: "S2",
    notes:
      "This is the self-healed product bug path: the scenario can recover through refresh, but the first page load is still broken and should be reported.",
    productBugCandidate: true,
    scenario: "flaky-network-recovery",
    title: "Flaky dashboard mode fails before retry recovery",
  },
  {
    allowedFinalStatuses: ["failed", "recovered"],
    confirmation: {
      actualResult:
        "The page still does not show the expected subtitle text even though the scenario artifact claimed a missing-text defect.",
      expectedResult: "The product summary text should be visible on the page.",
      expectation: {
        kind: "text",
        value: "Dynamic product output backed by the local validation API.",
      },
      kind: "page-expectation",
      pageLabel: "Product Page",
      path: "/product/sku-123?state=valid",
      settleMs: 800,
      signatureKey: "synthetic-non-reproducible-valid-product-summary",
      steps: [
        "Open /product/sku-123?state=valid.",
        "Wait for the valid product payload to render.",
        "Check whether the product summary text is visible.",
      ],
    },
    defaultPriority: "P3",
    defaultSeverity: "S3",
    notes:
      "This entry exists for standalone validation only and should not create a bug because the current product page renders the expected summary text.",
    productBugCandidate: true,
    scenario: "synthetic-non-reproducible-valid-product-summary",
    title: "Synthetic non-reproducible product summary defect",
  },
];

export function getScenarioBugDefinition(
  scenario: string,
  extraEntries: ScenarioBugDefinition[] = [],
) {
  return (
    [...scenarioBugCatalog, ...extraEntries].find(
      (entry) => entry.scenario === scenario,
    ) || null
  );
}
