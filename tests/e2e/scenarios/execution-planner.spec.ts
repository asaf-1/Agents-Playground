import { expect, test } from "@playwright/test";
import { AgentRegistry } from "../../../framework/orchestrator/AgentRegistry";
import { ExecutionPlanner } from "../../../framework/orchestrator/ExecutionPlanner";
import { PolicyEngine } from "../../../framework/orchestrator/PolicyEngine";
import { userManagerPageContract } from "../../../framework/agents/validation/contracts";
import type { FailureClassification } from "../../../framework/agents/diagnosis/types";
import type { RecoveryStrategy } from "../../../framework/agents/recovery/types";

const locatorClassification: FailureClassification = {
  category: "ui-missing-locator",
  confidence: 0.94,
  explanation: "Stale selector pattern matched the deterministic UI rules.",
  signals: ["stale-selector:data-testid=add-user-btn", "target-type:button"],
};

const apiTimeoutClassification: FailureClassification = {
  category: "api-timeout",
  confidence: 0.96,
  explanation: "Orders request timed out before the response returned.",
  signals: ["response-status:503", "request-url:/api/orders"],
};

const locatorStrategies: RecoveryStrategy[] = [
  {
    kind: "contract-recheck",
    contract: userManagerPageContract,
  },
  {
    kind: "locator-heal",
    request: {
      action: "click",
      intentTokens: ["add", "user", "create", "new"],
      staleSelector: 'button:has-text("Add Member")',
      targetType: "button",
    },
  },
];

test("orders recovery strategies and worker steps for stale-locator incidents", async () => {
  const registry = new AgentRegistry();
  const policyEngine = new PolicyEngine();
  const planner = new ExecutionPlanner();
  const policy = policyEngine.evaluateStrategies({
    classification: locatorClassification,
    environment: "qa",
    strategies: locatorStrategies,
  });
  const plan = planner.build({
    agentChain: registry.lookup(locatorClassification.category),
    classification: locatorClassification,
    policy,
    requestedStrategies: locatorStrategies,
  });

  expect(plan.canAttemptRecovery).toBe(true);
  expect(plan.requiresValidation).toBe(true);
  expect(plan.strategyOrder).toEqual(["locator-heal", "contract-recheck"]);
  expect(plan.plannedAgentSteps.map((step) => step.agent)).toEqual([
    "classify",
    "evidence-collect",
    "locator-heal",
    "contract-recheck",
    "validate",
    "memory-record",
  ]);
});

test("keeps diagnosis-only chains from attempting UI recovery", async () => {
  const registry = new AgentRegistry();
  const policyEngine = new PolicyEngine();
  const planner = new ExecutionPlanner();
  const policy = policyEngine.evaluateStrategies({
    classification: apiTimeoutClassification,
    environment: "qa",
    strategies: [
      {
        kind: "locator-heal",
        request: {
          action: "click",
          intentTokens: ["refresh", "orders"],
          staleSelector: "button#refresh-orders-old",
          targetType: "button",
        },
      },
    ],
  });
  const plan = planner.build({
    agentChain: registry.lookup(apiTimeoutClassification.category),
    classification: apiTimeoutClassification,
    policy,
    requestedStrategies: policy.approvedStrategies,
  });

  expect(plan.canAttemptRecovery).toBe(false);
  expect(plan.strategyOrder).toEqual([]);
  expect(plan.escalationReason).toContain("diagnosis-only");
  expect(plan.plannedAgentSteps.map((step) => step.agent)).toEqual([
    "classify",
    "evidence-collect",
    "api-diagnose",
    "patch-propose",
    "memory-record",
  ]);
});
