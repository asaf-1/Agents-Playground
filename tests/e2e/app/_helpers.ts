import type { APIRequestContext } from "@playwright/test";

// Arms drift flags for a single runKey via the existing per-runKey flag store.
// Each test uses a unique runKey so armed drift never leaks across tests.
export async function armFlags(
  request: APIRequestContext,
  runKey: string,
  flags: Record<string, unknown>,
): Promise<void> {
  const response = await request.post("/api/test/flags", {
    data: { runKey, flags },
  });
  if (!response.ok()) {
    throw new Error(
      `Failed to arm flags for ${runKey}: ${response.status()} ${await response.text()}`,
    );
  }
}
