// Reads the script from disk.
import { readFileSync } from "node:fs";
// Playwright's test tools, with the [RESULT] block printed after every test.
import {
  expect,
  expected,
  fact,
  test,
} from "../../../framework/fixtures/resultBlock";
// The sync's decisions, as pure functions.
import {
  decidePull,
  installsFor,
  pcProgramsBehind,
} from "../../../scripts/local-sync.js";

// The guard on scripts/local-sync.js, the safe sync /recall runs: when it may
// pull, what it installs for what changed, what it says about the PC's own
// programs, and that it never writes to git. Offline: no git, no network.

// The repo's pins, in the shape readPins() returns, cut to what is compared.
const PINS = {
  node: [{ major: 26 }, { major: 26 }],
  terraform: { copies: [{ version: "1.17.1" }] },
  kind: { version: "v0.33.0" },
  k6: { version: "2.4.0" },
};

test.describe("Local sync (guard)", () => {
  // A pull only on main, with nothing uncommitted or untracked, and nothing
  // of its own ahead of GitHub.
  test("pulls only when that is safe", () => {
    expected(
      "up to date: no pull; behind on main and clean: pull; off main, dirty, or ahead: no pull with the reason",
    );
    const clean = { branch: "main", status: "", ahead: 0 };
    const cases = [
      [{ ...clean, behind: 0 }, false, "up to date"],
      [{ ...clean, behind: 3 }, true, "3 new commits"],
      [{ ...clean, behind: 1 }, true, "1 new commit"],
      [{ ...clean, behind: 2, branch: "feat/x" }, false, "on feat/x, not main"],
      [
        { ...clean, behind: 2, status: " M web/src/App.tsx" },
        false,
        "uncommitted or untracked files",
      ],
      [
        { ...clean, behind: 2, status: "?? notes.txt" },
        false,
        "uncommitted or untracked files",
      ],
      [
        { ...clean, behind: 2, ahead: 1 },
        false,
        "this PC has commits on main not on GitHub",
      ],
    ] as const;
    for (const [state, pull, reason] of cases) {
      expect(decidePull(state), JSON.stringify(state)).toEqual({
        pull,
        reason,
      });
    }
    fact("cases", cases.length);
  });

  // Only what the pull changed is installed.
  test("installs only what the pull changed", () => {
    expected(
      "lock file: npm ci; Playwright moved: its browser; a Terraform lock: that folder's init; nothing else changed: nothing",
    );
    const ids = (changed: string[], before = "1.65.0", after = "1.65.0") =>
      installsFor(changed, before, after).map((step) => step.id);
    expect(ids(["README.md"])).toEqual([]);
    expect(ids(["package-lock.json"])).toEqual(["npm"]);
    expect(ids(["package-lock.json"], "1.65.0", "1.66.0")).toEqual([
      "npm",
      "playwright",
    ]);
    expect(ids(["terraform/.terraform.lock.hcl"])).toEqual(["terraform"]);
    expect(ids(["terraform-github/.terraform.lock.hcl"])).toEqual([
      "terraform-github",
    ]);
    const npm = installsFor(["package-lock.json"], "a", "a")[0].command;
    fact("npm step", npm);
    expect(npm).toMatch(/^npm(\.cmd)? ci$/);
  });

  // The PC's own programs are compared, never installed.
  test("says which PC programs differ from the repo's pins", () => {
    expected(
      "Node 25 vs 26 and Terraform 1.16.2 vs 1.17.1 reported; matching kind and missing programs not",
    );
    const lines = pcProgramsBehind(PINS, {
      node: "25.3.0",
      terraform: "1.16.2",
      kind: "v0.33.0",
    });
    fact("lines", lines);
    expect(lines).toEqual([
      "Node on this PC is 25.3.0; the repo uses Node 26",
      "Terraform on this PC is 1.16.2; the repo pins 1.17.1",
    ]);
    expect(
      pcProgramsBehind(PINS, { node: "26.1.0", terraform: null, kind: null }),
    ).toEqual([]);
  });

  // k6 joins the PC check once the repo pins it (scripts/k6/run.js).
  test("says when this PC's k6 differs from the repo's k6 pin", () => {
    expected(
      "k6 1.8.2 vs the pin 2.4.0 reported; k6 2.4.0, or no k6, not reported",
    );
    const others = { node: "26.1.0", terraform: null, kind: null };
    const behind = pcProgramsBehind(PINS, { ...others, k6: "1.8.2" });
    fact("lines", behind);
    expect(behind, "an older k6 is named with the repo's pin").toEqual([
      "k6 on this PC is 1.8.2; the repo pins 2.4.0",
    ]);
    expect(
      pcProgramsBehind(PINS, { ...others, k6: "2.4.0" }),
      "the pinned k6 says nothing",
    ).toEqual([]);
    expect(
      pcProgramsBehind(PINS, { ...others, k6: null }),
      "a PC without k6 says nothing",
    ).toEqual([]);
  });

  // winget gets a release days after the tool's own site, so a pin can be
  // ahead of what winget can install (Terraform 1.17.2, 2026-11-20). Every
  // program the sync compares then says to wait, not to update.
  test("says to wait, not to update, when winget doesn't have the pinned version yet", async () => {
    expected(
      "winget behind the pin: 'not on winget yet ... nothing to do'; winget has it: the update command; winget unknown: the plain line; for Terraform, kind, k6 and Node",
    );
    const others = { node: "26.1.0", terraform: null, kind: null, k6: null };

    await test.step("Terraform: winget behind, winget has it, winget unknown", () => {
      const have = { ...others, terraform: "1.17.0" };
      expect(
        pcProgramsBehind(PINS, have, { terraform: "1.17.0" }),
        "winget has only what this PC has: wait",
      ).toEqual([
        "Terraform on this PC is 1.17.0; the repo pins 1.17.1, which is not on winget yet (it has 1.17.0): nothing to do until it is",
      ]);
      expect(
        pcProgramsBehind(PINS, have, { terraform: "1.17.1" }),
        "winget has the pin: the command that installs it",
      ).toEqual([
        "Terraform on this PC is 1.17.0; the repo pins 1.17.1 (update: winget upgrade --id Hashicorp.Terraform --exact)",
      ]);
      expect(
        pcProgramsBehind(PINS, have),
        "winget not asked (off Windows): the plain line",
      ).toEqual(["Terraform on this PC is 1.17.0; the repo pins 1.17.1"]);
      expect(
        pcProgramsBehind(
          PINS,
          { ...others, terraform: "1.16.0" },
          {
            terraform: "1.17.0",
          },
        ),
        "winget has something newer than this PC, short of the pin: that meanwhile",
      ).toEqual([
        "Terraform on this PC is 1.16.0; the repo pins 1.17.1, which is not on winget yet (it has 1.17.0); winget upgrade --id Hashicorp.Terraform --exact brings 1.17.0 meanwhile",
      ]);
    });

    await test.step("kind: winget's version has no 'v', the pin has one", () => {
      const have = { ...others, kind: "v0.32.0" };
      expect(
        pcProgramsBehind(PINS, have, { kind: "0.33.0" }),
        "0.33.0 on winget is the pin v0.33.0",
      ).toEqual([
        "kind on this PC is v0.32.0; the repo pins v0.33.0 (update: winget upgrade --id Kubernetes.kind --exact)",
      ]);
      expect(
        pcProgramsBehind(PINS, have, { kind: "0.32.0" }),
        "winget still on 0.32.0: wait",
      ).toEqual([
        "kind on this PC is v0.32.0; the repo pins v0.33.0, which is not on winget yet (it has 0.32.0): nothing to do until it is",
      ]);
    });

    await test.step("k6: the same rule", () => {
      expect(
        pcProgramsBehind(PINS, { ...others, k6: "2.3.0" }, { k6: "2.3.0" }),
        "winget still on 2.3.0: wait",
      ).toEqual([
        "k6 on this PC is 2.3.0; the repo pins 2.4.0, which is not on winget yet (it has 2.3.0): nothing to do until it is",
      ]);
    });

    await test.step("Node: compared by its major", () => {
      const have = { ...others, node: "24.11.0" };
      expect(
        pcProgramsBehind(PINS, have, { node: "24.11.0" }),
        "winget's LTS still Node 24: wait",
      ).toEqual([
        "Node on this PC is 24.11.0; the repo uses Node 26, which is not on winget yet (it has 24.11.0): nothing to do until it is",
      ]);
      expect(
        pcProgramsBehind(PINS, have, { node: "26.2.0" }),
        "winget's LTS is Node 26: the command",
      ).toEqual([
        "Node on this PC is 24.11.0; the repo uses Node 26 (update: winget upgrade --id OpenJS.NodeJS.LTS --exact)",
      ]);
    });
    fact("programs", "Terraform, kind, k6, Node");
  });

  // The version check rule (CLAUDE.md): winget is asked about our tools only,
  // each by its own id, never a bare winget list or upgrade.
  test("asks winget only by each program's own id", () => {
    expected(
      "every winget command in the script names --id and --exact; no winget list; the ids are among our seven work tools",
    );
    const code = readFileSync("scripts/local-sync.js", "utf8")
      .split("\n")
      .filter((line) => !line.trim().startsWith("//"))
      .join("\n");
    // winget's commands, not the word in the messages ("not on winget yet").
    const commands = [
      ...code.matchAll(
        /winget (?:show|upgrade|list|install|search|uninstall)\b[^`"\n]*/g,
      ),
    ].map((m) => m[0]);
    fact("winget commands", commands);
    expect(commands.length, "the script asks winget").toBeGreaterThan(0);
    for (const command of commands) {
      expect(command, `${command} names one program`).toContain("--id");
      expect(command, `${command} asks for the exact id`).toContain("--exact");
    }
    expect(code, "never a bare winget list").not.toMatch(/winget list/);
    const ours = [
      "Hashicorp.Terraform",
      "Kubernetes.kind",
      "GrafanaLabs.k6",
      "Python.Python.3.12",
      "GitHub.cli",
      "Git.Git",
      "OpenJS.NodeJS.LTS",
    ];
    const ids = [...code.matchAll(/"([A-Za-z]+\.[A-Za-z0-9.]+)"/g)]
      .map((m) => m[1])
      .filter((id) => /^[A-Z]/.test(id) && id.includes("."));
    fact("ids", ids);
    for (const id of ids) {
      expect(ours, `${id} is one of our work tools`).toContain(id);
    }
  });

  // It reads git and pulls; it never writes to it.
  test("never adds, commits, pushes, stashes, resets or switches", () => {
    expected(
      "the script's code has no git add, commit, push, stash, reset, checkout, switch, merge or rebase; its one pull is --ff-only",
    );
    const code = readFileSync("scripts/local-sync.js", "utf8")
      .split("\n")
      .filter((line) => !line.trim().startsWith("//"))
      .join("\n");
    expect(code).not.toMatch(
      /git (add|commit|push|stash|reset|checkout|switch|merge|rebase)\b/,
    );
    const pulls = [...code.matchAll(/git pull[^"]*/g)].map((m) => m[0]);
    fact("pulls", pulls);
    expect(pulls).toEqual(["git pull --ff-only -q origin main"]);
  });
});
