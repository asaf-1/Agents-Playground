/** Playwright's test tools, with the [RESULT] block printed after every test. */
import {
  expect,
  expected,
  fact,
  test,
} from "../../../framework/fixtures/resultBlock";
/** The policy engine under test: which recovery actions are allowed where. */
import { PolicyEngine } from "../../../framework/orchestrator/PolicyEngine";
/** The shapes of a classified failure and of a recovery strategy. */
import type { FailureClassification } from "../../../framework/agents/diagnosis/types";
import type { RecoveryStrategy } from "../../../framework/agents/recovery/types";

/** A stale-locator failure the classifier is sure about. */
const strongUiClassification: FailureClassification = {
  category: "ui-missing-locator",
  confidence: 0.94,
  explanation: "Stale selector pattern matched deterministic classifier rules.",
  signals: [
    'stale-selector:button:has-text("Add Member")',
    "target-type:button",
  ],
};

/** The same kind of failure, but the classifier is unsure (below 0.70). */
const lowConfidenceUiClassification: FailureClassification = {
  category: "ui-missing-locator",
  confidence: 0.62,
  explanation:
    "Signals are incomplete and should not auto-mitigate without review.",
  signals: ["stale-selector:unknown"],
};

/** A locator heal for the stale "Add Member" button. */
function buildLocatorHealStrategy(): RecoveryStrategy {
  return {
    kind: "locator-heal",
    request: {
      action: "click",
      intentTokens: ["add", "user", "create", "new"],
      staleSelector: 'button:has-text("Add Member")',
      targetType: "button",
    },
  };
}

/** In QA, with a confident classification, both strategies are approved. */
test("allows QA locator healing with strong classifier confidence", async () => {
  expected(
    "environment qa, auto-mitigation allowed, approved [locator-heal, extend-wait], none blocked",
  );
  const engine = new PolicyEngine();
  const plan = engine.evaluateStrategies({
    classification: strongUiClassification,
    environment: "qa",
    strategies: [
      buildLocatorHealStrategy(),
      {
        kind: "extend-wait",
        selector: "[data-testid='user-table']",
      },
    ],
  });
  fact("approved", plan.approvedStrategies.length);

  expect(plan.environment).toBe("qa");
  expect(plan.autoMitigationAllowed).toBe(true);
  expect(plan.approvedStrategies.map((strategy) => strategy.kind)).toEqual([
    "locator-heal",
    "extend-wait",
  ]);
  expect(plan.blockedStrategies).toEqual([]);
});

/** In production, clicking a healed target and repeating a UI action are both denied. */
test("blocks interactive UI recovery strategies in production by default", async () => {
  expected(
    "environment production, no auto-mitigation, nothing approved; locator-heal and refresh-and-retry denied, each with its reason",
  );
  const engine = new PolicyEngine();
  const plan = engine.evaluateStrategies({
    classification: strongUiClassification,
    environment: "production",
    strategies: [
      buildLocatorHealStrategy(),
      {
        kind: "refresh-and-retry",
        successSelector: "[data-testid='user-form']",
        triggerTestId: "add-user-button",
      },
    ],
  });
  fact("blocked", plan.blockedStrategies.length);

  expect(plan.environment).toBe("production");
  expect(plan.autoMitigationAllowed).toBe(false);
  expect(plan.approvedStrategies).toEqual([]);
  expect(plan.blockedStrategies).toEqual([
    {
      approvalRequired: false,
      autoMitigationAllowed: false,
      decision: "deny",
      explanation: "Do not auto-click healed UI targets in production.",
      strategy: "locator-heal",
    },
    {
      approvalRequired: false,
      autoMitigationAllowed: false,
      decision: "deny",
      explanation: "Do not auto-repeat stateful UI interactions in production.",
      strategy: "refresh-and-retry",
    },
  ]);
});

/**
 * An unsure classification needs a person's approval even in QA; a reversible
 * feature-flag switch-off is allowed in production.
 */
test("requires approval when runtime confidence is below the auto-mitigation threshold", async () => {
  expected(
    "QA at 0.62 confidence: locator-heal needs approval (below 0.70); production feature-flag-disable: allow",
  );
  const engine = new PolicyEngine();
  // QA, unsure.
  const qaPlan = engine.evaluateStrategies({
    classification: lowConfidenceUiClassification,
    environment: "qa",
    strategies: [buildLocatorHealStrategy()],
  });
  // Production, a reversible action.
  const productionAction = engine.evaluate({
    action: "feature-flag-disable",
    classification: strongUiClassification,
    environment: "production",
    reversible: true,
  });
  fact("production", productionAction.decision);

  expect(qaPlan.autoMitigationAllowed).toBe(false);
  expect(qaPlan.blockedStrategies).toEqual([
    {
      approvalRequired: true,
      autoMitigationAllowed: false,
      decision: "approval-required",
      explanation:
        "Recover a stale UI interaction inside QA automation only. Classification confidence 0.62 is below the 0.70 threshold.",
      strategy: "locator-heal",
    },
  ]);
  expect(productionAction.decision).toBe("allow");
  expect(productionAction.autoMitigationAllowed).toBe(true);
});
