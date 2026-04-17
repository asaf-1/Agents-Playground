import { promises as fs } from "fs";
import path from "path";
import type { Page } from "@playwright/test";
import { EvidenceCollectionAgent } from "../agents/evidence/EvidenceCollectionAgent";
import { FailureClassifier } from "../agents/diagnosis/FailureClassifier";
import { PatchProposalAgent } from "../agents/diagnosis/PatchProposalAgent";
import type { FailureClassification, FailureSignalInput, PatchProposal } from "../agents/diagnosis/types";
import { RecoveryRouter } from "../agents/recovery/RecoveryRouter";
import type { RecoveryRouterResult, RecoveryStrategy } from "../agents/recovery/types";
import { PageValidationAgent } from "../agents/validation/PageValidationAgent";
import type { ContractValidationResult, PageContract } from "../agents/validation/contracts";
import { IncidentMemoryStore } from "../memory/IncidentMemoryStore";
import { AgentRegistry } from "./AgentRegistry";
import type { AgentChain } from "./AgentRegistry";
import { ExecutionPlanner } from "./ExecutionPlanner";
import type { ExecutionPlan } from "./ExecutionPlanner";
import { PolicyEngine } from "./PolicyEngine";
import type { PolicyEnvironment, PolicyStrategyPlan } from "./PolicyEngine";

export type IncidentRouterRequest = {
  apiRoute?: string;
  contract?: PageContract;
  environment?: PolicyEnvironment;
  failureEvidence: FailureSignalInput;
  page: Page;
  pageLabel?: string;
  scenario: string;
  strategies: RecoveryStrategy[];
};

export type IncidentResult = {
  agentChain: AgentChain;
  classified: FailureClassification;
  durationMs: number;
  evidence: Record<string, unknown>;
  executionPlan: ExecutionPlan;
  finalStatus: "escalate" | "mitigated" | "unresolved";
  incidentId: string;
  patchProposal: PatchProposal;
  policy: PolicyStrategyPlan;
  recovered: boolean;
  recoveryDetail: RecoveryRouterResult | null;
  validationDetail: ContractValidationResult | null;
  validationPassed: boolean;
};

export class IncidentRouter {
  private readonly classifier = new FailureClassifier();
  private readonly evidenceCollector = new EvidenceCollectionAgent();
  private readonly executionPlanner = new ExecutionPlanner();
  private readonly memoryStore = new IncidentMemoryStore();
  private readonly patchAgent = new PatchProposalAgent();
  private readonly policyEngine = new PolicyEngine();
  private readonly registry = new AgentRegistry();

  async route(request: IncidentRouterRequest): Promise<IncidentResult> {
    const startedAt = Date.now();
    const incidentId = `incident-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const classified = this.classifier.classify(request.failureEvidence);
    const agentChain = this.registry.lookup(classified.category);
    const collectedEvidence = await this.evidenceCollector.collect({
      apiRoute: request.apiRoute,
      contract: request.contract,
      failureEvidence: request.failureEvidence,
      incidentId,
      page: request.page,
      pageLabel: request.pageLabel,
      scenario: request.scenario
    });
    const policy = this.policyEngine.evaluateStrategies({
      classification: classified,
      environment: request.environment,
      strategies: request.strategies
    });
    const executionPlan = this.executionPlanner.build({
      agentChain,
      classification: classified,
      policy,
      requestedStrategies: request.strategies
    });
    const patchProposal = this.patchAgent.propose({
      ...request.failureEvidence,
      apiRoute: request.apiRoute,
      classification: classified,
      pageLabel: request.pageLabel,
      scenario: request.scenario
    });

    let recoveryDetail: RecoveryRouterResult | null = null;
    let validationDetail: ContractValidationResult | null = null;
    let recovered = false;
    let validationPassed = false;

    if (agentChain.autoMitigationEligible && executionPlan.canAttemptRecovery) {
      const router = new RecoveryRouter(request.page);
      recoveryDetail = await router.recover({
        apiRoute: request.apiRoute,
        failureEvidence: request.failureEvidence,
        pageLabel: request.pageLabel,
        scenario: request.scenario,
        strategies: executionPlan.plannedRecoveryStrategies.map((strategy) => strategy.strategy)
      });
      recovered = recoveryDetail.finalStatus === "recovered";
    }

    if (recovered && request.contract && executionPlan.requiresValidation) {
      const validator = new PageValidationAgent(request.page);
      validationDetail = await validator.validateContract(request.contract);
      validationPassed = validationDetail.valid;
    }

    const blockedByPlanner =
      agentChain.autoMitigationEligible &&
      request.strategies.length > 0 &&
      !executionPlan.canAttemptRecovery;
    const finalStatus = recovered && validationPassed
      ? "mitigated"
      : recovered && (!request.contract || !executionPlan.requiresValidation)
      ? "mitigated"
      : blockedByPlanner
      ? "escalate"
      : classified.confidence < 0.5
      ? "escalate"
      : "unresolved";

    const result: IncidentResult = {
      agentChain,
      classified,
      durationMs: Date.now() - startedAt,
      evidence: {
        collectedEvidence,
        failureEvidence: request.failureEvidence,
        policy,
        recovery: recoveryDetail?.recoveryEvidence ?? null,
        validation: validationDetail?.evidence ?? null
      },
      executionPlan,
      finalStatus,
      incidentId,
      patchProposal,
      policy,
      recovered,
      recoveryDetail,
      validationDetail,
      validationPassed
    };

    await this.writeIncidentReport(result, request.scenario);
    await this.memoryStore.record({
      classification: result.classified,
      executionPlan: {
        escalationReason: result.executionPlan.escalationReason,
        strategyOrder: result.executionPlan.strategyOrder,
        workerOrder: result.executionPlan.plannedAgentSteps.map((step) => step.agent)
      },
      finalStatus: result.finalStatus,
      incidentId: result.incidentId,
      pageLabel: request.pageLabel,
      recordedAt: new Date().toISOString(),
      recovered: result.recovered,
      scenario: request.scenario,
      strategyUsed: result.recoveryDetail?.strategyUsed || null,
      validationPassed: result.validationPassed
    });

    return result;
  }

  private async writeIncidentReport(result: IncidentResult, scenario: string) {
    try {
      const dir = path.join(
        process.cwd(),
        "docs",
        "obsidian-vault",
        "Reports",
        "Incidents"
      );
      await fs.mkdir(dir, { recursive: true });
      const filename = `${new Date().toISOString().slice(0, 10)}-${scenario}.json`;
      await fs.writeFile(
        path.join(dir, filename),
        JSON.stringify(result, null, 2) + "\n"
      );
    } catch {
      // report write failure should not fail the test
    }
  }
}
