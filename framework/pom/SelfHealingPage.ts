import type { Locator, Page } from "@playwright/test";
import { RecoveryRouter } from "../agents/recovery/RecoveryRouter";
import type { PageActionProfile, PrimaryLocatorProfile } from "../agents/recovery/pageProfiles/types";
import { PageValidationAgent } from "../agents/validation/PageValidationAgent";
import type { ContractValidationResult, PageContract } from "../agents/validation/contracts";

type ActionResult = {
  healed: boolean;
  recoveryEvidence?: Record<string, unknown>;
};

export abstract class SelfHealingPage {
  protected constructor(
    protected readonly page: Page,
    protected readonly pageLabel: string
  ) {}

  protected getLocator(primary: PrimaryLocatorProfile): Locator {
    switch (primary.kind) {
      case "role":
        return this.page.getByRole(primary.role as any, { name: primary.name });
      case "selector":
        return this.page.locator(primary.value);
      case "testId":
        return this.page.getByTestId(primary.value);
    }
  }

  protected describePrimary(primary: PrimaryLocatorProfile) {
    switch (primary.kind) {
      case "role":
        return `${primary.role}[name="${primary.name}"]`;
      case "selector":
        return primary.value;
      case "testId":
        return `data-testid=${primary.value}`;
    }
  }

  protected async clickAction(profile: PageActionProfile): Promise<ActionResult> {
    const locator = this.getLocator(profile.primary);

    try {
      await locator.click({ timeout: profile.timeoutMs || 1200 });

      return {
        healed: false
      };
    } catch (error) {
      const recovery = await new RecoveryRouter(this.page).recover({
        failureEvidence: {
          errorMessage: error instanceof Error ? error.message : String(error),
          staleSelector: this.describePrimary(profile.primary),
          targetType: profile.targetType
        },
        pageLabel: this.pageLabel,
        scenario: `${this.pageLabel.toLowerCase().replace(/\s+/g, "-")}-page-action`,
        strategies: [
          {
            kind: "locator-heal",
            request: {
              action: "click",
              intentTokens: profile.intentTokens,
              staleSelector: this.describePrimary(profile.primary),
              targetType: profile.targetType
            }
          }
        ]
      });

      if (recovery.finalStatus !== "recovered") {
        throw new Error(recovery.agentDecision);
      }

      return {
        healed: true,
        recoveryEvidence: recovery.recoveryEvidence
      };
    }
  }

  protected async fillAction(profile: PageActionProfile, value: string): Promise<ActionResult> {
    const locator = this.getLocator(profile.primary);

    try {
      await locator.fill(value, { timeout: profile.timeoutMs || 1200 });

      return {
        healed: false
      };
    } catch (error) {
      const recovery = await new RecoveryRouter(this.page).recover({
        failureEvidence: {
          errorMessage: error instanceof Error ? error.message : String(error),
          staleSelector: this.describePrimary(profile.primary),
          targetType: profile.targetType
        },
        pageLabel: this.pageLabel,
        scenario: `${this.pageLabel.toLowerCase().replace(/\s+/g, "-")}-page-action`,
        strategies: [
          {
            kind: "locator-heal",
            request: {
              action: "fill",
              fillValue: value,
              intentTokens: profile.intentTokens,
              staleSelector: this.describePrimary(profile.primary),
              targetType: profile.targetType
            }
          }
        ]
      });

      if (recovery.finalStatus !== "recovered") {
        throw new Error(recovery.agentDecision);
      }

      return {
        healed: true,
        recoveryEvidence: recovery.recoveryEvidence
      };
    }
  }

  protected async validateContract(contract: PageContract): Promise<ContractValidationResult> {
    return new PageValidationAgent(this.page).validateContract(contract);
  }

  protected async validateContractOrThrow(contract: PageContract) {
    const validation = await this.validateContract(contract);

    if (!validation.valid) {
      throw new Error(validation.explanation);
    }

    return validation;
  }
}
