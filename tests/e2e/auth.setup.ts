// Playwright's test tools as `setup`, with the [RESULT] block printed after it.
import { expected, test as setup } from "../../framework/fixtures/resultBlock";

// Where the Admin session is saved for the `authenticated` project to load.
const ADMIN_STORAGE = ".artifacts/auth/admin.json";

// Setup project: mint a REAL Admin session and persist it as storageState. The
// `authenticated` project depends on this and loads the cookie via use.storageState.
// We intentionally do NOT reset here — the webServer starts fresh, and a broad reset could
// race default-project specs that run in parallel.
setup("authenticate as admin", async ({ page }) => {
  expected(
    "set-session 2xx for Admin, and the cookie saved to .artifacts/auth/admin.json",
  );
  // Ask the test hook for an Admin session; stop here if it refuses.
  const response = await page.request.post("/api/test/set-session", {
    data: { role: "Admin" },
  });
  if (!response.ok()) {
    throw new Error(
      `auth.setup set-session failed: ${response.status()} ${await response.text()}`,
    );
  }
  // Save the browser's cookies so the authenticated specs start signed in.
  await page.context().storageState({ path: ADMIN_STORAGE });
});
