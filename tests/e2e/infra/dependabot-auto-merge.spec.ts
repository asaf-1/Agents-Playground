// Reads the workflow file from disk.
import { readFileSync } from "node:fs";
// Playwright's test tools, with the [RESULT] block printed after every test.
import {
  expect,
  expected,
  fact,
  test,
} from "../../../framework/fixtures/resultBlock";

// The guard on .github/workflows/dependabot-auto-merge.yml, the workflow that
// merges the two bots' PRs by itself (Dependabot's providers, and the weekly
// tools bot's). Everyone else's PRs, and the regular auto-merge /push arms,
// are not its business. It holds write access to the repository,
// so the properties that keep it safe are pinned here, and a change that
// loosens one fails the suite instead of going unnoticed in a review.
// Offline: the file is read as text (the project has no YAML parser, and adds
// none for this).

const FILE = ".github/workflows/dependabot-auto-merge.yml";
const workflow = readFileSync(FILE, "utf8");
// The same file without its comment lines, for the "never uses" checks: the
// comments name pull_request_target and secrets to explain why they are not
// used.
const code = workflow
  .split("\n")
  .filter((line) => !line.trim().startsWith("#"))
  .join("\n");

// The `on:` block: from `on:` to the next top-level key.
const triggers = workflow.match(/^on:\n([\s\S]*?)^\S/m)?.[1] ?? "";
// The trigger names under `on:` (two-space indent).
const triggerNames = [...triggers.matchAll(/^ {2}([a-z_]+):/gm)].map(
  (match) => match[1],
);

test.describe("Bot Auto-Merge workflow (guard)", () => {
  // Runs only when started by hand, or (once timed) on a schedule: never on a
  // PR, so no PR's code ever runs with its token.
  test("starts only by hand or on a schedule, never from a PR or a push", () => {
    expected(
      "triggers within workflow_dispatch and schedule; no pull_request, pull_request_target, push or workflow_run",
    );
    fact("triggers", triggerNames);
    expect(triggerNames).toContain("workflow_dispatch");
    for (const name of triggerNames) {
      expect(["workflow_dispatch", "schedule"], name).toContain(name);
    }
    expect(code).not.toMatch(/pull_request_target/);
  });

  // Nothing granted at the top; the one job gets exactly four permissions.
  test("asks for the least it needs, and uses no secret", () => {
    expected(
      "top-level permissions {}; the job: contents, pull-requests and actions write, checks read; no secrets.*; no checkout",
    );
    expect(workflow).toMatch(/^permissions: \{\}$/m);
    const jobPermissions = workflow
      .match(/^ {4}permissions:\n((?: {6}.+\n)+)/m)?.[1]
      .trim()
      .split("\n")
      .map((line) => line.replace(/#.*$/, "").trim());
    fact("job permissions", jobPermissions);
    expect(jobPermissions).toEqual([
      "contents: write",
      "pull-requests: write",
      "actions: write",
      "checks: read",
    ]);
    // Its own GITHUB_TOKEN only, and never a PR's code on disk.
    expect(code).not.toMatch(/secrets\./);
    expect(code).not.toMatch(/actions\/checkout/);
  });

  // Only the two bots' PRs: anyone else's, Asaf's own included, is left alone.
  test("takes only the two bots' PRs, and leaves every other PR alone", () => {
    expected(
      "Dependabot by its author; the tools bot by owner + bot/infra-updates-* branch + infra-update label; anything else 'left alone'; a PR number must be digits; inputs only through the environment",
    );
    expect(workflow).toContain(
      '[ "$author" = "app/dependabot" ] || [ "$author" = "dependabot[bot]" ]',
    );
    expect(workflow).toContain('[ "$author" = "$OWNER" ]');
    expect(workflow).toContain('[[ "$branch" == bot/infra-updates-* ]]');
    expect(workflow).toContain('index("infra-update")');
    expect(workflow).toContain("not a bot's PR: left alone");
    expect(workflow).toContain('[[ "$ONLY_PR" =~ ^[0-9]+$ ]]');
    // Inputs reach the script through the environment, never pasted into it.
    const script = workflow.slice(workflow.indexOf("run: |"));
    expect(script).not.toMatch(/\$\{\{\s*(inputs|github\.event)/);
  });

  // Each bot may change only its own files, and never the gate or this file.
  test("lets each bot change only its own files", () => {
    expected(
      "Dependabot: terraform/ and terraform-github/ only; the tools bot: the updater's files; neither: pr-validation.yml, this workflow, or the app's code",
    );
    // The patterns as GitHub reads them: single-quoted YAML keeps backslashes.
    const pattern = (name: string) =>
      new RegExp(
        workflow.match(new RegExp(`${name}: ['"](.+)['"]$`, "m"))?.[1] ?? "$^",
      );
    const dependabot = pattern("DEPENDABOT_FILES");
    const tools = pattern("TOOLS_FILES");
    const never = pattern("NEVER_FILES");
    const may = (allowed: RegExp, file: string) =>
      allowed.test(file) && !never.test(file);
    const cases: [string, RegExp, string, boolean][] = [
      ["dependabot", dependabot, "terraform/.terraform.lock.hcl", true],
      ["dependabot", dependabot, "terraform-github/versions.tf", true],
      ["dependabot", dependabot, "package.json", false],
      ["tools", tools, "package-lock.json", true],
      ["tools", tools, ".github/workflows/k8s-canary.yml", true],
      ["tools", tools, "Dockerfile.e2e", true],
      ["tools", tools, ".github/workflows/pr-validation.yml", false],
      ["tools", tools, ".github/workflows/dependabot-auto-merge.yml", false],
      ["tools", tools, "server.js", false],
      ["tools", tools, "web/src/App.tsx", false],
    ];
    fact(
      "cases",
      cases.map(
        ([bot, , file, ok]) => `${bot} ${file}: ${ok ? "may" : "may not"}`,
      ),
    );
    for (const [bot, allowed, file, ok] of cases) {
      expect(may(allowed, file), `${bot} ${file}`).toBe(ok);
    }
  });

  // The proof before the merge, and the runs after it.
  test("merges only after the gates and the cluster, then starts the post-merge runs", () => {
    expected(
      "Pre-Merge Gate always, and validate, scan and zap when the files start them; the k8s canary on the bot's branch; merge pinned to the checked commit; three post-merge workflows started on main",
    );
    expect(workflow).toContain('need=("Pre-Merge Gate")');
    expect(workflow).toContain('need+=("validate")');
    expect(workflow).toContain('need+=("scan")');
    expect(workflow).toContain('need+=("zap")');
    expect(workflow).toContain('result=$(check "$sha" "$name")');
    expect(workflow).toContain(
      'gh workflow run k8s-canary.yml --ref "$ref" -f provisioner=terraform',
    );
    expect(workflow).toContain('canary "$branch"');
    expect(workflow).toContain(
      'gh pr merge "$pr" --squash --delete-branch --match-head-commit "$sha"',
    );
    const started = workflow.match(/for workflow in ([^;]+);/)?.[1].split(" ");
    fact("started after a merge", started);
    expect(started).toEqual([
      "main-validation.yml",
      "post-merge-canary.yml",
      "k8s-canary.yml",
    ]);
  });

  // A hand run is a dry run unless told otherwise.
  test("a run by hand is a dry run by default", () => {
    expected("dry_run defaults to true; DRY_RUN is false only off a hand run");
    expect(workflow).toMatch(/dry_run:\n(?: {8}.+\n)*? {8}default: true/);
    expect(workflow).toContain(
      "DRY_RUN: ${{ github.event_name == 'workflow_dispatch' && inputs.dry_run && 'true' || 'false' }}",
    );
  });
});
