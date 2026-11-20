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
