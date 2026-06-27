type NarrativeResult = {
  text: string;
  engine: string;
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

export class NarrativeEnricher {
  async enrich(baseText: string): Promise<NarrativeResult> {
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return {
        text: baseText,
        engine: "deterministic",
      };
    }

    const model = process.env.OPENAI_MODEL || "gpt-5.4-mini";
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          input: `Rewrite the following QA diagnosis in 2-3 direct sentences without changing the facts:\n\n${baseText}`,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(
          `OpenAI request failed with status ${response.status}.`,
        );
      }

      const payload = await response.json();
      const enrichedText = extractOutputText(payload);

      if (!enrichedText) {
        throw new Error("OpenAI response did not contain output text.");
      }

      return {
        text: enrichedText,
        engine: `openai:${model}`,
      };
    } catch (error) {
      return {
        text: baseText,
        engine: "deterministic",
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
