import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

// Opt-in visual-regression run: `npm run test:visual`. Kept OUT of the gated
// suite (its own testDir) because screenshot baselines are platform-specific
// (local Windows vs the Linux CI runner). Generate/update baselines with:
//   npm run test:visual -- --update-snapshots
export default defineConfig({
  ...base,
  testDir: "./tests/visual",
});
