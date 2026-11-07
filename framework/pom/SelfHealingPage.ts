// The base class every page object extends. A click or a fill tries the page's
// own locator first; if that fails, the recovery router looks for the control
// by what it is for, and the test goes on. It also checks a page against its
// contract.

// Playwright's types for a locator and a page.
import type { Locator, Page } from "@playwright/test";
// The router that heals a failed locator.
import { RecoveryRouter } from "../agents/recovery/RecoveryRouter";
// The shapes of a page's actions and of its primary locator.
import type {
  PageActionProfile,
  PrimaryLocatorProfile,
} from "../agents/recovery/pageProfiles/types";
// The agent that checks a page against its contract, and the contract shapes.
import { PageValidationAgent } from "../agents/validation/PageValidationAgent";
import type {
  ContractValidationResult,
  PageContract,
} from "../agents/validation/contracts";

// What a click or fill reports: whether it needed healing, and the evidence.
type ActionResult = {
  healed: boolean;
  recoveryEvidence?: Record<string, unknown>;
};

// Shared by every page object; it is never used on its own.
export abstract class SelfHealingPage {
  // Each page object passes its page and a label, such as "Landing Page".
  protected constructor(
    protected readonly page: Page,
    protected readonly pageLabel: string,
  ) {}

  // Turns a profile's primary locator (by role, CSS selector or test id) into a
  // Playwright locator.
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

  // The same locator as text, for error messages and the recovery request.
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

  // Clicks the action's primary locator; heals it when the click fails.
  protected async clickAction(
    profile: PageActionProfile,
  ): Promise<ActionResult> {
    const locator = this.getLocator(profile.primary);

    // The fast path: the primary locator works, so nothing was healed.
    try {
      await locator.click({ timeout: profile.timeoutMs || 1200 });

      return {
        healed: false,
      };
      // The click failed: ask the router to find it by its intent words.
    } catch (error) {
      const recovery = await new RecoveryRouter(this.page).recover({
        failureEvidence: {
          errorMessage: error instanceof Error ? error.message : String(error),
          staleSelector: this.describePrimary(profile.primary),
          targetType: profile.targetType,
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
              targetType: profile.targetType,
            },
          },
        ],
      });

      // No healed control was found, so the step fails with the router's
      // reason.
      if (recovery.finalStatus !== "recovered") {
        throw new Error(recovery.agentDecision);
      }

      // Healed: report it with the evidence the router collected.
      return {
        healed: true,
        recoveryEvidence: recovery.recoveryEvidence,
      };
    }
  }

  // Fills the action's primary locator; heals it when the fill fails, the same
  // way as a click.
  protected async fillAction(
    profile: PageActionProfile,
    value: string,
  ): Promise<ActionResult> {
    const locator = this.getLocator(profile.primary);

    // The fast path: the field was found and filled.
    try {
      await locator.fill(value, { timeout: profile.timeoutMs || 1200 });

      return {
        healed: false,
      };
      // The fill failed: ask the router to find the field and fill it.
    } catch (error) {
      const recovery = await new RecoveryRouter(this.page).recover({
        failureEvidence: {
          errorMessage: error instanceof Error ? error.message : String(error),
          staleSelector: this.describePrimary(profile.primary),
          targetType: profile.targetType,
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
              targetType: profile.targetType,
            },
          },
        ],
      });

      // Still not found: the step fails with the router's reason.
      if (recovery.finalStatus !== "recovered") {
        throw new Error(recovery.agentDecision);
      }

      // Healed and filled.
      return {
        healed: true,
        recoveryEvidence: recovery.recoveryEvidence,
      };
    }
  }

  // Checks the page against a contract and returns the result.
  protected async validateContract(
    contract: PageContract,
  ): Promise<ContractValidationResult> {
    return new PageValidationAgent(this.page).validateContract(contract);
  }

  // The same check, but a page that fails it stops the test with the reason.
  protected async validateContractOrThrow(contract: PageContract) {
    const validation = await this.validateContract(contract);

    if (!validation.valid) {
      throw new Error(validation.explanation);
    }

    return validation;
  }
}
