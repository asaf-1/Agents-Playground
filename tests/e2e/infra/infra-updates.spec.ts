// Reads the workflow file from disk.
import { readFileSync } from "node:fs";
// Playwright's test tools, with the [RESULT] block printed after every test.
import {
  expect,
  expected,
  fact,
  test,
} from "../../../framework/fixtures/resultBlock";
// The updater's hold list, which the weekly run uses for Prettier.
import { heldPackages } from "../../../scripts/infra-versions.js";

// The guard on .github/workflows/infra-updates.yml, the weekly tools bot. It
// holds the bot's token (INFRA_UPDATE_TOKEN), which can push branches and
// workflow files, so what keeps it safe is pinned here: where the token is
// used, which branch it may push, and what it leaves to Asaf. Offline: the
// file is read as text.

const FILE = ".github/workflows/infra-updates.yml";
const workflow = readFileSync(FILE, "utf8");
// The same file without its comment lines, for the "never" checks.
const code = workflow
  .split("\n")
  .filter((line) => !line.trim().startsWith("#"))
  .join("\n");
// The trigger names under `on:` (two-space indent).
const triggers = workflow.match(/^on:\n([\s\S]*?)^\S/m)?.[1] ?? "";
const triggerNames = [...triggers.matchAll(/^ {2}([a-z_]+):/gm)].map(
  (match) => match[1],
);

test.describe("Infra Updates workflow (guard)", () => {
  // Weekly, or by hand; never from a PR or a push.
  test("runs weekly or by hand, never from a PR or a push", () => {
    expected(
      "triggers: schedule (Tuesday 06:37 UTC) and workflow_dispatch only; no pull_request_target",
    );
    fact("triggers", triggerNames);
    expect([...triggerNames].sort()).toEqual(["schedule", "workflow_dispatch"]);
    expect(workflow).toContain('cron: "37 6 * * 2"');
    expect(code).not.toMatch(/pull_request_target/);
  });

  // The job itself only reads; the bot's token does the writing, in two
  // steps only, and is never stored where an npm install could read it.
  test("reads with its own token, and uses the bot's token in two steps only", () => {
    expected(
      "top permissions {}; the job: contents read; checkout keeps no credentials; INFRA_UPDATE_TOKEN only in the token check and the PR step; no other secret",
    );
    expect(code).toContain("persist-credentials: false");
    expect(workflow).toMatch(/^permissions: \{\}$/m);
    const jobPermissions = workflow
      .match(/^ {4}permissions:\n((?: {6}.+\n)+)/m)?.[1]
      .trim()
      .split("\n")
      .map((line) => line.replace(/#.*$/, "").trim());
    expect(jobPermissions).toEqual(["contents: read"]);
    const uses = [...code.matchAll(/secrets\.([A-Z_]+)/g)].map((m) => m[1]);
    fact("secrets used", uses);
    expect(uses).toEqual(["INFRA_UPDATE_TOKEN", "INFRA_UPDATE_TOKEN"]);
  });

  // It pushes its own dated branch and opens a labelled PR; never main, never
  // with force.
  test("pushes only its own bot branch and opens a labelled PR", () => {
    expected(
      "branch bot/infra-updates-<date>; git push of that branch only; no --force; no push to main; PR labelled infra-update; tracked files only (git add -u)",
    );
    expect(code).toContain('branch="bot/infra-updates-$(date -u +%Y-%m-%d)"');
    const pushes = [...code.matchAll(/git push[^\n]*/g)].map((m) => m[0]);
    fact("pushes", pushes);
    expect(pushes).toEqual([
      'git push -q "https://x-access-token:${GH_TOKEN}@github.com/${GITHUB_REPOSITORY}.git" "$branch"',
    ]);
    expect(code).not.toMatch(/--force|-f origin|origin main|HEAD:main/);
    expect(code).toContain("--label infra-update");
    expect(code).toContain("git add -u");
    expect(code).not.toMatch(/git add (-A|\.)/);
  });

  // What stays with Asaf: Prettier held here; a hand run opens no PR.
  test("holds Prettier, and a hand run is a dry run", () => {
    expected(
      "INFRA_HOLD: prettier; dry_run defaults to true; heldPackages reads INFRA_HOLD as a comma list",
    );
    expect(workflow).toContain("INFRA_HOLD: prettier");
    expect(workflow).toMatch(/dry_run:\n(?: {8}.+\n)*? {8}default: true/);
    const held = heldPackages({ INFRA_HOLD: " prettier, typescript ," });
    fact("held", Object.keys(held));
    expect(Object.keys(held)).toEqual(["prettier", "typescript"]);
    expect(heldPackages({})).toEqual({});
  });
});
