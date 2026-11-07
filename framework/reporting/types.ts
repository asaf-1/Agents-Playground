// What a scenario writes to its report: the scenario, the first failure, the
// evidence, what the agent decided, how it ended, the permanent fix it
// suggests, and which engine decided (rules or an LLM).
export type ScenarioReport = {
  scenario: string;
  initialFailure: string;
  evidence: Record<string, unknown>;
  agentDecision: string;
  finalStatus: string;
  suggestedPermanentFix: string;
  engine: string;
};
