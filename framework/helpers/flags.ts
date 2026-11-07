// The type of a request context.
import type { APIRequestContext } from "@playwright/test";
// Adds a line to the running test's [RESULT] block.
import { fact } from "../fixtures/resultBlock";

// Arms drift flags for a single runKey via the existing per-runKey flag store.
// Each test uses a unique runKey so armed drift never leaks across tests.
export async function armFlags(
  request: APIRequestContext,
  runKey: string,
  flags: Record<string, unknown>,
): Promise<void> {
  // The block shows which flags were armed, and for which runKey.
  fact("runKey", runKey);
  fact("flags", flags);
  const response = await request.post("/api/test/flags", {
    data: { runKey, flags },
  });
  // A refusal stops the test here, with the server's answer.
  if (!response.ok()) {
    throw new Error(
      `Failed to arm flags for ${runKey}: ${response.status()} ${await response.text()}`,
    );
  }
}
