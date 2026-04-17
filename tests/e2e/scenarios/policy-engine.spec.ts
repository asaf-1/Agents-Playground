import { expect, test } from "@playwright/test";
import { PolicyEngine } from "../../../framework/orchestrator/PolicyEngine";
import type { FailureClassification } from "../../../framework/agents/diagnosis/types";
import type { RecoveryStrategy } from "../../../framework/agents/recovery/types";

const strongUiClassification: FailureClassification = {
  category: "ui-missing-locator",
  confidence: 0.94,
  explanation: "Stale selector pattern matched deterministic classifier rules.",
  signals: ["stale-selector:button:has-text(\"Add Member\")", "target-type:button"]
};

const lowConfidenceUiClassification: FailureClassification = {
  category: "ui-missing-locator",
  confidence: 0.62,
  explanation: "Signals are incomplete and should not auto-mitigate without review.",
  signals: ["stale-selector:unknown"]
};

function buildLocatorHealStrategy(): RecoveryStrategy {
  return {
    kind: "locator-heal",
    request: {
      action: "click",
      intentTokens: ["add", "user", "create", "new"],
      staleSelector: 'button:has-text("Add Member")',
      targetType: "button"
    }
  };
}

test("allows QA locator healing with strong classifier confidence", async () => {
  const engine = new PolicyEngine();
  const plan = engine.evaluateStrategies({
    classification: strongUiClassification,
    environment: "qa",
    strategies: [
      buildLocatorHealStrategy(),
      {
        kind: "extend-wait",
        selector: "[data-testid='user-table']"
      }
    ]
  });

  expect(plan.environment).toBe("qa");
  expect(plan.autoMitigationAllowed).toBe(true);
  expect(plan.approvedStrategies.map((strategy) => strategy.kind)).toEqual([
    "locator-heal",
    "extend-wait"
  ]);
  expect(plan.blockedStrategies).toEqual([]);
});

test("blocks interactive UI recovery strategies in production by default", async () => {
  const engine = new PolicyEngine();
  const plan = engine.evaluateStrategies({
    classification: strongUiClassification,
    environment: "production",
    strategies: [
      buildLocatorHealStrategy(),
      {
        kind: "refresh-and-retry",
        successSelector: "[data-testid='user-form']",
        triggerTestId: "add-user-button"
      }
    ]
  });

  expect(plan.environment).toBe("production");
  expect(plan.autoMitigationAllowed).toBe(false);
  expect(plan.approvedStrategies).toEqual([]);
  expect(plan.blockedStrategies).toEqual([
    {
      approvalRequired: false,
      autoMitigationAllowed: false,
      decision: "deny",
      explanation: "Do not auto-click healed UI targets in production.",
      strategy: "locator-heal"
    },
    {
      approvalRequired: false,
      autoMitigationAllowed: false,
      decision: "deny",
      explanation: "Do not auto-repeat stateful UI interactions in production.",
      strategy: "refresh-and-retry"
    }
  ]);
});

test("requires approval when runtime confidence is below the auto-mitigation threshold", async () => {
  const engine = new PolicyEngine();
  const qaPlan = engine.evaluateStrategies({
    classification: lowConfidenceUiClassification,
    environment: "qa",
    strategies: [buildLocatorHealStrategy()]
  });
  const productionAction = engine.evaluate({
    action: "feature-flag-disable",
    classification: strongUiClassification,
    environment: "production",
    reversible: true
  });

  expect(qaPlan.autoMitigationAllowed).toBe(false);
  expect(qaPlan.blockedStrategies).toEqual([
    {
      approvalRequired: true,
      autoMitigationAllowed: false,
      decision: "approval-required",
      explanation:
        "Recover a stale UI interaction inside QA automation only. Classification confidence 0.62 is below the 0.70 threshold.",
      strategy: "locator-heal"
    }
  ]);
  expect(productionAction.decision).toBe("allow");
  expect(productionAction.autoMitigationAllowed).toBe(true);
});
