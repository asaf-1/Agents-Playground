// The LLM self-healing agent. When a locator fails, it lists up to 8 visible
// controls of the right kind and asks a model to pick one. The model may only
// choose from that list, and the agent checks the answer before it acts. It is
// off unless switched on, and with OpenAI it only advises unless told to act.

// Playwright's type for a page, the failure and locator shapes, and the real
// OpenAI provider.
import type { Page } from "@playwright/test";
import type { FailureSignalInput } from "../diagnosis/types";
import type { LocatorAction, LocatorTargetType } from "../recovery/types";
import { OpenAiSelfHealingProvider } from "./OpenAiSelfHealingProvider";

// Off; advise only (report what the model would do); or act on the model's
// choice, within limits.
export type SelfHealingLlmMode = "bounded-action" | "disabled" | "report-only";

// One control the model may choose, as it is shown to the model.
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

// The model's answer: act or reject, which control, which action, how sure,
// why, and the risk.
export type SelfHealingLlmDecision = {
  allowedAction: LocatorAction | "none";
  confidence: number;
  rationale: string;
  recommendation: "act" | "reject";
  risk: string;
  selectedCandidateIndex: number;
};

// What the model is given.
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

// Anything that can answer: the real OpenAI provider, or a fake in tests.
export type SelfHealingLlmProvider = {
  backendLabel: string;
  decide(
    input: SelfHealingLlmProviderInput,
    options?: { timeoutMs?: number },
  ): Promise<SelfHealingLlmDecision>;
};

// What the agent is asked to recover.
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

// What it reports: whether it acted, the candidates, the model's answer, how it
// ended and, when it refused, why.
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

// Options: how many candidates, how sure the model must be, the mode, and the
// time limit.
type SelfHealingLlmAgentOptions = {
  maxCandidates?: number;
  minConfidence?: number;
  mode?: SelfHealingLlmMode;
  timeoutMs?: number;
};

// The actions a model answer may name.
const allowedActions: Array<LocatorAction | "none"> = [
  "click",
  "fill",
  "none",
  "select",
];

// The CSS for every control of one kind (the same lists as the generic healer).
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

// The mode: as given, or from REAL_LLM_AGENT_MODE; with the OpenAI backend and
// no mode set, advise only; otherwise off.
function resolveMode(mode?: SelfHealingLlmMode): SelfHealingLlmMode {
  if (mode) {
    return mode;
  }

  const rawMode = process.env.REAL_LLM_AGENT_MODE?.toLowerCase();

  if (
    rawMode === "bounded-action" ||
    rawMode === "report-only" ||
    rawMode === "disabled"
  ) {
    return rawMode;
  }

  return process.env.REAL_LLM_AGENT_BACKEND?.toLowerCase() === "openai"
    ? "report-only"
    : "disabled";
}

// The real OpenAI provider when REAL_LLM_AGENT_BACKEND is "openai"; none
// otherwise.
function resolveDefaultProvider(): SelfHealingLlmProvider | undefined {
  return process.env.REAL_LLM_AGENT_BACKEND?.toLowerCase() === "openai"
    ? new OpenAiSelfHealingProvider()
    : undefined;
}

// True when an answer has every field, with the right types.
function isDecision(value: unknown): value is SelfHealingLlmDecision {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    (candidate.recommendation === "act" ||
      candidate.recommendation === "reject") &&
    typeof candidate.selectedCandidateIndex === "number" &&
    Number.isInteger(candidate.selectedCandidateIndex) &&
    typeof candidate.confidence === "number" &&
    allowedActions.includes(
      candidate.allowedAction as LocatorAction | "none",
    ) &&
    typeof candidate.rationale === "string" &&
    typeof candidate.risk === "string"
  );
}

// One agent per page.
export class SelfHealingLlmAgent {
  private readonly maxCandidates: number;
  private readonly minConfidence: number;
  private readonly mode: SelfHealingLlmMode;
  private readonly timeoutMs: number;

  // The provider (or none) and the options, with their defaults: 8 candidates,
  // 0.7 confidence, 5 seconds.
  constructor(
    private readonly page: Page,
    private readonly provider:
      SelfHealingLlmProvider | undefined = resolveDefaultProvider(),
    options: SelfHealingLlmAgentOptions = {},
  ) {
    this.maxCandidates = options.maxCandidates || 8;
    this.minConfidence = options.minConfidence ?? 0.7;
    this.mode = resolveMode(options.mode);
    this.timeoutMs = options.timeoutMs || 5000;
  }

  // Tries to recover one failed action.
  async recover(
    request: SelfHealingLlmRecoveryRequest,
  ): Promise<SelfHealingLlmRecoveryResult> {
    // Off, or no provider: do nothing.
    if (this.mode === "disabled" || !this.provider) {
      return {
        acted: false,
        agentDecision:
          "The real LLM self-healing agent is disabled, so no model call or bounded action was attempted.",
        candidates: [],
        decision: null,
        engine: "deterministic",
        finalStatus: "disabled",
        rejectionReason: "llm-disabled",
        recoveryEvidence: {},
      };
    }

    // The visible candidates; none means nothing to choose from.
    const candidates = await this.collectCandidates(request.targetType);

    if (candidates.length === 0) {
      return {
        acted: false,
        agentDecision:
          "The real LLM self-healing agent found no visible bounded candidate actions.",
        candidates,
        decision: null,
        engine: this.engineLabel(),
        finalStatus: "failed",
        rejectionReason: "no-candidates",
        recoveryEvidence: {},
      };
    }

    // Ask the model. A failed call or a malformed answer ends safely, with no
    // action.
    let decision: SelfHealingLlmDecision;

    try {
      const rawDecision = await this.provider.decide(
        {
          allowedAction: request.action,
          allowedCandidates: candidates,
          failureEvidence: request.failureEvidence,
          intentTokens: request.intentTokens,
          pageLabel: request.pageLabel,
          scenario: request.scenario,
          staleSelector: request.staleSelector,
          targetType: request.targetType,
        },
        { timeoutMs: this.timeoutMs },
      );

      if (!isDecision(rawDecision)) {
        throw new Error(
          "Provider returned an invalid self-healing decision shape.",
        );
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
        recoveryEvidence: {},
      };
    }

    // Advise-only mode: report the model's choice without acting on it.
    if (this.mode === "report-only") {
      return {
        acted: false,
        agentDecision:
          "The real LLM self-healing agent produced an advisory decision in report-only mode.",
        candidates,
        decision,
        engine: this.engineLabel(),
        finalStatus: "advisory",
        rejectionReason: null,
        recoveryEvidence: {
          mode: this.mode,
          selectedCandidate:
            candidates[decision.selectedCandidateIndex] || null,
        },
      };
    }

    // Act mode: refuse an answer that breaks the limits.
    const rejectionReason = this.getActionRejectionReason(
      decision,
      request,
      candidates,
    );

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
          mode: this.mode,
        },
      };
    }

    // Act on the chosen control, and report it.
    const selectedCandidate = candidates[decision.selectedCandidateIndex];
    await this.performAction(selectedCandidate, request);

    return {
      acted: true,
      agentDecision: `The real LLM self-healing agent selected bounded candidate ${selectedCandidate.index} and performed ${request.action}.`,
      candidates,
      decision,
      engine: this.engineLabel(),
      finalStatus: "recovered",
      rejectionReason: null,
      recoveryEvidence: {
        mode: this.mode,
        selectedCandidate,
      },
    };
  }

  // The visible controls of the kind, numbered 0 to 7 for the model.
  private async collectCandidates(
    targetType: LocatorTargetType,
  ): Promise<SelfHealingCandidateAction[]> {
    const candidateSelector = getCandidateSelector(targetType);
    // Read them in the browser, skipping hidden ones.
    const rawCandidates = await this.page
      .locator(candidateSelector)
      .evaluateAll((elements) => {
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
                "",
            };
          })
          .filter(Boolean);
      });

    // Keep the first 8 and number them.
    return (rawCandidates as Array<Omit<SelfHealingCandidateAction, "index">>)
      .slice(0, this.maxCandidates)
      .map((candidate, index) => ({
        ...candidate,
        index,
      }));
  }

  // Names the engine in the report, such as
  // "llm:openai:gpt-5.4-mini:report-only".
  private engineLabel() {
    return `llm:${this.provider?.backendLabel || "unknown"}:${this.mode}`;
  }

  // Why an answer is refused, or null when it may be used: the model said
  // reject, named another action, was not sure enough, or picked a number that
  // is not on the list.
  private getActionRejectionReason(
    decision: SelfHealingLlmDecision,
    request: SelfHealingLlmRecoveryRequest,
    candidates: SelfHealingCandidateAction[],
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

    if (
      !Number.isInteger(decision.selectedCandidateIndex) ||
      !candidates[decision.selectedCandidateIndex]
    ) {
      return "selected-candidate-out-of-range";
    }

    return null;
  }

  // Fills, selects or clicks the chosen control, found again by its place on
  // the page.
  private async performAction(
    selectedCandidate: SelfHealingCandidateAction,
    request: SelfHealingLlmRecoveryRequest,
  ) {
    const target = this.page
      .locator(getCandidateSelector(request.targetType))
      .nth(selectedCandidate.domIndex);

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
            await this.page
              .getByRole("option", { name: request.selectValue })
              .first()
              .click();
          }
        }
        break;
      default:
        await target.click();
        break;
    }
  }
}
