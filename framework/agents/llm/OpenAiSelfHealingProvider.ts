import type {
  SelfHealingLlmDecision,
  SelfHealingLlmProvider,
  SelfHealingLlmProviderInput,
} from "./SelfHealingLlmAgent";

type OpenAiSelfHealingProviderOptions = {
  apiKey?: string;
  endpoint?: string;
  fetchImpl?: typeof fetch;
  model?: string;
};

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

function isPlaceholderApiKey(apiKey: string) {
  return /your-openai-api-key|sk-your-key|<key>|placeholder|replace-me/i.test(
    apiKey,
  );
}

export class OpenAiSelfHealingProvider implements SelfHealingLlmProvider {
  readonly backendLabel: string;
  private readonly apiKey: string | undefined;
  private readonly endpoint: string;
  private readonly fetchImpl: typeof fetch;
  private readonly model: string;

  constructor(options: OpenAiSelfHealingProviderOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
    this.endpoint = options.endpoint || "https://api.openai.com/v1/responses";
    this.fetchImpl = options.fetchImpl || globalThis.fetch;
    this.model = options.model || process.env.OPENAI_MODEL || "gpt-5.4-mini";
    this.backendLabel = `openai:${this.model}`;
  }

  async decide(
    input: SelfHealingLlmProviderInput,
    options: { timeoutMs?: number } = {},
  ): Promise<SelfHealingLlmDecision> {
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

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      options.timeoutMs || 5000,
    );

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

      if (!response.ok) {
        const responseText = await response.text().catch(() => "");
        const details = responseText ? `: ${responseText.slice(0, 500)}` : "";

        throw new Error(
          `OpenAI request failed with status ${response.status}${details}`,
        );
      }

      return parseDecision(await response.json());
    } finally {
      clearTimeout(timeout);
    }
  }
}
