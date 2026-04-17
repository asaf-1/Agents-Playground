import type { Page } from "@playwright/test";
import { GenericLocatorHealer } from "./GenericLocatorHealer";

type ButtonCandidate = {
  className: string;
  index: number;
  left: number;
  score: number;
  testId: string | null;
  text: string;
  top: number;
};

type HealOptions = {
  intentTokens: string[];
  staleSelector: string;
};

type HealResult = {
  agentDecision: string;
  engine: string;
  selectedCandidate: ButtonCandidate;
  topCandidates: ButtonCandidate[];
};

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
    top: candidate.top
  };
}

export class SelectorHealer {
  constructor(private readonly page: Page) {}

  async recoverFromMissingButton(options: HealOptions): Promise<HealResult> {
    const healed = await new GenericLocatorHealer(this.page).heal({
      action: "click",
      intentTokens: options.intentTokens,
      staleSelector: options.staleSelector,
      targetType: "button"
    });

    return {
      agentDecision: healed.agentDecision,
      engine: healed.engine,
      selectedCandidate: mapCandidate(healed.selectedCandidate),
      topCandidates: healed.topCandidates.map(mapCandidate)
    };
  }
}
