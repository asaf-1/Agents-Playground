// The known scenario bugs: for each scenario that can find a bank bug, how to
// confirm the bug again from scratch, and its default severity and priority.
// The bug-reporting agent reads this list. The bank's faults are off until
// armed, so each entry that confirms one names the flags to arm: every
// confirmation run arms them under a fresh runKey of its own and clears them
// after.

// The shape of one entry.
import type { ScenarioBugDefinition } from "./types";

// A gear-shop product every bank seeds (sku-001 to sku-048).
const PRODUCT_ID = "sku-001";

// Four entries, one per scenario.
export const scenarioBugCatalog: ScenarioBugDefinition[] = [
  // The planted fault productSchemaDrift: GET /api/products sends each price
  // as text, while ProductsResponse in bank/openapi.json says a number.
  // Confirmed by calling the API again and checking the type of a price.
  {
    allowedFinalStatuses: ["diagnosed", "failed"],
    confirmation: {
      actualResult:
        "GET /api/products still answers each price as text, which breaks the ProductsResponse schema the API publishes.",
      arm: { productSchemaDrift: true },
      expectedFailureStatus: 200,
      expectedJsonFields: [{ path: "products.0.price", type: "string" }],
      expectedResult:
        "Every price in GET /api/products should be a number, as ProductsResponse in bank/openapi.json promises.",
      kind: "api-response",
      method: "GET",
      pageLabel: "GET /api/products",
      path: "/api/products",
      responseSchema: "ProductsResponse",
      signatureKey: "api-products-price-schema-drift",
      steps: [
        "Arm productSchemaDrift for a runKey of your own.",
        "GET /api/products with that runKey.",
        "Check the type of each price against ProductsResponse in bank/openapi.json.",
      ],
    },
    defaultPriority: "P2",
    defaultSeverity: "S2",
    notes:
      "A planted REPORT fault: the page prints the price the same either way, so only a schema check or arithmetic catches it.",
    productBugCandidate: true,
    scenario: "api-error-diagnosis",
    title: "GET /api/products sends price as text, breaking its schema",
  },
  // The AI agents' broken product state (the test flag productRenderBroken):
  // a NaN price drawn over the buy area. Confirmed by checking the page again;
  // the failure's signals come from the scenario's report.
  {
    allowedFinalStatuses: ["validated", "failed"],
    // The failure's signals, read from the broken state's evidence in the
    // report.
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
        "The broken product page still renders a NaN price drawn over the buy area.",
      arm: { productRenderBroken: true },
      contractName: "product-page",
      expectedIssueTokens: [
        "not a finite number",
        "NaN token",
        "Visual overlap detected",
      ],
      expectedResult:
        "The product page should render a real price, with nothing drawn over the buy area.",
      kind: "contract-failure",
      pageLabel: "Product Page",
      path: `/app/products/${PRODUCT_ID}`,
      signatureKey: "product-broken-state-render-contract",
      steps: [
        "Arm productRenderBroken for a runKey of your own.",
        `Open /app/products/${PRODUCT_ID} with that runKey.`,
        "Validate the product contract for numeric output, forbidden tokens, and overlap.",
      ],
    },
    defaultPriority: "P2",
    defaultSeverity: "S2",
    notes:
      "An intentional demo branch for the AI agents, armed per runKey only, and bug-trackable on purpose.",
    productBugCandidate: true,
    scenario: "dynamic-content-validation",
    title: "Broken product state violates the render contract",
  },
  // The orders outage in the flaky-network scenario is injected by the test in
  // the browser, and the bank's orders page retries once by itself, so there
  // is nothing on the site to file: automation-only.
  {
    allowedFinalStatuses: ["recovered", "failed"],
    confirmation: {
      actualResult:
        "The orders page did not show its orders after the outage the scenario injected.",
      expectation: { kind: "testid", value: "orders-table" },
      expectedResult: "The orders page shows its orders.",
      kind: "page-expectation",
      pageLabel: "Orders",
      path: "/app/orders",
      signatureKey: "orders-injected-outage",
      steps: ["Open /app/orders.", "Check that the orders table is shown."],
    },
    notes:
      "Automation-only: the outage is injected by the test, and the page's own retry recovers a single failure.",
    productBugCandidate: false,
    scenario: "flaky-network-recovery",
    title: "Orders outage injected by the flaky-network scenario",
  },
  // A made-up bug that does not reproduce, so the agent's "unconfirmed" path
  // can be tested: the product page does show its line about fake dollars.
  {
    allowedFinalStatuses: ["failed", "recovered"],
    confirmation: {
      actualResult:
        "The page still does not show the expected line even though the scenario artifact claimed a missing-text defect.",
      expectedResult: "The product page's line about fake dollars is visible.",
      expectation: {
        kind: "text",
        value: "A simulated product for testing practice.",
      },
      kind: "page-expectation",
      pageLabel: "Product Page",
      path: `/app/products/${PRODUCT_ID}`,
      settleMs: 800,
      signatureKey: "synthetic-non-reproducible-product-line",
      steps: [
        `Open /app/products/${PRODUCT_ID}.`,
        "Wait for the product to render.",
        "Check whether the line about fake dollars is visible.",
      ],
    },
    defaultPriority: "P3",
    defaultSeverity: "S3",
    notes:
      "This entry exists for standalone validation only and should not create a bug because the product page renders the line.",
    productBugCandidate: true,
    scenario: "synthetic-non-reproducible-valid-product-summary",
    title: "Synthetic non-reproducible product line defect",
  },
];

// The entry for a scenario, from this list or the extra entries a test gives;
// null when there is none.
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
