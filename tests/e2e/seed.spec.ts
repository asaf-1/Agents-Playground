// tests/e2e/seed.spec.ts
// Seed for the official Playwright agents (planner / generator / healer).
// Its ONLY job: leave the app on a known, warm, clean page so that when the MCP runs
// this file (planner_setup_page / generator_setup_page) with pauseAtEnd, the agent
// drives a deterministic live page. There is NO auth in this app and nothing is stored
// client-side, so this seed captures NO credentials and needs NO storageState —
// determinism comes from the reset hook + stable API modes.
// Keep this side-effect-only: NO business assertions (those belong in generated tests).
import { test } from "@playwright/test";

test.describe("Seed", () => {
  test("seed", async ({ page }) => {
    // (1) Known clean server state. /api/test/reset-users clears runtimeState.managedUsers
    //     so User Manager add-user flows start deterministic. NOTE: it is the ONLY reset
    //     endpoint — it does NOT reset createdUsers, the flaky-orders runKey set, or the
    //     global orderRequestCount (no hooks exist for those).
    const reset = await page.request.post("/api/test/reset-users");
    if (!reset.ok()) {
      throw new Error(`Seed reset hook failed: ${reset.status()} ${await reset.text()}`);
    }

    // (2) Readiness probe — a dead server fails here once, not as many noisy failures later.
    const health = await page.request.get("/api/health");
    if (!health.ok()) {
      throw new Error(`Seed health probe failed: ${health.status()}`);
    }

    // (3) Warm the home page (primes file cache, validates routing). The agent navigates
    //     onward to any of the 8 routes: '/', '/dashboard', '/product/sku-123?state=valid',
    //     '/user-manager', '/orders', '/admin', '/profile', '/settings'.
    await page.goto("/");

    // Under the MCP setup_page path this test is PAUSED here. Under a plain
    // `npx playwright test tests/e2e/seed.spec.ts` it simply PASSES and exits — both expected.
  });
});

// Determinism cheat-sheet for tests generated off this seed:
//   - /orders status filter is fully deterministic (always mode=stable, client-side filter)
//     — no caveats. /dashboard is the RESILIENCE surface (mode/delay/flaky): there, assert
//     the orders "attempt" with a regex (/attempt \d+/) NOT a literal, and rely on the fresh
//     per-navigation runKey for flaky mode.
//   - User Manager "Add User" (#add-user-btn) fires TWO native window.prompt() calls (name,
//     then role): register page.on('dialog', d => d.accept(value)) handlers BEFORE clicking,
//     in order. Do not confuse it with the separate invite modal (data-testid=open-invite-modal).
//   - Broken product overlap is real CSS geometry — assert boundingBox intersection.
//   - Slow mode default is 7000ms (can exceed the default expect timeout) — use
//     ?mode=slow&delayMs=<small> or bump that one assertion's timeout.
