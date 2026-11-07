// The older, button-only healer, kept so code that still uses it works. It
// hands the work to GenericLocatorHealer and returns the button fields only.

// Playwright's type for a page.
import type { Page } from "@playwright/test";
// The healer that does the work.
import { GenericLocatorHealer } from "./GenericLocatorHealer";

// A candidate button, with the fields this older shape reported.
type ButtonCandidate = {
  className: string;
  index: number;
  left: number;
  score: number;
  testId: string | null;
  text: string;
  top: number;
};

// What to heal: the stale selector and the words for what the button does.
type HealOptions = {
  intentTokens: string[];
  staleSelector: string;
};

// What it reports: the chosen button, the runners-up, and why.
type HealResult = {
  agentDecision: string;
  engine: string;
  selectedCandidate: ButtonCandidate;
  topCandidates: ButtonCandidate[];
};

// Keeps only the button fields of a generic candidate.
function mapCandidate(candidate: {
  className: string;
  index: number;
  left: number;
  score: number;
  testId: string | null;
  text: string;
  top: number;
}): ButtonCandidate {
  return {
    className: candidate.className,
    index: candidate.index,
    left: candidate.left,
    score: candidate.score,
    testId: candidate.testId,
    text: candidate.text,
    top: candidate.top,
  };
}

// Heals a button that can no longer be found, then clicks the best match.
export class SelectorHealer {
  constructor(private readonly page: Page) {}

  // Asks the generic healer for a button click, then maps its answer back.
  async recoverFromMissingButton(options: HealOptions): Promise<HealResult> {
    const healed = await new GenericLocatorHealer(this.page).heal({
      action: "click",
      intentTokens: options.intentTokens,
      staleSelector: options.staleSelector,
      targetType: "button",
    });

    return {
      agentDecision: healed.agentDecision,
      engine: healed.engine,
      selectedCandidate: mapCandidate(healed.selectedCandidate),
      topCandidates: healed.topCandidates.map(mapCandidate),
    };
  }
}
