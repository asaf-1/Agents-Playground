import { defineConfig } from "@playwright/test";
// Builds the test folder's path from the repository root.
import path from "node:path";
// The main config, in the root. Its paths and its server already start from
// the root, so reusing it from this folder finds the same outputs and server.
import base from "../playwright.config";

// Opt-in visual-regression run: `npm run test:visual`. Kept OUT of the gated
// suite (its own testDir) because screenshot baselines are platform-specific
// (local Windows vs the Linux CI runner). Generate/update baselines with:
//   npm run test:visual -- --update-snapshots
export default defineConfig({
  ...base,
  testDir: path.resolve(__dirname, "..", "tests/visual"),
});
