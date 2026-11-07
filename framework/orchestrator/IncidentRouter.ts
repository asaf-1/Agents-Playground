// The incident router: it runs one failure through the whole agent chain. It
// classifies it, collects evidence, asks the policy what may run, plans the
// work and proposes a fix. Then it recovers and re-checks the page when that is
// allowed, plans a repair (written for review, never applied to the code), and
// saves the incident to the report and the memory.

// Node's file and path tools, and Playwright's type for a page.
import { promises as fs } from "fs";
import path from "path";
import type { Page } from "@playwright/test";
// The agents it calls, with their shapes.
import { EvidenceCollectionAgent } from "../agents/evidence/EvidenceCollectionAgent";
import { FailureClassifier } from "../agents/diagnosis/FailureClassifier";
import { PatchProposalAgent } from "../agents/diagnosis/PatchProposalAgent";
import type {
  FailureClassification,
  FailureSignalInput,
  PatchProposal,
} from "../agents/diagnosis/types";
import { RecoveryRouter } from "../agents/recovery/RecoveryRouter";
import type {
  RecoveryRouterResult,
  RecoveryStrategy,
} from "../agents/recovery/types";
import { PatchApplier } from "../agents/repair/PatchApplier";
import { PatchPlanner } from "../agents/repair/PatchPlanner";
import { RepairVerifier } from "../agents/repair/RepairVerifier";
import type {
  PatchApplyResult,
  PatchPlan,
  RepairVerificationResult,
} from "../agents/repair/types";
import { PageValidationAgent } from "../agents/validation/PageValidationAgent";
import type {
  ContractValidationResult,
  PageContract,
} from "../agents/validation/contracts";
// The incident memory, and the orchestrator's registry, planner and policy.
import { IncidentMemoryStore } from "../memory/IncidentMemoryStore";
import { AgentRegistry } from "./AgentRegistry";
import type { AgentChain } from "./AgentRegistry";
import { ExecutionPlanner } from "./ExecutionPlanner";
import type { ExecutionPlan } from "./ExecutionPlanner";
import { PolicyEngine } from "./PolicyEngine";
import type { PolicyEnvironment, PolicyStrategyPlan } from "./PolicyEngine";

// What it is given: the page, the failure, where it happened, the page's
// contract and the recovery strategies the test offers.
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

// What it reports: every decision and result along the way.
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
  repairApply: PatchApplyResult | null;
  repairPlan: PatchPlan | null;
  repairVerification: RepairVerificationResult | null;
  validationDetail: ContractValidationResult | null;
  validationPassed: boolean;
};

// One router holds one of each agent.
export class IncidentRouter {
  private readonly classifier = new FailureClassifier();
  private readonly evidenceCollector = new EvidenceCollectionAgent();
  private readonly executionPlanner = new ExecutionPlanner();
  private readonly memoryStore = new IncidentMemoryStore();
  private readonly patchAgent = new PatchProposalAgent();
  private readonly patchApplier = new PatchApplier();
  private readonly patchPlanner = new PatchPlanner();
  private readonly policyEngine = new PolicyEngine();
  private readonly registry = new AgentRegistry();
  private readonly repairVerifier = new RepairVerifier();

  // Handles one incident from start to end.
  async route(request: IncidentRouterRequest): Promise<IncidentResult> {
    // A unique id for the incident, its class, and its chain of agents.
    const startedAt = Date.now();
    const incidentId = `incident-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const classified = this.classifier.classify(request.failureEvidence);
    const agentChain = this.registry.lookup(classified.category);
    // Save the page as it is before anything changes it.
    const collectedEvidence = await this.evidenceCollector.collect({
      apiRoute: request.apiRoute,
      contract: request.contract,
      failureEvidence: request.failureEvidence,
      incidentId,
      page: request.page,
      pageLabel: request.pageLabel,
      scenario: request.scenario,
    });
    // What the policy allows, the plan built from it, and the proposed fix.
    const policy = this.policyEngine.evaluateStrategies({
      classification: classified,
      environment: request.environment,
      strategies: request.strategies,
    });
    const executionPlan = this.executionPlanner.build({
      agentChain,
      classification: classified,
      policy,
      requestedStrategies: request.strategies,
    });
    const patchProposal = this.patchAgent.propose({
      ...request.failureEvidence,
      apiRoute: request.apiRoute,
      classification: classified,
      pageLabel: request.pageLabel,
      scenario: request.scenario,
    });

    // What happens next, filled in below.
    let recoveryDetail: RecoveryRouterResult | null = null;
    let validationDetail: ContractValidationResult | null = null;
    let recovered = false;
    let validationPassed = false;

    // Recover only when the chain allows it and the plan has something to try.
    if (agentChain.autoMitigationEligible && executionPlan.canAttemptRecovery) {
      const router = new RecoveryRouter(request.page);
      recoveryDetail = await router.recover({
        apiRoute: request.apiRoute,
        failureEvidence: request.failureEvidence,
        pageLabel: request.pageLabel,
        scenario: request.scenario,
        strategies: executionPlan.plannedRecoveryStrategies.map(
          (strategy) => strategy.strategy,
        ),
      });
      recovered = recoveryDetail.finalStatus === "recovered";
    }

    // After a recovery, check the page against its contract when the plan asks.
    if (recovered && request.contract && executionPlan.requiresValidation) {
      const validator = new PageValidationAgent(request.page);
      validationDetail = await validator.validateContract(request.contract);
      validationPassed = validationDetail.valid;
    }

    // Outside production: plan a repair, write it for review when allowed, and
    // check the page again.
    let repairPlan: PatchPlan | null = null;
    let repairApply: PatchApplyResult | null = null;
    let repairVerification: RepairVerificationResult | null = null;

    if (request.environment !== "production") {
      repairPlan = this.patchPlanner.plan({
        classification: classified,
        environment: request.environment === "staging" ? "staging" : "qa",
        incidentId,
        patchProposal,
      });

      if (repairPlan.permitted) {
        repairApply = await this.patchApplier.apply(repairPlan);

        if (repairApply.applied && request.contract) {
          repairVerification = await this.repairVerifier.verify({
            contract: request.contract,
            incidentId,
            page: request.page,
          });
        }
      }
    }

    // How it ended: mitigated when recovered (and checked, when that was
    // asked); handed over when the plan blocked recovery or the class is
    // unsure; otherwise unresolved.
    const blockedByPlanner =
      agentChain.autoMitigationEligible &&
      request.strategies.length > 0 &&
      !executionPlan.canAttemptRecovery;
    const finalStatus =
      recovered && validationPassed
        ? "mitigated"
        : recovered && (!request.contract || !executionPlan.requiresValidation)
          ? "mitigated"
          : blockedByPlanner
            ? "escalate"
            : classified.confidence < 0.5
              ? "escalate"
              : "unresolved";

    // Everything for the report.
    const result: IncidentResult = {
      agentChain,
      classified,
      durationMs: Date.now() - startedAt,
      evidence: {
        collectedEvidence,
        failureEvidence: request.failureEvidence,
        policy,
        recovery: recoveryDetail?.recoveryEvidence ?? null,
        validation: validationDetail?.evidence ?? null,
      },
      executionPlan,
      finalStatus,
      incidentId,
      patchProposal,
      policy,
      recovered,
      recoveryDetail,
      repairApply,
      repairPlan,
      repairVerification,
      validationDetail,
      validationPassed,
    };

    // Write the report, and remember the incident for next time.
    await this.writeIncidentReport(result, request.scenario);
    await this.memoryStore.record({
      classification: result.classified,
      executionPlan: {
        escalationReason: result.executionPlan.escalationReason,
        strategyOrder: result.executionPlan.strategyOrder,
        workerOrder: result.executionPlan.plannedAgentSteps.map(
          (step) => step.agent,
        ),
      },
      finalStatus: result.finalStatus,
      incidentId: result.incidentId,
      pageLabel: request.pageLabel,
      recordedAt: new Date().toISOString(),
      recovered: result.recovered,
      scenario: request.scenario,
      strategyUsed: result.recoveryDetail?.strategyUsed || null,
      validationPassed: result.validationPassed,
    });

    return result;
  }

  // Writes the incident to
  // obsidian-vault/Reports/Incidents/<date>-<scenario>.json.
  private async writeIncidentReport(result: IncidentResult, scenario: string) {
    try {
      const dir = path.join(
        process.cwd(),
        "obsidian-vault",
        "Reports",
        "Incidents",
      );
      await fs.mkdir(dir, { recursive: true });
      const filename = `${new Date().toISOString().slice(0, 10)}-${scenario}.json`;
      await fs.writeFile(
        path.join(dir, filename),
        JSON.stringify(result, null, 2) + "\n",
      );
    } catch {
      // report write failure should not fail the test
    }
  }
}
