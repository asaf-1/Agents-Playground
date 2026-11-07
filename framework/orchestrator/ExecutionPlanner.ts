// The execution planner: from a failure's class, its agent chain and the
// strategies the policy allowed, it builds the plan. The plan says which agents
// run, which recovery strategies to try in what order, and why. When nothing
// may be tried, it says why the incident is handed over.

// The failure, strategy, agent-chain and policy shapes.
import type {
  FailureCategory,
  FailureClassification,
} from "../agents/diagnosis/types";
import type {
  RecoveryStrategy,
  RecoveryStrategyKind,
} from "../agents/recovery/types";
import type { AgentChain, AgentStep } from "./AgentRegistry";
import type { PolicyStrategyPlan } from "./PolicyEngine";

// One agent in the plan, with why it runs.
export type PlannedAgentStep = {
  agent: AgentStep;
  reason: string;
};

// One recovery strategy in the plan, with its place in the order and why.
export type PlannedRecoveryStrategy = {
  priority: number;
  reason: string;
  strategy: RecoveryStrategy;
};

// What the planner is given.
export type ExecutionPlannerRequest = {
  agentChain: AgentChain;
  classification: FailureClassification;
  policy: PolicyStrategyPlan;
  requestedStrategies: RecoveryStrategy[];
};

// The plan.
export type ExecutionPlan = {
  canAttemptRecovery: boolean;
  escalationReason: string | null;
  plannedAgentSteps: PlannedAgentStep[];
  plannedRecoveryStrategies: PlannedRecoveryStrategy[];
  requiresValidation: boolean;
  strategyOrder: RecoveryStrategyKind[];
};

// For each kind of failure, the order its recovery strategies are tried in.
// API, auth and permission failures get none.
const strategyOrderByCategory: Record<FailureCategory, RecoveryStrategyKind[]> =
  {
    "api-client-error": [],
    "api-contract-drift": [],
    "api-server-error": [],
    "api-timeout": [],
    "auth-or-session": [],
    "permissions-or-rbac": [],
    "ui-contract-or-render": ["contract-recheck"],
    "ui-delayed-data": ["extend-wait", "refresh-and-retry", "contract-recheck"],
    "ui-empty-state": ["refresh-and-retry", "extend-wait", "contract-recheck"],
    "ui-loading-or-network": [
      "extend-wait",
      "refresh-and-retry",
      "contract-recheck",
    ],
    "ui-missing-locator": ["locator-heal", "contract-recheck"],
    "ui-modal-not-opened": ["locator-heal", "contract-recheck"],
    "ui-route-or-navigation": [
      "locator-heal",
      "refresh-and-retry",
      "contract-recheck",
    ],
    unknown: [],
  };

// Which strategies each agent stands for; agents with none always run.
const recoveryStepKinds: Record<AgentStep, RecoveryStrategyKind[]> = {
  "api-diagnose": [],
  classify: [],
  "contract-recheck": ["contract-recheck"],
  "evidence-collect": [],
  "locator-heal": ["locator-heal"],
  "memory-record": [],
  "network-recover": ["extend-wait", "refresh-and-retry"],
  "patch-propose": [],
  validate: [],
};

// Why each agent is in the plan, in words for the report.
const agentReasons: Record<AgentStep, string> = {
  "api-diagnose":
    "Diagnose API or backend evidence before proposing the fix path.",
  classify: "Start with deterministic failure classification.",
  "contract-recheck":
    "Use a contract recheck as the lowest-risk validation-oriented recovery step.",
  "evidence-collect":
    "Capture live DOM and runtime evidence before mitigation changes page state.",
  "locator-heal": "Use scored locator healing for stale UI interactions.",
  "memory-record": "Persist the incident outcome for future reference.",
  "network-recover":
    "Run ordered wait or retry strategies for loading and empty-state failures.",
  "patch-propose": "Describe the most likely permanent fix direction.",
  validate:
    "Validate the page after recovery before declaring mitigation success.",
};

// One planner, no state.
export class ExecutionPlanner {
  // Builds the plan for one incident.
  build(request: ExecutionPlannerRequest): ExecutionPlan {
    // Only a chain that allows recovery keeps the strategies the policy
    // approved, sorted into the preferred order for this kind of failure.
    const preferredOrder =
      strategyOrderByCategory[request.classification.category];
    const approvedStrategies = request.agentChain.autoMitigationEligible
      ? request.policy.approvedStrategies
      : [];
    const plannedRecoveryStrategies = approvedStrategies
      .map((strategy, index) => ({
        priority: this.getPriority(strategy.kind, preferredOrder, index),
        reason: this.getStrategyReason(
          strategy.kind,
          request.classification.category,
        ),
        strategy,
      }))
      .sort((left, right) => left.priority - right.priority);
    // The agents to run: a recovery agent stays only when one of its strategies
    // is in the plan.
    const canAttemptRecovery = plannedRecoveryStrategies.length > 0;
    const plannedAgentSteps = request.agentChain.agents
      .filter((agent) => this.shouldKeepAgent(agent, plannedRecoveryStrategies))
      .map((agent) => ({
        agent,
        reason: agentReasons[agent],
      }));
    // Validate the page only when recovery is tried and the chain includes it.
    const requiresValidation =
      canAttemptRecovery &&
      plannedAgentSteps.some((step) => step.agent === "validate");

    return {
      canAttemptRecovery,
      escalationReason: this.getEscalationReason(request, canAttemptRecovery),
      plannedAgentSteps,
      plannedRecoveryStrategies,
      requiresValidation,
      strategyOrder: plannedRecoveryStrategies.map(
        (strategy) => strategy.strategy.kind,
      ),
    };
  }

  // A strategy's place in the order: as listed for the kind of failure, or
  // after those in the order it was asked for.
  private getPriority(
    strategyKind: RecoveryStrategyKind,
    preferredOrder: RecoveryStrategyKind[],
    fallbackIndex: number,
  ) {
    const preferredIndex = preferredOrder.indexOf(strategyKind);

    if (preferredIndex >= 0) {
      return preferredIndex;
    }

    return preferredOrder.length + fallbackIndex;
  }

  // Why a strategy fits this kind of failure.
  private getStrategyReason(
    strategyKind: RecoveryStrategyKind,
    category: FailureCategory,
  ) {
    switch (strategyKind) {
      case "contract-recheck":
        return `The ${category} branch can be confirmed through a fresh contract check.`;
      case "extend-wait":
        return `The ${category} branch prefers a bounded wait before more invasive recovery.`;
      case "locator-heal":
        return `The ${category} branch is eligible for scored locator healing.`;
      case "refresh-and-retry":
        return `The ${category} branch can fall back to a retry path after the first failure.`;
    }
  }

  // Why nothing will be tried, or null when something will.
  private getEscalationReason(
    request: ExecutionPlannerRequest,
    canAttemptRecovery: boolean,
  ) {
    if (canAttemptRecovery) {
      return null;
    }

    if (!request.agentChain.autoMitigationEligible) {
      return `The ${request.classification.category} chain is diagnosis-only and should escalate after evidence capture.`;
    }

    if (request.requestedStrategies.length === 0) {
      return `The ${request.classification.category} chain is auto-mitigation eligible, but no recovery strategies were requested.`;
    }

    if (request.policy.blockedStrategies.length > 0) {
      const blocked = request.policy.blockedStrategies
        .map((decision) => `${decision.strategy}: ${decision.decision}`)
        .join(", ");

      return `All requested recovery strategies were blocked by policy: ${blocked}.`;
    }

    return `No recovery strategies remained after planning for ${request.classification.category}.`;
  }

  // Keep an agent with no strategies, or one whose strategy is in the plan.
  private shouldKeepAgent(
    agent: AgentStep,
    strategies: PlannedRecoveryStrategy[],
  ) {
    const strategyKinds = recoveryStepKinds[agent];

    if (strategyKinds.length === 0) {
      return true;
    }

    return strategies.some((strategy) =>
      strategyKinds.includes(strategy.strategy.kind),
    );
  }
}
