// The API diagnosis agent: given one API call and its answer, it finds the
// field and the types behind the failure, classes it, proposes a permanent
// fix, and writes a short explanation (rewritten by OpenAI when a key is set).
//
// The root cause comes from one of two places: the answer's own typed
// "problem" part (field, expectedType, receivedType), or, when the caller names
// the answer's schema, a check of the answer against that schema in
// bank/openapi.json (a field whose type is not the one promised). On the bank,
// the planted fault productSchemaDrift is the case: GET /api/products sends a
// price as text while the schema says a number.

// The classifier, the optional OpenAI rewriter and the fix proposer.
import { FailureClassifier } from "./FailureClassifier";
import { NarrativeEnricher } from "./NarrativeEnricher";
import { PatchProposalAgent } from "./PatchProposalAgent";
// The classification, fix and wrong-type field shapes.
import type {
  FailureClassification,
  PatchProposal,
  SchemaMismatch,
} from "./types";
// The check of an answer against its schema in bank/openapi.json.
import { typeMismatches } from "../../helpers/openApiSchema";

// What it is given: the call (its address, and its body when it had one), the
// API's status, headers and text, and optionally the schema the answer must
// match (a name under components/schemas in bank/openapi.json).
type ApiDiagnosisOptions = {
  requestBody?: Record<string, unknown>;
  requestUrl: string;
  responseHeaders: Record<string, string>;
  responseSchema?: string;
  responseText: string;
  scenario?: string;
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
  rootCause: SchemaMismatch;
  schemaMismatches: SchemaMismatch[];
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

// The address without its query string, as the fix proposer names a route.
function routeOf(requestUrl: string) {
  return requestUrl.split("?")[0];
}

// Built from three agents; tests can pass their own.
export class ApiDiagnosisAgent {
  constructor(
    private readonly narrativeEnricher = new NarrativeEnricher(),
    private readonly classifier = new FailureClassifier(),
    private readonly patchProposalAgent = new PatchProposalAgent(),
  ) {}

  // Diagnoses one call.
  async diagnose(options: ApiDiagnosisOptions): Promise<ApiDiagnosisResult> {
    // The answer, its "problem" part when it has one, and the fields that break
    // the schema when the caller named one.
    const responseBody = tryParseJson(options.responseText);
    const responseHeaders = options.responseHeaders;
    const problem =
      typeof responseBody === "object" &&
      responseBody !== null &&
      typeof (responseBody as any).problem === "object"
        ? (responseBody as any).problem
        : null;
    const schemaMismatches = options.responseSchema
      ? typeMismatches(options.responseSchema, responseBody)
      : [];
    // The root cause: the problem part first, then the first wrong-type field,
    // and "unknown" when the answer names neither.
    const rootCause: SchemaMismatch = problem?.field
      ? {
          expectedType: String(problem.expectedType || "unknown"),
          field: String(problem.field),
          receivedType: String(problem.receivedType || "unknown"),
        }
      : schemaMismatches[0] || {
          expectedType: "unknown",
          field: "unknown",
          receivedType: "unknown",
        };
    const route = routeOf(options.requestUrl);
    // The answer's own suggestion, or one built from the root cause.
    const suggestion = String(
      (responseBody as any)?.suggestion ||
        (rootCause.field === "unknown"
          ? `Capture the full request and answer of ${route} and compare them with its contract in bank/openapi.json.`
          : `Send ${rootCause.field} as ${rootCause.expectedType}, as the contract in bank/openapi.json says, or change the contract on purpose.`),
    );
    // The failure's class and the proposed permanent fix.
    const classification = this.classifier.classify({
      requestUrl: options.requestUrl,
      responseBody,
      responseHeaders,
      responseStatus: options.status,
      schemaMismatches,
    });
    const patchProposal = this.patchProposalAgent.propose({
      apiRoute: route,
      classification,
      requestUrl: options.requestUrl,
      responseBody,
      responseHeaders,
      responseStatus: options.status,
      rootCause,
      scenario: options.scenario || "api-error-diagnosis",
    });
    // A plain explanation, which the rewriter may turn into shorter sentences.
    const where = options.responseSchema
      ? `the ${options.responseSchema} schema in bank/openapi.json`
      : "the route's contract";
    const deterministicExplanation =
      rootCause.field === "unknown"
        ? `${route} answered ${options.status}, but the answer names no field or type behind it, so the root cause needs more evidence.`
        : `${route} answered ${options.status} with ${rootCause.field} as ${rootCause.receivedType}, while ${where} says ${rootCause.expectedType}. A client that does arithmetic on it gets the wrong result, so the permanent fix is to make both sides agree on the type again.`;
    const narrative = await this.narrativeEnricher.enrich(
      deterministicExplanation,
    );

    // Everything for the report.
    return {
      agentDecision: `Captured the request, the response headers and the response body of ${route}, then classified the incident as ${classification.category} after tracing it to a ${rootCause.receivedType} value for ${rootCause.field} where ${rootCause.expectedType} was expected.`,
      classification,
      engine: narrative.engine,
      explanation: narrative.text,
      patchProposal,
      responseBody,
      responseHeaders,
      rootCause,
      schemaMismatches,
      status: options.status,
      suggestion,
    };
  }
}
