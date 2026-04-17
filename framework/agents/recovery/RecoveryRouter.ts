import type { Page } from "@playwright/test";
import { FailureClassifier } from "../diagnosis/FailureClassifier";
import { PatchProposalAgent } from "../diagnosis/PatchProposalAgent";
import { PageValidationAgent } from "../validation/PageValidationAgent";
import { GenericLocatorHealer } from "./GenericLocatorHealer";
import type {
  RecoveryRouterRequest,
  RecoveryRouterResult,
  RecoveryStrategy,
  RecoveryStrategyAttempt
} from "./types";

export class RecoveryRouter {
  constructor(
    private readonly page: Page,
    private readonly classifier = new FailureClassifier(),
    private readonly patchProposalAgent = new PatchProposalAgent()
  ) {}

  async recover(request: RecoveryRouterRequest): Promise<RecoveryRouterResult> {
    const classification = this.classifier.classify(request.failureEvidence);
    const patchProposal = this.patchProposalAgent.propose({
      ...request.failureEvidence,
      apiRoute: request.apiRoute,
      classification,
      pageLabel: request.pageLabel,
      scenario: request.scenario
    });
    const attempts: RecoveryStrategyAttempt[] = [];
    const validator = new PageValidationAgent(this.page);
    const locatorHealer = new GenericLocatorHealer(this.page);

    for (const strategy of request.strategies) {
      const startedAt = Date.now();

      try {
        const result = await this.executeStrategy(strategy, validator, locatorHealer);
        const durationMs = Date.now() - startedAt;
        const attempt: RecoveryStrategyAttempt = {
          details: result.details,
          durationMs,
          message: result.message,
          strategy: strategy.kind,
          success: true
        };

        attempts.push(attempt);

        return {
          agentDecision: `Classified the failure as ${classification.category} and recovered with ${strategy.kind} after ${attempts.length} strategy attempt(s).`,
          attempts,
          classification,
          engine: "deterministic",
          finalStatus: "recovered",
          patchProposal,
          recoveryEvidence: result.recoveryEvidence,
          strategyUsed: strategy.kind
        };
      } catch (error) {
        attempts.push({
          durationMs: Date.now() - startedAt,
          message: error instanceof Error ? error.message : String(error),
          strategy: strategy.kind,
          success: false
        });
      }
    }

    return {
      agentDecision: `Classified the failure as ${classification.category} but no safe recovery strategy succeeded.`,
      attempts,
      classification,
      engine: "deterministic",
      finalStatus: "failed",
      patchProposal,
      recoveryEvidence: {},
      strategyUsed: null
    };
  }

  private async executeStrategy(
    strategy: RecoveryStrategy,
    validator: PageValidationAgent,
    locatorHealer: GenericLocatorHealer
  ) {
    switch (strategy.kind) {
      case "locator-heal": {
        const healed = await locatorHealer.heal(strategy.request);

        return {
          details: {
            selectedCandidate: healed.selectedCandidate,
            topCandidates: healed.topCandidates
          },
          message: `Recovered the failed ${strategy.request.targetType} action through locator healing.`,
          recoveryEvidence: {
            performedAction: healed.performedAction,
            selectedCandidate: healed.selectedCandidate,
            topCandidates: healed.topCandidates
          }
        };
      }

      case "extend-wait": {
        await this.page.waitForSelector(strategy.selector, {
          timeout: strategy.timeoutMs || 5000
        });

        return {
          details: {
            selector: strategy.selector,
            timeoutMs: strategy.timeoutMs || 5000
          },
          message: `Extended the wait until ${strategy.selector} became available.`,
          recoveryEvidence: {
            selector: strategy.selector
          }
        };
      }

      case "refresh-and-retry": {
        if (strategy.triggerTestId) {
          await this.page.getByTestId(strategy.triggerTestId).click();
        } else if (strategy.triggerSelector) {
          await this.page.locator(strategy.triggerSelector).click();
        } else {
          throw new Error("Refresh-and-retry requires triggerTestId or triggerSelector.");
        }

        await this.page.waitForSelector(strategy.successSelector, {
          timeout: strategy.timeoutMs || 5000
        });

        return {
          details: {
            successSelector: strategy.successSelector,
            timeoutMs: strategy.timeoutMs || 5000,
            triggerSelector: strategy.triggerSelector || null,
            triggerTestId: strategy.triggerTestId || null
          },
          message: `Triggered a retry path and waited for ${strategy.successSelector}.`,
          recoveryEvidence: {
            successSelector: strategy.successSelector,
            triggerSelector: strategy.triggerSelector || null,
            triggerTestId: strategy.triggerTestId || null
          }
        };
      }

      case "contract-recheck": {
        const validation = await validator.validateContract(strategy.contract);

        if (!validation.valid) {
          throw new Error(validation.explanation);
        }

        return {
          details: {
            contractName: validation.contractName
          },
          message: `Revalidated the ${validation.contractName} contract successfully.`,
          recoveryEvidence: {
            validation
          }
        };
      }
    }
  }
}
