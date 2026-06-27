import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Component/unit tests for the React surface. Separate from Playwright (which
// owns the real-browser E2E suite under tests/e2e). Vitest only collects
// web/src/**/*.test.{ts,tsx}, so the two runners never overlap.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./web/test/setup.ts"],
    include: ["web/src/**/*.test.{ts,tsx}"],
    css: false,
    restoreMocks: true,
  },
});
