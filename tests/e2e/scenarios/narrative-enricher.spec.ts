import { expect, test } from "@playwright/test";
import { NarrativeEnricher } from "../../../framework/agents/diagnosis/NarrativeEnricher";

type FetchCall = {
  url: string;
  init: RequestInit | undefined;
};

let originalFetch: typeof globalThis.fetch;
let originalApiKey: string | undefined;
let originalModel: string | undefined;

function installFetch(handler: (call: FetchCall) => Response | Promise<Response>) {
  const calls: FetchCall[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const call = { url, init };
    calls.push(call);
    return handler(call);
  }) as typeof globalThis.fetch;
  return calls;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

test.describe("NarrativeEnricher", () => {
  test.beforeEach(() => {
    originalFetch = globalThis.fetch;
    originalApiKey = process.env.OPENAI_API_KEY;
    originalModel = process.env.OPENAI_MODEL;
  });

  test.afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalApiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalApiKey;
    if (originalModel === undefined) delete process.env.OPENAI_MODEL;
    else process.env.OPENAI_MODEL = originalModel;
  });

  test("returns deterministic engine when OPENAI_API_KEY is missing", async () => {
    delete process.env.OPENAI_API_KEY;
    const calls = installFetch(() => {
      throw new Error("fetch should not be called when OPENAI_API_KEY is unset");
    });

    const result = await new NarrativeEnricher().enrich("base diagnosis");

    expect(result.engine).toBe("deterministic");
    expect(result.text).toBe("base diagnosis");
    expect(calls).toHaveLength(0);
  });

  test("falls back to deterministic when the OpenAI request returns a non-ok status", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    installFetch(() => new Response("upstream error", { status: 500 }));

    const result = await new NarrativeEnricher().enrich("base diagnosis");

    expect(result.engine).toBe("deterministic");
    expect(result.text).toBe("base diagnosis");
  });

  test("falls back to deterministic when the OpenAI payload contains no output text", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    installFetch(() => jsonResponse({ output: [] }));

    const result = await new NarrativeEnricher().enrich("base diagnosis");

    expect(result.engine).toBe("deterministic");
    expect(result.text).toBe("base diagnosis");
  });

  test("returns enriched text from output_text when OpenAI succeeds", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    process.env.OPENAI_MODEL = "gpt-test-model";
    installFetch(() =>
      jsonResponse({ output_text: "  Concise enriched diagnosis.  " })
    );

    const result = await new NarrativeEnricher().enrich("base diagnosis");

    expect(result.engine).toBe("openai:gpt-test-model");
    expect(result.text).toBe("Concise enriched diagnosis.");
  });

  test("flattens structured output[].content[].text into the enriched narrative", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    installFetch(() =>
      jsonResponse({
        output: [
          {
            content: [
              { text: { value: "Line one." } },
              { text: "Line two." }
            ]
          }
        ]
      })
    );

    const result = await new NarrativeEnricher().enrich("base");

    expect(result.text).toBe("Line one.\nLine two.");
    expect(result.engine).toMatch(/^openai:/);
  });

  // KNOWN ISSUE (docs/obsidian-vault/AGENT_MEMORY.md → Known Issues):
  // NarrativeEnricher targets the OpenAI Responses endpoint. This test pins
  // the current URL so any silent endpoint drift surfaces here, and so the
  // fix lands together with an updated assertion.
  test("currently posts to the /v1/responses endpoint (known-issue lock)", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    const calls = installFetch(() => jsonResponse({ output_text: "ok" }));

    await new NarrativeEnricher().enrich("base diagnosis");

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.openai.com/v1/responses");
    expect(calls[0].init?.method).toBe("POST");
    const headers = calls[0].init?.headers as Record<string, string> | undefined;
    expect(headers?.Authorization).toBe("Bearer test-key");
    expect(headers?.["Content-Type"]).toBe("application/json");
  });

  test("sends the configured model and prompt in the request body", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    process.env.OPENAI_MODEL = "gpt-test-model";
    const calls = installFetch(() => jsonResponse({ output_text: "ok" }));

    await new NarrativeEnricher().enrich("the qa diagnosis text");

    const body = JSON.parse(String(calls[0].init?.body));
    expect(body.model).toBe("gpt-test-model");
    expect(body.input).toContain("the qa diagnosis text");
    expect(body.input).toContain("2-3 direct sentences");
  });

  test("falls back to deterministic when the OpenAI request aborts or throws", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    installFetch(() => {
      throw new Error("network down");
    });

    const result = await new NarrativeEnricher().enrich("base diagnosis");

    expect(result.engine).toBe("deterministic");
    expect(result.text).toBe("base diagnosis");
  });
});
