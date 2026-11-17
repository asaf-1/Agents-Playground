// The test tools, and the type of an API answer.
import { expect, test, type APIResponse } from "@playwright/test";
// Adds a line to the running test's [RESULT] block.
import { fact } from "../fixtures/resultBlock";

// A status check that says why it failed. Every new API test uses it (the test
// rules, md/plans/feedback-fixes-plan.md): the rule in words, and on a wrong
// status, what the server answered. So a failure reads
//   Error: the first transfer is created — the server answered 400:
//   INVALID_INPUT · Check the fields. · amount: Enter an amount.
// instead of "expected 201, received 400".

// Longest server answer printed, so one failure stays a few lines.
const ANSWER_MAX = 300;

// The text cut to `max` characters, with … when it was longer.
function shorten(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

// A field list ({ amount: "Enter an amount." }) as "amount: Enter an amount.".
function fieldsOf(errors: unknown): string[] {
  if (!errors || typeof errors !== "object") return [];
  return Object.entries(errors as Record<string, unknown>).map(
    ([field, problem]) => `${field}: ${String(problem)}`,
  );
}

// What the server said, in one line. The bank answers { code, message,
// errors }; a problem+json answers { title, detail }; anything else is shown
// as its first characters.
async function serverSaid(response: APIResponse): Promise<string> {
  // The body as text; Playwright keeps it, so the test can still read it.
  let text: string;
  try {
    text = await response.text();
  } catch {
    return "no body";
  }
  if (!text.trim()) return "an empty body";
  // A JSON answer: its code, its sentence, and the fields it named.
  try {
    const body = JSON.parse(text) as Record<string, unknown>;
    const sentence = body.message ?? body.detail ?? body.title ?? body.error;
    const parts = [body.code, sentence]
      .filter((part) => typeof part === "string" && part)
      .map(String)
      .concat(fieldsOf(body.errors));
    if (parts.length) return shorten(parts.join(" · "), ANSWER_MAX);
  } catch {
    // Not JSON: fall through to the text itself.
  }
  return shorten(text.trim(), ANSWER_MAX);
}

// The check itself: `rule` says what should be true, in words, e.g.
// await expectStatus(first, 201, "the first transfer is created").
export async function expectStatus(
  response: APIResponse,
  status: number,
  rule: string,
): Promise<void> {
  // A boxed step named after the rule: a failure points at the test's line
  // that called this, not at this file, in the terminal and in results.json.
  await test.step(
    rule,
    async () => {
      const actual = response.status();
      // Right status: a plain check with the rule as its message.
      if (actual === status) {
        expect(actual, rule).toBe(status);
        return;
      }
      // Wrong status: the server's answer goes in the message and in the
      // [RESULT] block, so the why is in the terminal, results.json and the
      // block.
      const answer = await serverSaid(response);
      fact("server answered", `${actual}: ${answer}`);
      expect(actual, `${rule} — the server answered ${actual}: ${answer}`).toBe(
        status,
      );
    },
    { box: true },
  );
}
