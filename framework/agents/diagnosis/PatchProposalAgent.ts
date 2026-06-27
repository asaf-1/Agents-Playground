import type {
  FailureCategory,
  FailureClassification,
  PatchProposal,
  PatchProposalRequest,
} from "./types";

const validationPlanByCategory: Record<FailureCategory, string[]> = {
  "api-client-error": [
    "Run the affected API contract coverage.",
    "Re-send the request with a corrected payload shape.",
    "Run the full Playwright suite.",
  ],
  "api-contract-drift": [
    "Reproduce the failing API request with the current payload.",
    "Update the client or server contract to agree on field typing.",
    "Run API diagnosis and the full Playwright suite.",
  ],
  "api-server-error": [
    "Reproduce the failing route locally.",
    "Inspect the route handler and payload parsing path.",
    "Run API contract coverage and the full Playwright suite.",
  ],
  "api-timeout": [
    "Re-run the affected route with the same timeout settings.",
    "Confirm retryability, timeout budgets, and upstream latency signals.",
    "Run the full Playwright suite.",
  ],
  "auth-or-session": [
    "Reproduce the failure with a clean session and the same route access.",
    "Inspect auth guards, redirect behavior, and session expiry handling.",
    "Run the full Playwright suite.",
  ],
  "permissions-or-rbac": [
    "Reproduce the denied action with the same role configuration.",
    "Inspect role-to-route checks and denied-state rendering.",
    "Run the full Playwright suite.",
  ],
  "ui-contract-or-render": [
    "Revalidate the page contract after the UI or data fix.",
    "Run the relevant scenario coverage for the affected page.",
    "Run the full Playwright suite.",
  ],
  "ui-delayed-data": [
    "Re-run the delayed-data scenario and confirm bounded wait behavior.",
    "Inspect request timing, rendering thresholds, and fallback states.",
    "Run the full Playwright suite.",
  ],
  "ui-empty-state": [
    "Re-run the empty-state path and confirm whether data should have been present.",
    "Inspect fetch timing, filtering logic, and refresh behavior.",
    "Run the full Playwright suite.",
  ],
  "ui-loading-or-network": [
    "Re-run the flaky or slow scenario path.",
    "Validate the request lifecycle and retry branch.",
    "Run the full Playwright suite.",
  ],
  "ui-missing-locator": [
    "Re-run the stale-locator scenario.",
    "Update the page object or selector contract to match the live DOM.",
    "Run the full Playwright suite.",
  ],
  "ui-modal-not-opened": [
    "Re-run the modal path and confirm the opener or dialog state.",
    "Update the modal trigger, dialog state, or fallback healing rules.",
    "Run the full Playwright suite.",
  ],
  "ui-route-or-navigation": [
    "Re-run the navigation flow and confirm the expected destination URL.",
    "Inspect route wiring, data-target values, and destination page contracts.",
    "Run the full Playwright suite.",
  ],
  unknown: [
    "Capture a fresh failure artifact.",
    "Add a new deterministic classification or recovery rule if the pattern repeats.",
    "Run the full Playwright suite.",
  ],
};

export class PatchProposalAgent {
  propose(
    input: PatchProposalRequest & { classification: FailureClassification },
  ): PatchProposal {
    const category = input.classification.category;

    switch (category) {
      case "ui-missing-locator":
        return {
          classification: category,
          likelyFileTargets: [
            "framework/pom/HomePage.ts",
            "framework/agents/recovery/GenericLocatorHealer.ts",
            "public/index.html",
          ],
          likelyFixArea: input.pageLabel || "UI locator contract",
          qaAutoMitigationEligible: true,
          recommendedPermanentFixDirection:
            "Update the page object or selector contract to target durable data-testid, label, role, or row-context signals instead of stale text-only selectors.",
          validationPlan: validationPlanByCategory[category],
        };

      case "ui-loading-or-network":
      case "ui-delayed-data":
      case "ui-empty-state":
        return {
          classification: category,
          likelyFileTargets: [
            "public/dashboard.js",
            "server.js",
            "framework/agents/recovery/RecoveryRouter.ts",
          ],
          likelyFixArea:
            "request lifecycle, retry handling, and delayed data rendering",
          qaAutoMitigationEligible: true,
          recommendedPermanentFixDirection:
            "Stabilize the request lifecycle so loading, empty-state, delayed-data, and retryable failure paths all produce predictable state transitions.",
          validationPlan: validationPlanByCategory[category],
        };

      case "ui-modal-not-opened":
        return {
          classification: category,
          likelyFileTargets: [
            "public/user-manager.html",
            "framework/agents/recovery/GenericLocatorHealer.ts",
            "framework/pom/UserManagerPage.ts",
          ],
          likelyFixArea: input.pageLabel || "modal trigger and dialog contract",
          qaAutoMitigationEligible: true,
          recommendedPermanentFixDirection:
            "Stabilize the modal opener, dialog visibility rules, and dialog-scoped selector contracts so the intended modal path becomes durable without relying on fallback healing.",
          validationPlan: validationPlanByCategory[category],
        };

      case "ui-route-or-navigation":
        return {
          classification: category,
          likelyFileTargets: [
            "public/app.js",
            "framework/pom/HomePage.ts",
            "tests/e2e/scenarios/generic-self-healing.spec.ts",
          ],
          likelyFixArea: "navigation target wiring",
          qaAutoMitigationEligible: true,
          recommendedPermanentFixDirection:
            "Align the route target, page-object intent, and destination contract so the expected navigation branch is explicit and durable.",
          validationPlan: validationPlanByCategory[category],
        };

      case "ui-contract-or-render":
        return {
          classification: category,
          likelyFileTargets: [
            "framework/agents/validation/PageValidationAgent.ts",
            "public/product.js",
            "public/styles.css",
          ],
          likelyFixArea: input.pageLabel || "page render contract",
          qaAutoMitigationEligible: true,
          recommendedPermanentFixDirection:
            "Fix the render path or data normalization so required elements, numeric fields, text content, and layout constraints all satisfy the page contract.",
          validationPlan: validationPlanByCategory[category],
        };

      case "auth-or-session":
        return {
          classification: category,
          likelyFileTargets: [
            "server.js",
            "framework/agents/diagnosis/FailureClassifier.ts",
          ],
          likelyFixArea: input.apiRoute || "auth and session guard path",
          qaAutoMitigationEligible: false,
          recommendedPermanentFixDirection:
            "Fix the auth or session guard so expected routes either keep a valid session or render a deterministic redirect or login path with clear state.",
          validationPlan: validationPlanByCategory[category],
        };

      case "permissions-or-rbac":
        return {
          classification: category,
          likelyFileTargets: ["server.js", "public/user-manager.html"],
          likelyFixArea: input.apiRoute || "permission and role checks",
          qaAutoMitigationEligible: false,
          recommendedPermanentFixDirection:
            "Align role checks, denied-state rendering, and route permissions so the intended role can complete the action or receives an explicit deterministic denial path.",
          validationPlan: validationPlanByCategory[category],
        };

      case "api-client-error":
        return {
          classification: category,
          likelyFileTargets: [
            "framework/data/scenarioPayloads.ts",
            "tests/e2e/contracts/api-contract-governance.spec.ts",
          ],
          likelyFixArea: input.apiRoute || "API request payload formation",
          qaAutoMitigationEligible: false,
          recommendedPermanentFixDirection:
            "Tighten client-side payload validation before the request is sent and align request-building helpers with the live API contract.",
          validationPlan: validationPlanByCategory[category],
        };

      case "api-timeout":
        return {
          classification: category,
          likelyFileTargets: [
            "server.js",
            "public/dashboard.js",
            "framework/agents/diagnosis/ApiDiagnosisAgent.ts",
          ],
          likelyFixArea: input.apiRoute || "timeout handling and retryability",
          qaAutoMitigationEligible: false,
          recommendedPermanentFixDirection:
            "Align timeout budgets, retryability rules, and upstream error handling so timeout failures remain explicit and recoverable without masking real outages.",
          validationPlan: validationPlanByCategory[category],
        };

      case "api-server-error":
        return {
          classification: category,
          likelyFileTargets: [
            "server.js",
            "tests/e2e/contracts/api-contract-governance.spec.ts",
          ],
          likelyFixArea: input.apiRoute || "server route behavior",
          qaAutoMitigationEligible: false,
          recommendedPermanentFixDirection:
            "Inspect the server-side route handling path, then add or tighten route-level validation and response guarantees around the failing branch.",
          validationPlan: validationPlanByCategory[category],
        };

      case "api-contract-drift":
        return {
          classification: category,
          likelyFileTargets: [
            "server.js",
            "framework/data/scenarioPayloads.ts",
            "tests/e2e/scenarios/api-error-diagnosis.spec.ts",
          ],
          likelyFixArea: input.apiRoute || "client/server contract boundary",
          qaAutoMitigationEligible: false,
          recommendedPermanentFixDirection:
            input.rootCause?.field && input.rootCause.expectedType
              ? `Align ${input.rootCause.field} to ${input.rootCause.expectedType} serialization on the client and enforce the same expectation at the server boundary.`
              : "Align the client payload typing and the server contract so both sides agree on field shape and serialization.",
          validationPlan: validationPlanByCategory[category],
        };

      default:
        return {
          classification: category,
          likelyFileTargets: [
            "framework/agents/diagnosis/FailureClassifier.ts",
            "framework/agents/recovery/RecoveryRouter.ts",
          ],
          likelyFixArea: "unclassified incident handling",
          qaAutoMitigationEligible: false,
          recommendedPermanentFixDirection:
            "Capture more evidence, add a deterministic classification rule for the new pattern, then wire a safe recovery strategy only if the pattern is repeatable.",
          validationPlan: validationPlanByCategory.unknown,
        };
    }
  }
}
