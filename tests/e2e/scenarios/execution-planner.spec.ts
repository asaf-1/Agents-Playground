/** Playwright's test tools, with the [RESULT] block printed after every test. */
import {
  expect,
  expected,
  fact,
  test,
} from "../../../framework/fixtures/resultBlock";
/** The orchestrator's parts: who handles a failure, what is allowed, and in what order. */
import { AgentRegistry } from "../../../framework/orchestrator/AgentRegistry";
import { ExecutionPlanner } from "../../../framework/orchestrator/ExecutionPlanner";
import { PolicyEngine } from "../../../framework/orchestrator/PolicyEngine";
/** The User Manager page's contract. */
import { userManagerPageContract } from "../../../framework/agents/validation/contracts";
/** The shapes of a classified failure and of a recovery strategy. */
import type { FailureClassification } from "../../../framework/agents/diagnosis/types";
import type { RecoveryStrategy } from "../../../framework/agents/recovery/types";

/** A stale button selector, classed with high confidence. */
const locatorClassification: FailureClassification = {
  category: "ui-missing-locator",
  confidence: 0.94,
  explanation: "Stale selector pattern matched the deterministic UI rules.",
  signals: ["stale-selector:data-testid=add-user-btn", "target-type:button"],
};

/** An orders request that timed out, classed with high confidence. */
const apiTimeoutClassification: FailureClassification = {
  category: "api-timeout",
  confidence: 0.96,
  explanation: "Orders request timed out before the response returned.",
  signals: ["response-status:503", "request-url:/api/orders"],
};

/** Two strategies offered for the stale locator, in the "wrong" order on purpose. */
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

/**
 * For a stale locator in QA, the plan may recover, heals first, re-checks the
 * contract second, and lists the worker steps in order.
 */
test("orders recovery strategies and worker steps for stale-locator incidents", async () => {
  expected(
    "can attempt recovery, needs validation; strategies locator-heal then contract-recheck; steps classify, evidence-collect, locator-heal, contract-recheck, validate, memory-record",
  );
  // Approve the strategies under the QA policy, then plan.
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
  fact("order", plan.strategyOrder);

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

/**
 * An API timeout is diagnosis-only: no UI recovery is attempted, and the
 * plan says why.
 */
test("keeps diagnosis-only chains from attempting UI recovery", async () => {
  expected(
    "cannot attempt recovery; no strategies; escalation says diagnosis-only; steps classify, evidence-collect, api-diagnose, patch-propose, memory-record",
  );
  // Offer a locator heal for an API timeout, then plan with what the policy approves.
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
  fact("escalation", plan.escalationReason);

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
