import { test as setup } from "@playwright/test";

const ADMIN_STORAGE = ".artifacts/auth/admin.json";

// Setup project: mint a REAL Admin session and persist it as storageState. The
// `authenticated` project depends on this and loads the cookie via use.storageState.
// We intentionally do NOT reset here — the webServer starts fresh, and a broad reset could
// race default-project specs that run in parallel.
setup("authenticate as admin", async ({ page }) => {
  const response = await page.request.post("/api/test/set-session", {
    data: { role: "Admin" },
  });
  if (!response.ok()) {
    throw new Error(
      `auth.setup set-session failed: ${response.status()} ${await response.text()}`,
    );
  }
  await page.context().storageState({ path: ADMIN_STORAGE });
});
