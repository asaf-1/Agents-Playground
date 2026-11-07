// The real OpenAI provider for the LLM self-healing agent. It sends the agent's
// list of allowed candidates to OpenAI and asks for one decision in a strict
// JSON shape. Used only when OPENAI_API_KEY holds a real key; the tests use a
// fake provider instead.

// The decision and provider shapes the agent defines.
import type {
  SelfHealingLlmDecision,
  SelfHealingLlmProvider,
  SelfHealingLlmProviderInput,
} from "./SelfHealingLlmAgent";

// Options, for tests: the key, the address, a fake fetch, and the model.
type OpenAiSelfHealingProviderOptions = {
  apiKey?: string;
  endpoint?: string;
  fetchImpl?: typeof fetch;
  model?: string;
};

// The only answer shape OpenAI may return: act or reject, which candidate,
// which action, how sure, why, and the risk.
const responseSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "recommendation",
    "selectedCandidateIndex",
    "allowedAction",
    "confidence",
    "rationale",
    "risk",
  ],
  properties: {
    recommendation: {
      type: "string",
      enum: ["act", "reject"],
    },
    selectedCandidateIndex: {
      type: "integer",
    },
    allowedAction: {
      type: "string",
      enum: ["click", "fill", "none", "select"],
    },
    confidence: {
      type: "number",
    },
    rationale: {
      type: "string",
    },
    risk: {
      type: "string",
    },
  },
};

// The text from OpenAI's answer, in either of its two shapes.
function extractOutputText(payload: any) {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  if (!Array.isArray(payload?.output)) {
    return "";
  }

  return payload.output
    .flatMap((item: any) => item.content || [])
    .map((item: any) => item.text?.value || item.text || "")
    .filter(Boolean)
    .join("\n")
    .trim();
}

// The decision as an object; an empty or non-JSON answer is an error.
function parseDecision(payload: unknown): SelfHealingLlmDecision {
  const text = extractOutputText(payload);

  if (!text) {
    throw new Error("OpenAI response did not contain output text.");
  }

  try {
    return JSON.parse(text) as SelfHealingLlmDecision;
  } catch (error) {
    throw new Error("OpenAI response output text was not valid JSON.");
  }
}

// True for a key that is still the example text.
function isPlaceholderApiKey(apiKey: string) {
  return /your-openai-api-key|sk-your-key|<key>|placeholder|replace-me/i.test(
    apiKey,
  );
}

// One provider holds its key, address, fetch and model.
export class OpenAiSelfHealingProvider implements SelfHealingLlmProvider {
  readonly backendLabel: string;
  private readonly apiKey: string | undefined;
  private readonly endpoint: string;
  private readonly fetchImpl: typeof fetch;
  private readonly model: string;

  // Takes each setting from the options, then the environment, then a default.
  constructor(options: OpenAiSelfHealingProviderOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
    this.endpoint = options.endpoint || "https://api.openai.com/v1/responses";
    this.fetchImpl = options.fetchImpl || globalThis.fetch;
    this.model = options.model || process.env.OPENAI_MODEL || "gpt-5.4-mini";
    this.backendLabel = `openai:${this.model}`;
  }

  // Asks OpenAI for one decision.
  async decide(
    input: SelfHealingLlmProviderInput,
    options: { timeoutMs?: number } = {},
  ): Promise<SelfHealingLlmDecision> {
    // No key, or the example key: refuse before calling.
    if (!this.apiKey) {
      throw new Error(
        "OPENAI_API_KEY is required for the live OpenAI self-healing provider.",
      );
    }

    if (isPlaceholderApiKey(this.apiKey)) {
      throw new Error(
        "OPENAI_API_KEY still contains placeholder text. Replace it with a real OpenAI API key.",
      );
    }

    // A time limit on the call (5 seconds unless the agent says otherwise).
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      options.timeoutMs || 5000,
    );

    // Send the allowed candidates, the rules, and the strict answer shape. The
    // answer is not stored on OpenAI's side.
    try {
      const response = await this.fetchImpl(this.endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.model,
          instructions:
            "You are a bounded QA self-healing advisor. Choose at most one action from the supplied allowedCandidates. Do not invent selectors, actions, or candidate indexes.",
          input: [
            {
              role: "user",
              content: [
                {
                  type: "input_text",
                  text: JSON.stringify(input),
                },
              ],
            },
          ],
          text: {
            format: {
              type: "json_schema",
              name: "self_healing_decision",
              strict: true,
              schema: responseSchema,
            },
          },
          store: false,
        }),
        signal: controller.signal,
      });

      // A refused call fails with its status and the start of the answer.
      if (!response.ok) {
        const responseText = await response.text().catch(() => "");
        const details = responseText ? `: ${responseText.slice(0, 500)}` : "";

        throw new Error(
          `OpenAI request failed with status ${response.status}${details}`,
        );
      }

      // The decision.
      return parseDecision(await response.json());
      // Always clear the timer.
    } finally {
      clearTimeout(timeout);
    }
  }
}
