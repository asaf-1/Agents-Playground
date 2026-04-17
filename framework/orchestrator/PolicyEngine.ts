import type { FailureClassification } from "../agents/diagnosis/types";
import type { RecoveryStrategy, RecoveryStrategyKind } from "../agents/recovery/types";

export type PolicyEnvironment = "production" | "qa" | "staging";
export type PolicyDecision = "allow" | "approval-required" | "deny";
export type PolicyBlastRadius =
  | "business-data"
  | "cross-service"
  | "single-page"
  | "single-service";

export type PolicyAction =
  | RecoveryStrategyKind
  | "cross-service-config-change"
  | "data-repair"
  | "deployment-rollback"
  | "feature-flag-disable"
  | "isolate-instance"
  | "patch-apply"
  | "restart-service"
  | "retry-idempotent-job"
  | "scale-service"
  | "schema-change"
  | "temporary-fixture-adaptation"
  | "unreviewed-deploy";

type PolicyRule = {
  blastRadius: PolicyBlastRadius;
  defaultDecision: PolicyDecision;
  description: string;
  minConfidence: number;
  requiresIdempotency?: boolean;
  requiresReversible?: boolean;
};

export type PolicyEngineRequest = {
  action: PolicyAction;
  classification?: FailureClassification;
  environment?: PolicyEnvironment;
  idempotent?: boolean;
  reversible?: boolean;
  touchesBusinessData?: boolean;
};

export type PolicyEngineResult = {
  action: PolicyAction;
  approvalRequired: boolean;
  autoMitigationAllowed: boolean;
  blastRadius: PolicyBlastRadius;
  decision: PolicyDecision;
  environment: PolicyEnvironment;
  explanation: string;
};

export type PolicyStrategyPlanRequest = {
  classification?: FailureClassification;
  environment?: PolicyEnvironment;
  strategies: RecoveryStrategy[];
};

export type PolicyStrategyDecision = {
  approvalRequired: boolean;
  autoMitigationAllowed: boolean;
  decision: PolicyDecision;
  explanation: string;
  strategy: RecoveryStrategyKind;
};

export type PolicyStrategyPlan = {
  approvedStrategies: RecoveryStrategy[];
  autoMitigationAllowed: boolean;
  blockedStrategies: PolicyStrategyDecision[];
  decisions: PolicyStrategyDecision[];
  environment: PolicyEnvironment;
  requestedStrategies: RecoveryStrategyKind[];
};

const qaPolicy: Record<PolicyAction, PolicyRule> = {
  "contract-recheck": {
    blastRadius: "single-page",
    defaultDecision: "allow",
    description: "Re-run page validation without mutating the live environment.",
    minConfidence: 0.4,
    requiresReversible: true
  },
  "cross-service-config-change": {
    blastRadius: "cross-service",
    defaultDecision: "deny",
    description: "Cross-service config changes stay out of local QA automation.",
    minConfidence: 0.95
  },
  "data-repair": {
    blastRadius: "business-data",
    defaultDecision: "deny",
    description: "Data repair is never auto-approved in this local-only demo.",
    minConfidence: 0.95
  },
  "deployment-rollback": {
    blastRadius: "single-service",
    defaultDecision: "deny",
    description: "Deployment rollback is not part of the local QA control plane.",
    minConfidence: 0.9,
    requiresReversible: true
  },
  "extend-wait": {
    blastRadius: "single-page",
    defaultDecision: "allow",
    description: "Extend a deterministic wait for slow UI or network transitions.",
    minConfidence: 0.45,
    requiresReversible: true
  },
  "feature-flag-disable": {
    blastRadius: "single-service",
    defaultDecision: "deny",
    description: "Feature-flag mitigation is reserved for higher environments.",
    minConfidence: 0.9,
    requiresReversible: true
  },
  "isolate-instance": {
    blastRadius: "single-service",
    defaultDecision: "deny",
    description: "Instance isolation is not part of local QA automation.",
    minConfidence: 0.9,
    requiresReversible: true
  },
  "locator-heal": {
    blastRadius: "single-page",
    defaultDecision: "allow",
    description: "Recover a stale UI interaction inside QA automation only.",
    minConfidence: 0.7
  },
  "patch-apply": {
    blastRadius: "single-service",
    defaultDecision: "allow",
    description: "Patch application is allowed only in isolated QA workspaces.",
    minConfidence: 0.85,
    requiresReversible: true
  },
  "refresh-and-retry": {
    blastRadius: "single-page",
    defaultDecision: "allow",
    description: "Retry a page-level interaction inside the local QA run.",
    minConfidence: 0.65
  },
  "restart-service": {
    blastRadius: "single-service",
    defaultDecision: "deny",
    description: "Service restarts are reserved for staging or production controls.",
    minConfidence: 0.9,
    requiresReversible: true
  },
  "retry-idempotent-job": {
    blastRadius: "single-service",
    defaultDecision: "deny",
    description: "Background job retries are reserved for staging or production controls.",
    minConfidence: 0.85,
    requiresIdempotency: true
  },
  "scale-service": {
    blastRadius: "single-service",
    defaultDecision: "deny",
    description: "Scaling actions are reserved for staging or production controls.",
    minConfidence: 0.9,
    requiresReversible: true
  },
  "schema-change": {
    blastRadius: "business-data",
    defaultDecision: "deny",
    description: "Schema changes are never auto-approved in this demo.",
    minConfidence: 0.98
  },
  "temporary-fixture-adaptation": {
    blastRadius: "single-page",
    defaultDecision: "allow",
    description: "Temporary fixture adaptation is allowed inside QA-only runs.",
    minConfidence: 0.75
  },
  "unreviewed-deploy": {
    blastRadius: "cross-service",
    defaultDecision: "deny",
    description: "Unreviewed deploys are blocked in every environment.",
    minConfidence: 0.99
  }
};

const stagingPolicy: Record<PolicyAction, PolicyRule> = {
  ...qaPolicy,
  "deployment-rollback": {
    blastRadius: "single-service",
    defaultDecision: "allow",
    description: "Staging can roll back a known bad deployment when the action is reversible.",
    minConfidence: 0.9,
    requiresReversible: true
  },
  "feature-flag-disable": {
    blastRadius: "single-service",
    defaultDecision: "allow",
    description: "Staging can disable a feature flag when the action is reversible.",
    minConfidence: 0.85,
    requiresReversible: true
  },
  "isolate-instance": {
    blastRadius: "single-service",
    defaultDecision: "allow",
    description: "Staging can isolate one unhealthy instance with a rollback path.",
    minConfidence: 0.85,
    requiresReversible: true
  },
  "patch-apply": {
    blastRadius: "single-service",
    defaultDecision: "approval-required",
    description: "Staging patch application must stay isolated and reviewed.",
    minConfidence: 0.88,
    requiresReversible: true
  },
  "restart-service": {
    blastRadius: "single-service",
    defaultDecision: "allow",
    description: "Staging can restart a service when the action is reversible.",
    minConfidence: 0.85,
    requiresReversible: true
  },
  "retry-idempotent-job": {
    blastRadius: "single-service",
    defaultDecision: "allow",
    description: "Staging can retry an idempotent background job.",
    minConfidence: 0.8,
    requiresIdempotency: true
  },
  "scale-service": {
    blastRadius: "single-service",
    defaultDecision: "allow",
    description: "Staging can scale a service when the action is reversible.",
    minConfidence: 0.85,
    requiresReversible: true
  }
};

const productionPolicy: Record<PolicyAction, PolicyRule> = {
  ...stagingPolicy,
  "locator-heal": {
    blastRadius: "single-page",
    defaultDecision: "deny",
    description: "Do not auto-click healed UI targets in production.",
    minConfidence: 0.8
  },
  "patch-apply": {
    blastRadius: "single-service",
    defaultDecision: "deny",
    description: "Do not auto-apply code patches in production.",
    minConfidence: 0.95
  },
  "refresh-and-retry": {
    blastRadius: "single-page",
    defaultDecision: "deny",
    description: "Do not auto-repeat stateful UI interactions in production.",
    minConfidence: 0.75
  },
  "temporary-fixture-adaptation": {
    blastRadius: "single-page",
    defaultDecision: "deny",
    description: "Fixture adaptation is a QA-only control and is blocked in production.",
    minConfidence: 0.95
  }
};

const policyMatrix: Record<PolicyEnvironment, Record<PolicyAction, PolicyRule>> = {
  production: productionPolicy,
  qa: qaPolicy,
  staging: stagingPolicy
};

const strategySafetyProfile: Record<
  RecoveryStrategyKind,
  Pick<PolicyEngineRequest, "action" | "idempotent" | "reversible" | "touchesBusinessData">
> = {
  "contract-recheck": {
    action: "contract-recheck",
    idempotent: true,
    reversible: true,
    touchesBusinessData: false
  },
  "extend-wait": {
    action: "extend-wait",
    idempotent: true,
    reversible: true,
    touchesBusinessData: false
  },
  "locator-heal": {
    action: "locator-heal",
    idempotent: false,
    reversible: false,
    touchesBusinessData: false
  },
  "refresh-and-retry": {
    action: "refresh-and-retry",
    idempotent: false,
    reversible: false,
    touchesBusinessData: false
  }
};

export class PolicyEngine {
  evaluate(request: PolicyEngineRequest): PolicyEngineResult {
    const environment = this.resolveEnvironment(request.environment);
    const rule = policyMatrix[environment][request.action];
    const confidence = request.classification?.confidence ?? 1;

    if (request.touchesBusinessData && environment !== "qa") {
      return this.buildResult(
        request.action,
        environment,
        rule,
        rule.defaultDecision === "deny" ? "deny" : "approval-required",
        `${rule.description} The requested action may change business data outside QA.`
      );
    }

    if (rule.requiresReversible && request.reversible !== true) {
      return this.buildResult(
        request.action,
        environment,
        rule,
        "deny",
        `${rule.description} The action was not marked reversible.`
      );
    }

    if (rule.requiresIdempotency && request.idempotent !== true) {
      return this.buildResult(
        request.action,
        environment,
        rule,
        "deny",
        `${rule.description} The action was not marked idempotent.`
      );
    }

    if (confidence < rule.minConfidence) {
      const decision = rule.defaultDecision === "deny" ? "deny" : "approval-required";
      return this.buildResult(
        request.action,
        environment,
        rule,
        decision,
        `${rule.description} Classification confidence ${confidence.toFixed(2)} is below the ${rule.minConfidence.toFixed(2)} threshold.`
      );
    }

    return this.buildResult(request.action, environment, rule, rule.defaultDecision, rule.description);
  }

  evaluateStrategies(request: PolicyStrategyPlanRequest): PolicyStrategyPlan {
    const environment = this.resolveEnvironment(request.environment);
    const decisions = request.strategies.map((strategy) => {
      const policyResult = this.evaluate({
        ...strategySafetyProfile[strategy.kind],
        classification: request.classification,
        environment
      });

      return {
        approvalRequired: policyResult.approvalRequired,
        autoMitigationAllowed: policyResult.autoMitigationAllowed,
        decision: policyResult.decision,
        explanation: policyResult.explanation,
        strategy: strategy.kind
      };
    });

    const approvedStrategies = request.strategies.filter((_, index) => {
      return decisions[index].decision === "allow";
    });
    const blockedStrategies = decisions.filter((decision) => decision.decision !== "allow");

    return {
      approvedStrategies,
      autoMitigationAllowed: approvedStrategies.length > 0,
      blockedStrategies,
      decisions,
      environment,
      requestedStrategies: request.strategies.map((strategy) => strategy.kind)
    };
  }

  private buildResult(
    action: PolicyAction,
    environment: PolicyEnvironment,
    rule: PolicyRule,
    decision: PolicyDecision,
    explanation: string
  ): PolicyEngineResult {
    return {
      action,
      approvalRequired: decision === "approval-required",
      autoMitigationAllowed: decision === "allow",
      blastRadius: rule.blastRadius,
      decision,
      environment,
      explanation
    };
  }

  private resolveEnvironment(environment?: PolicyEnvironment): PolicyEnvironment {
    const rawEnvironment = (
      environment ||
      process.env.SELF_HEALING_TARGET_ENV ||
      process.env.SELF_HEALING_ENV ||
      "qa"
    ).toLowerCase();

    switch (rawEnvironment) {
      case "production":
        return "production";
      case "staging":
        return "staging";
      default:
        return "qa";
    }
  }
}
