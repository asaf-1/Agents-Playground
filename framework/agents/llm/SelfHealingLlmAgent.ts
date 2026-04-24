import type { Page } from "@playwright/test";
import type { FailureSignalInput } from "../diagnosis/types";
import type { LocatorAction, LocatorTargetType } from "../recovery/types";
import { OpenAiSelfHealingProvider } from "./OpenAiSelfHealingProvider";

export type SelfHealingLlmMode = "bounded-action" | "disabled" | "report-only";

export type SelfHealingCandidateAction = {
  ariaLabel: string | null;
  className: string;
  domIndex: number;
  href: string | null;
  index: number;
  role: string | null;
  tagName: string;
  testId: string | null;
  text: string;
};

export type SelfHealingLlmDecision = {
  allowedAction: LocatorAction | "none";
  confidence: number;
  rationale: string;
  recommendation: "act" | "reject";
  risk: string;
  selectedCandidateIndex: number;
};

export type SelfHealingLlmProviderInput = {
  allowedAction: LocatorAction;
  allowedCandidates: SelfHealingCandidateAction[];
  failureEvidence: FailureSignalInput;
  intentTokens: string[];
  pageLabel?: string;
  scenario: string;
  staleSelector: string;
  targetType: LocatorTargetType;
};

export type SelfHealingLlmProvider = {
  backendLabel: string;
  decide(input: SelfHealingLlmProviderInput, options?: { timeoutMs?: number }): Promise<SelfHealingLlmDecision>;
};

export type SelfHealingLlmRecoveryRequest = {
  action: LocatorAction;
  failureEvidence: FailureSignalInput;
  fillValue?: string;
  intentTokens: string[];
  pageLabel?: string;
  scenario: string;
  selectValue?: string;
  staleSelector: string;
  targetType: LocatorTargetType;
};

export type SelfHealingLlmRecoveryResult = {
  acted: boolean;
  agentDecision: string;
  candidates: SelfHealingCandidateAction[];
  decision: SelfHealingLlmDecision | null;
  engine: string;
  finalStatus: "advisory" | "disabled" | "failed" | "recovered" | "rejected";
  rejectionReason: string | null;
  recoveryEvidence: Record<string, unknown>;
};

type SelfHealingLlmAgentOptions = {
  maxCandidates?: number;
  minConfidence?: number;
  mode?: SelfHealingLlmMode;
  timeoutMs?: number;
};

const allowedActions: Array<LocatorAction | "none"> = ["click", "fill", "none", "select"];

function getCandidateSelector(targetType: LocatorTargetType) {
  switch (targetType) {
    case "link":
      return "a[href], [role='link']";
    case "input":
      return "input:not([type='hidden']), textarea, select, [role='textbox'], [role='searchbox'], [role='combobox']";
    case "menuitem":
      return "[role='menuitem'], [role='menuitemcheckbox'], [role='menuitemradio']";
    case "select":
      return "select, [role='combobox']";
    default:
      return "button, [role='button'], summary";
  }
}

function resolveMode(mode?: SelfHealingLlmMode): SelfHealingLlmMode {
  if (mode) {
    return mode;
  }

  const rawMode = process.env.REAL_LLM_AGENT_MODE?.toLowerCase();

  if (rawMode === "bounded-action" || rawMode === "report-only" || rawMode === "disabled") {
    return rawMode;
  }

  return process.env.REAL_LLM_AGENT_BACKEND?.toLowerCase() === "openai"
    ? "report-only"
    : "disabled";
}

function resolveDefaultProvider(): SelfHealingLlmProvider | undefined {
  return process.env.REAL_LLM_AGENT_BACKEND?.toLowerCase() === "openai"
    ? new OpenAiSelfHealingProvider()
    : undefined;
}

function isDecision(value: unknown): value is SelfHealingLlmDecision {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    (candidate.recommendation === "act" || candidate.recommendation === "reject") &&
    typeof candidate.selectedCandidateIndex === "number" &&
    Number.isInteger(candidate.selectedCandidateIndex) &&
    typeof candidate.confidence === "number" &&
    allowedActions.includes(candidate.allowedAction as LocatorAction | "none") &&
    typeof candidate.rationale === "string" &&
    typeof candidate.risk === "string"
  );
}

export class SelfHealingLlmAgent {
  private readonly maxCandidates: number;
  private readonly minConfidence: number;
  private readonly mode: SelfHealingLlmMode;
  private readonly timeoutMs: number;

  constructor(
    private readonly page: Page,
    private readonly provider: SelfHealingLlmProvider | undefined = resolveDefaultProvider(),
    options: SelfHealingLlmAgentOptions = {}
  ) {
    this.maxCandidates = options.maxCandidates || 8;
    this.minConfidence = options.minConfidence ?? 0.7;
    this.mode = resolveMode(options.mode);
    this.timeoutMs = options.timeoutMs || 5000;
  }

  async recover(request: SelfHealingLlmRecoveryRequest): Promise<SelfHealingLlmRecoveryResult> {
    if (this.mode === "disabled" || !this.provider) {
      return {
        acted: false,
        agentDecision: "The real LLM self-healing agent is disabled, so no model call or bounded action was attempted.",
        candidates: [],
        decision: null,
        engine: "deterministic",
        finalStatus: "disabled",
        rejectionReason: "llm-disabled",
        recoveryEvidence: {}
      };
    }

    const candidates = await this.collectCandidates(request.targetType);

    if (candidates.length === 0) {
      return {
        acted: false,
        agentDecision: "The real LLM self-healing agent found no visible bounded candidate actions.",
        candidates,
        decision: null,
        engine: this.engineLabel(),
        finalStatus: "failed",
        rejectionReason: "no-candidates",
        recoveryEvidence: {}
      };
    }

    let decision: SelfHealingLlmDecision;

    try {
      const rawDecision = await this.provider.decide({
        allowedAction: request.action,
        allowedCandidates: candidates,
        failureEvidence: request.failureEvidence,
        intentTokens: request.intentTokens,
        pageLabel: request.pageLabel,
        scenario: request.scenario,
        staleSelector: request.staleSelector,
        targetType: request.targetType
      }, { timeoutMs: this.timeoutMs });

      if (!isDecision(rawDecision)) {
        throw new Error("Provider returned an invalid self-healing decision shape.");
      }

      decision = rawDecision;
    } catch (error) {
      return {
        acted: false,
        agentDecision: `The real LLM self-healing provider failed safely: ${error instanceof Error ? error.message : String(error)}`,
        candidates,
        decision: null,
        engine: this.engineLabel(),
        finalStatus: "failed",
        rejectionReason: "provider-failed",
        recoveryEvidence: {}
      };
    }

    if (this.mode === "report-only") {
      return {
        acted: false,
        agentDecision: "The real LLM self-healing agent produced an advisory decision in report-only mode.",
        candidates,
        decision,
        engine: this.engineLabel(),
        finalStatus: "advisory",
        rejectionReason: null,
        recoveryEvidence: {
          mode: this.mode,
          selectedCandidate: candidates[decision.selectedCandidateIndex] || null
        }
      };
    }

    const rejectionReason = this.getActionRejectionReason(decision, request, candidates);

    if (rejectionReason) {
      return {
        acted: false,
        agentDecision: `The real LLM self-healing agent rejected the bounded action: ${rejectionReason}.`,
        candidates,
        decision,
        engine: this.engineLabel(),
        finalStatus: "rejected",
        rejectionReason,
        recoveryEvidence: {
          mode: this.mode
        }
      };
    }

    const selectedCandidate = candidates[decision.selectedCandidateIndex];
    await this.performAction(selectedCandidate, request);

    return {
      acted: true,
      agentDecision:
        `The real LLM self-healing agent selected bounded candidate ${selectedCandidate.index} and performed ${request.action}.`,
      candidates,
      decision,
      engine: this.engineLabel(),
      finalStatus: "recovered",
      rejectionReason: null,
      recoveryEvidence: {
        mode: this.mode,
        selectedCandidate
      }
    };
  }

  private async collectCandidates(targetType: LocatorTargetType): Promise<SelfHealingCandidateAction[]> {
    const candidateSelector = getCandidateSelector(targetType);
    const rawCandidates = await this.page.locator(candidateSelector).evaluateAll((elements) => {
      return elements
        .map((element, domIndex) => {
          const htmlElement = element as HTMLElement & { href?: string };
          const rect = htmlElement.getBoundingClientRect();
          const style = window.getComputedStyle(htmlElement);
          const isVisible =
            style.visibility !== "hidden" &&
            style.display !== "none" &&
            !htmlElement.hasAttribute("hidden") &&
            rect.width > 0 &&
            rect.height > 0;

          if (!isVisible) {
            return null;
          }

          return {
            ariaLabel: htmlElement.getAttribute("aria-label"),
            className: htmlElement.className || "",
            domIndex,
            href: htmlElement.getAttribute("href"),
            role: htmlElement.getAttribute("role"),
            tagName: htmlElement.tagName.toLowerCase(),
            testId: htmlElement.getAttribute("data-testid"),
            text:
              htmlElement.textContent?.trim() ||
              htmlElement.getAttribute("value") ||
              htmlElement.getAttribute("aria-label") ||
              htmlElement.getAttribute("placeholder") ||
              ""
          };
        })
        .filter(Boolean);
    });

    return (rawCandidates as Array<Omit<SelfHealingCandidateAction, "index">>)
      .slice(0, this.maxCandidates)
      .map((candidate, index) => ({
        ...candidate,
        index
      }));
  }

  private engineLabel() {
    return `llm:${this.provider?.backendLabel || "unknown"}:${this.mode}`;
  }

  private getActionRejectionReason(
    decision: SelfHealingLlmDecision,
    request: SelfHealingLlmRecoveryRequest,
    candidates: SelfHealingCandidateAction[]
  ) {
    if (decision.recommendation !== "act") {
      return "provider-recommended-reject";
    }

    if (decision.allowedAction !== request.action) {
      return `provider-requested-${decision.allowedAction}-but-only-${request.action}-is-allowed`;
    }

    if (decision.confidence < this.minConfidence) {
      return `confidence-${decision.confidence.toFixed(2)}-below-${this.minConfidence.toFixed(2)}`;
    }

    if (!Number.isInteger(decision.selectedCandidateIndex) || !candidates[decision.selectedCandidateIndex]) {
      return "selected-candidate-out-of-range";
    }

    return null;
  }

  private async performAction(
    selectedCandidate: SelfHealingCandidateAction,
    request: SelfHealingLlmRecoveryRequest
  ) {
    const target = this.page.locator(getCandidateSelector(request.targetType)).nth(selectedCandidate.domIndex);

    switch (request.action) {
      case "fill":
        await target.fill(request.fillValue || "");
        break;
      case "select":
        if (selectedCandidate.tagName === "select") {
          await target.selectOption(request.selectValue || "");
        } else {
          await target.click();

          if (request.selectValue) {
            await this.page.getByRole("option", { name: request.selectValue }).first().click();
          }
        }
        break;
      default:
        await target.click();
        break;
    }
  }
}
