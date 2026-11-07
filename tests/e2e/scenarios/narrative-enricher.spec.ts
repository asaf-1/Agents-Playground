/** Playwright's test tools, with the [RESULT] block printed after every test. */
import {
  expect,
  expected,
  fact,
  test,
} from "../../../framework/fixtures/resultBlock";
/** The enricher under test: it asks OpenAI to rewrite a diagnosis, or keeps the original. */
import { NarrativeEnricher } from "../../../framework/agents/diagnosis/NarrativeEnricher";

/** One call the fake fetch received: where to, and with what. */
type FetchCall = {
  url: string;
  init: RequestInit | undefined;
};

/** The real fetch and settings, kept so each test can put them back. */
let originalFetch: typeof globalThis.fetch;
let originalApiKey: string | undefined;
let originalModel: string | undefined;

/**
 * Replaces fetch with a fake that answers with `handler` and records each call.
 * No test here reaches the real OpenAI.
 */
function installFetch(
  handler: (call: FetchCall) => Response | Promise<Response>,
) {
  const calls: FetchCall[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const call = { url, init };
    calls.push(call);
    return handler(call);
  }) as typeof globalThis.fetch;
  return calls;
}

/** A fake JSON answer. */
function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test.describe("NarrativeEnricher", () => {
  // Before each test: remember the real fetch, key and model.
  test.beforeEach(() => {
    originalFetch = globalThis.fetch;
    originalApiKey = process.env.OPENAI_API_KEY;
    originalModel = process.env.OPENAI_MODEL;
  });

  // After each test: put them back exactly as they were.
  test.afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalApiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalApiKey;
    if (originalModel === undefined) delete process.env.OPENAI_MODEL;
    else process.env.OPENAI_MODEL = originalModel;
  });

  // With no key set, nothing is sent and the diagnosis comes back unchanged.
  test("returns deterministic engine when OPENAI_API_KEY is missing", async () => {
    expected("engine deterministic, text unchanged, 0 fetch calls");
    delete process.env.OPENAI_API_KEY;
    const calls = installFetch(() => {
      throw new Error(
        "fetch should not be called when OPENAI_API_KEY is unset",
      );
    });

    const result = await new NarrativeEnricher().enrich("base diagnosis");
    fact("engine", result.engine);

    expect(result.engine).toBe("deterministic");
    expect(result.text).toBe("base diagnosis");
    expect(calls).toHaveLength(0);
  });

  // A 500 from OpenAI falls back to the original text.
  test("falls back to deterministic when the OpenAI request returns a non-ok status", async () => {
    expected("engine deterministic, text unchanged");
    process.env.OPENAI_API_KEY = "test-key";
    installFetch(() => new Response("upstream error", { status: 500 }));

    const result = await new NarrativeEnricher().enrich("base diagnosis");
    fact("engine", result.engine);

    expect(result.engine).toBe("deterministic");
    expect(result.text).toBe("base diagnosis");
  });

  // An answer with no text falls back to the original text.
  test("falls back to deterministic when the OpenAI payload contains no output text", async () => {
    expected("engine deterministic, text unchanged");
    process.env.OPENAI_API_KEY = "test-key";
    installFetch(() => jsonResponse({ output: [] }));

    const result = await new NarrativeEnricher().enrich("base diagnosis");
    fact("engine", result.engine);

    expect(result.engine).toBe("deterministic");
    expect(result.text).toBe("base diagnosis");
  });

  // A good answer's output_text is used, trimmed, and the engine names the model.
  test("returns enriched text from output_text when OpenAI succeeds", async () => {
    expected(
      "engine openai:gpt-test-model, text 'Concise enriched diagnosis.'",
    );
    process.env.OPENAI_API_KEY = "test-key";
    process.env.OPENAI_MODEL = "gpt-test-model";
    installFetch(() =>
      jsonResponse({ output_text: "  Concise enriched diagnosis.  " }),
    );

    const result = await new NarrativeEnricher().enrich("base diagnosis");
    fact("engine", result.engine);

    expect(result.engine).toBe("openai:gpt-test-model");
    expect(result.text).toBe("Concise enriched diagnosis.");
  });

  // Text spread over output[].content[] is joined, one piece per line.
  test("flattens structured output[].content[].text into the enriched narrative", async () => {
    expected("text 'Line one.\\nLine two.', engine openai:...");
    process.env.OPENAI_API_KEY = "test-key";
    installFetch(() =>
      jsonResponse({
        output: [
          {
            content: [{ text: { value: "Line one." } }, { text: "Line two." }],
          },
        ],
      }),
    );

    const result = await new NarrativeEnricher().enrich("base");
    fact("engine", result.engine);

    expect(result.text).toBe("Line one.\nLine two.");
    expect(result.engine).toMatch(/^openai:/);
  });

  // Endpoint lock: NarrativeEnricher targets the OpenAI Responses endpoint.
  // This keeps the provider surface explicit if the integration changes later.
  test("posts to the /v1/responses endpoint", async () => {
    expected(
      "one POST to https://api.openai.com/v1/responses with a Bearer key and JSON content type",
    );
    process.env.OPENAI_API_KEY = "test-key";
    const calls = installFetch(() => jsonResponse({ output_text: "ok" }));

    await new NarrativeEnricher().enrich("base diagnosis");
    fact("posted to", calls[0]?.url);

    // One call, to the right place, with the right headers.
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.openai.com/v1/responses");
    expect(calls[0].init?.method).toBe("POST");
    const headers = calls[0].init?.headers as
      Record<string, string> | undefined;
    expect(headers?.Authorization).toBe("Bearer test-key");
    expect(headers?.["Content-Type"]).toBe("application/json");
  });

  // The body carries the configured model and a prompt holding the diagnosis.
  test("sends the configured model and prompt in the request body", async () => {
    expected(
      "body model gpt-test-model; input contains the diagnosis and '2-3 direct sentences'",
    );
    process.env.OPENAI_API_KEY = "test-key";
    process.env.OPENAI_MODEL = "gpt-test-model";
    const calls = installFetch(() => jsonResponse({ output_text: "ok" }));

    await new NarrativeEnricher().enrich("the qa diagnosis text");

    // Read back what was sent.
    const body = JSON.parse(String(calls[0].init?.body));
    fact("model", body.model);
    expect(body.model).toBe("gpt-test-model");
    expect(body.input).toContain("the qa diagnosis text");
    expect(body.input).toContain("2-3 direct sentences");
  });

  // A network error falls back to the original text.
  test("falls back to deterministic when the OpenAI request aborts or throws", async () => {
    expected("engine deterministic, text unchanged");
    process.env.OPENAI_API_KEY = "test-key";
    installFetch(() => {
      throw new Error("network down");
    });

    const result = await new NarrativeEnricher().enrich("base diagnosis");
    fact("engine", result.engine);

    expect(result.engine).toBe("deterministic");
    expect(result.text).toBe("base diagnosis");
  });
});
