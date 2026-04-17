export type ScenarioReport = {
  scenario: string;
  initialFailure: string;
  evidence: Record<string, unknown>;
  agentDecision: string;
  finalStatus: string;
  suggestedPermanentFix: string;
  engine: string;
};
