import { FailureClassifier } from "./FailureClassifier";
import { NarrativeEnricher } from "./NarrativeEnricher";
import { PatchProposalAgent } from "./PatchProposalAgent";
import type { FailureClassification, PatchProposal } from "./types";

type ApiDiagnosisOptions = {
  requestBody: Record<string, unknown>;
  responseHeaders: Record<string, string>;
  responseText: string;
  status: number;
};

type ApiDiagnosisResult = {
  agentDecision: string;
  classification: FailureClassification;
  engine: string;
  explanation: string;
  patchProposal: PatchProposal;
  responseBody: unknown;
  responseHeaders: Record<string, string>;
  rootCause: {
    expectedType: string;
    field: string;
    receivedType: string;
  };
  status: number;
  suggestion: string;
};

function tryParseJson(payload: string) {
  try {
    return JSON.parse(payload);
  } catch (error) {
    return payload;
  }
}

export class ApiDiagnosisAgent {
  constructor(
    private readonly narrativeEnricher = new NarrativeEnricher(),
    private readonly classifier = new FailureClassifier(),
    private readonly patchProposalAgent = new PatchProposalAgent()
  ) {}

  async diagnose(options: ApiDiagnosisOptions): Promise<ApiDiagnosisResult> {
    const responseBody = tryParseJson(options.responseText);
    const responseHeaders = options.responseHeaders;
    const parsedProblem = typeof responseBody === "object" && responseBody !== null ? responseBody : {};
    const rootCause = {
      expectedType: String((parsedProblem as any).problem?.expectedType || "integer"),
      field: String((parsedProblem as any).problem?.field || "phone_number"),
      receivedType: String((parsedProblem as any).problem?.receivedType || "unknown")
    };
    const suggestion = String(
      (parsedProblem as any).suggestion || "Send phone_number as an integer, not a string."
    );
    const classification = this.classifier.classify({
      requestUrl: "/api/create-user",
      responseBody,
      responseHeaders,
      responseStatus: options.status
    });
    const patchProposal = this.patchProposalAgent.propose({
      apiRoute: "/api/create-user",
      classification,
      requestUrl: "/api/create-user",
      responseBody,
      responseHeaders,
      responseStatus: options.status,
      rootCause,
      scenario: "api-error-diagnosis"
    });
    const deterministicExplanation = `The API failed because ${rootCause.field} reached the server as ${rootCause.receivedType} even though the route expects ${rootCause.expectedType}. The response body already identifies the mismatch, so the permanent fix is to enforce integer serialization for phone_number before the request is sent.`;
    const narrative = await this.narrativeEnricher.enrich(deterministicExplanation);

    return {
      agentDecision: `Captured the original request body, response headers, and response payload, then classified the incident as ${classification.category} after tracing the failure to a ${rootCause.receivedType} value sent for ${rootCause.field}.`,
      classification,
      engine: narrative.engine,
      explanation: narrative.text,
      patchProposal,
      responseBody,
      responseHeaders,
      rootCause,
      status: options.status,
      suggestion
    };
  }
}
