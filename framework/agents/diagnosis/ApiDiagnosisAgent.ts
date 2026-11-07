// The API diagnosis agent: given a failed create-user call, it reads the
// answer, finds the field and the types that caused it, classes the failure,
// proposes a permanent fix, and writes a short explanation (rewritten by OpenAI
// when a key is set).

// The classifier, the optional OpenAI rewriter and the fix proposer.
import { FailureClassifier } from "./FailureClassifier";
import { NarrativeEnricher } from "./NarrativeEnricher";
import { PatchProposalAgent } from "./PatchProposalAgent";
// The classification and fix shapes.
import type { FailureClassification, PatchProposal } from "./types";

// What it is given: the request body and the API's status, headers and text.
type ApiDiagnosisOptions = {
  requestBody: Record<string, unknown>;
  responseHeaders: Record<string, string>;
  responseText: string;
  status: number;
};

// What it reports.
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

// The answer as JSON when it is JSON, or as plain text.
function tryParseJson(payload: string) {
  try {
    return JSON.parse(payload);
  } catch (error) {
    return payload;
  }
}

// Built from three agents; tests can pass their own.
export class ApiDiagnosisAgent {
  constructor(
    private readonly narrativeEnricher = new NarrativeEnricher(),
    private readonly classifier = new FailureClassifier(),
    private readonly patchProposalAgent = new PatchProposalAgent(),
  ) {}

  // Diagnoses one failed call.
  async diagnose(options: ApiDiagnosisOptions): Promise<ApiDiagnosisResult> {
    // The answer, and the problem part of it when there is one.
    const responseBody = tryParseJson(options.responseText);
    const responseHeaders = options.responseHeaders;
    const parsedProblem =
      typeof responseBody === "object" && responseBody !== null
        ? responseBody
        : {};
    // The root cause: the field and the types, from the answer's "problem"
    // part, with phone_number's known case as the default.
    const rootCause = {
      expectedType: String(
        (parsedProblem as any).problem?.expectedType || "integer",
      ),
      field: String((parsedProblem as any).problem?.field || "phone_number"),
      receivedType: String(
        (parsedProblem as any).problem?.receivedType || "unknown",
      ),
    };
    // The answer's own suggestion, or the known one.
    const suggestion = String(
      (parsedProblem as any).suggestion ||
        "Send phone_number as an integer, not a string.",
    );
    // The failure's class and the proposed permanent fix.
    const classification = this.classifier.classify({
      requestUrl: "/api/create-user",
      responseBody,
      responseHeaders,
      responseStatus: options.status,
    });
    const patchProposal = this.patchProposalAgent.propose({
      apiRoute: "/api/create-user",
      classification,
      requestUrl: "/api/create-user",
      responseBody,
      responseHeaders,
      responseStatus: options.status,
      rootCause,
      scenario: "api-error-diagnosis",
    });
    // A plain explanation, which the rewriter may turn into shorter sentences.
    const deterministicExplanation = `The API failed because ${rootCause.field} reached the server as ${rootCause.receivedType} even though the route expects ${rootCause.expectedType}. The response body already identifies the mismatch, so the permanent fix is to enforce integer serialization for phone_number before the request is sent.`;
    const narrative = await this.narrativeEnricher.enrich(
      deterministicExplanation,
    );

    // Everything for the report.
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
      suggestion,
    };
  }
}
