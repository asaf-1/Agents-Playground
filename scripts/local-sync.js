// One sync of this repo with GitHub's main, run by /recall at the start of a
// session (Asaf, 2026-11-16: "recall always will pull the new changes"). The
// bots update versions on GitHub; this brings them to the PC.
//
// It pulls only when that is safe: on main, with nothing uncommitted or
// untracked, and as a fast-forward. Then it installs only what the pull
// changed, and says which programs on this PC are behind the repo's pins, and
// whether winget has the pinned version yet (it gets a release days after the
// tool's own site, so a pin can be ahead of what winget can install). It
// never stashes, commits, pushes or switches branch, never touches gitignored
// files (md/, .artifacts/, .env, STATUS.md, node_modules), and never installs a
// program for the whole PC (Node, Terraform, kind, Docker serve other repos).
//
//   node scripts/local-sync.js           sync, print one line, write the log
//   node scripts/local-sync.js --check   say what a sync would do; change nothing
//
// The log: .artifacts/local-sync/latest.json and one dated file per run.

// Node's process, file, network and path tools.
const { execSync } = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");
// The repo's pinned versions, read the way the infra updater reads them, and
// its rule for which of two versions is newer.
const { compareVersions, readPins } = require("./infra-versions.js");

// The repo's root, where the log goes, and npm's names on this OS.
const ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(ROOT, ".artifacts", "local-sync");
const NPM = process.platform === "win32" ? "npm.cmd" : "npm";
const NPX = process.platform === "win32" ? "npx.cmd" : "npx";
// Ports a local server of this repo listens on: the app, and Vite's dev server.
const SERVER_PORTS = [4173, 5173];
// Each PC program compared with a pin, and its winget id: the only names the
// sync asks winget about, each by its own id, never a bare winget list.
const WINGET_IDS = {
  node: "OpenJS.NodeJS.LTS",
  terraform: "Hashicorp.Terraform",
  kind: "Kubernetes.kind",
  k6: "GrafanaLabs.k6",
};

// Runs a command in the repo and returns its output; throws when it fails.
function sh(command) {
  return execSync(command, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

// The same, or null when it fails (a program that is not installed).
function trySh(command) {
  try {
    return sh(command);
  } catch {
    return null;
  }
}

// Whether a pull is safe now, and why not when it is not.
function decidePull({ branch, status, behind, ahead }) {
  if (behind === 0) return { pull: false, reason: "up to date" };
  if (branch !== "main")
    return { pull: false, reason: `on ${branch}, not main` };
  if (status.trim() !== "") {
    return { pull: false, reason: "uncommitted or untracked files" };
  }
  if (ahead > 0) {
    return { pull: false, reason: "this PC has commits on main not on GitHub" };
  }
  return {
    pull: true,
    reason: `${behind} new commit${behind === 1 ? "" : "s"}`,
  };
}

// What to install for the files a pull changed: exact npm packages when the
// lock file moved, the browser when Playwright moved, and a Terraform folder's
// providers when its lock file moved.
function installsFor(changed, playwrightBefore, playwrightAfter) {
  const steps = [];
  if (changed.includes("package-lock.json")) {
    steps.push({ id: "npm", command: `${NPM} ci` });
  }
  if (playwrightBefore !== playwrightAfter) {
    steps.push({
      id: "playwright",
      command: `${NPX} playwright install chromium`,
    });
  }
  for (const folder of ["terraform", "terraform-github"]) {
    if (changed.includes(`${folder}/.terraform.lock.hcl`)) {
      steps.push({
        id: folder,
        command: `terraform -chdir=${folder} init -input=false`,
      });
    }
  }
  return steps;
}

// The major version of a version (26 for "v26.1.0").
const majorOf = (version) =>
  Number(String(version).replace(/^v/, "").split(".")[0]);

// The version each PC program is pinned to in the repo. Node is pinned by
// its major only (26), the rest exactly.
function pinnedPrograms(pins) {
  return {
    node: Math.max(...pins.node.map((copy) => copy.major)),
    terraform: pins.terraform.copies[0].version,
    kind: pins.kind.version,
    // k6, for the load tests (K6_VERSION in scripts/k6/run.js).
    k6: pins.k6?.version ?? null,
  };
}

// One program's line when this PC's version differs from its pin. `onWinget`
// is the newest version winget offers, or null when that is not known. A pin
// newer than winget's newest can't be installed yet: winget gets a release
// days after the tool's own site (Terraform 1.17.2, 2026-11-20), so the line
// says to wait, not to update.
function programLine(label, id, have, pin, onWinget) {
  const line = `${label} on this PC is ${have}; the repo pins ${pin}`;
  // Not known, or this PC is ahead of the pin: the plain line.
  if (!onWinget || compareVersions(have, pin) > 0) return line;
  // winget has the pin: the command that installs it.
  if (compareVersions(onWinget, pin) >= 0) {
    return `${line} (update: winget upgrade --id ${id} --exact)`;
  }
  // winget doesn't have it yet: wait, or move to what winget has meanwhile.
  const notYet = `${line}, which is not on winget yet (it has ${onWinget})`;
  return compareVersions(have, onWinget) < 0
    ? `${notYet}; winget upgrade --id ${id} --exact brings ${onWinget} meanwhile`
    : `${notYet}: nothing to do until it is`;
}

// The PC's own programs that differ from the repo's pins, as lines to show.
// `have` holds what is installed (null when a program is not); `onWinget`,
// winget's newest version of each program behind (see wingetVersions).
function pcProgramsBehind(pins, have, onWinget = {}) {
  const lines = [];
  const pinned = pinnedPrograms(pins);
  // Node, by its major: the same three answers as the others, read by major.
  if (have.node && majorOf(have.node) !== pinned.node) {
    const line = `Node on this PC is ${have.node}; the repo uses Node ${pinned.node}`;
    const wingetNode = onWinget.node ?? null;
    if (!wingetNode || majorOf(have.node) > pinned.node) lines.push(line);
    else if (majorOf(wingetNode) >= pinned.node) {
      lines.push(
        `${line} (update: winget upgrade --id ${WINGET_IDS.node} --exact)`,
      );
    } else {
      lines.push(
        `${line}, which is not on winget yet (it has ${wingetNode}): nothing to do until it is`,
      );
    }
  }
  for (const [program, label] of [
    ["terraform", "Terraform"],
    ["kind", "kind"],
    ["k6", "k6"],
  ]) {
    const pin = pinned[program];
    if (have[program] && pin && have[program] !== pin) {
      lines.push(
        programLine(
          label,
          WINGET_IDS[program],
          have[program],
          pin,
          onWinget[program] ?? null,
        ),
      );
    }
  }
  return lines;
}

// The newest version winget offers for one program, asked by its own id, or
// null off Windows or when winget can't say.
function wingetNewest(id) {
  if (process.platform !== "win32") return null;
  const out = trySh(
    `winget show --id ${id} --exact --accept-source-agreements --disable-interactivity`,
  );
  return out?.match(/^Version:\s*(\S+)/m)?.[1] ?? null;
}

// winget's newest version of each program this PC has behind its pin. Only
// those are asked about, so a sync with nothing behind never runs winget.
function wingetVersions(pins, have) {
  const pinned = pinnedPrograms(pins);
  const found = {};
  for (const [program, id] of Object.entries(WINGET_IDS)) {
    const pin = pinned[program];
    // Node is behind when its major differs; the rest when the version does.
    const behind =
      program === "node"
        ? have.node && majorOf(have.node) !== pin
        : have[program] && pin && have[program] !== pin;
    if (behind) found[program] = wingetNewest(id);
  }
  return found;
}

// The installed @playwright/test, from the lock file.
function playwrightVersion() {
  try {
    const lock = JSON.parse(
      fs.readFileSync(path.join(ROOT, "package-lock.json"), "utf8"),
    );
    return lock.packages?.["node_modules/@playwright/test"]?.version ?? null;
  } catch {
    return null;
  }
}

// What this PC has installed: Node, Terraform, kind and k6.
function installedPrograms() {
  const terraform = trySh("terraform version -json");
  const kind = trySh("kind version");
  const k6 = trySh("k6 version");
  return {
    node: process.versions.node,
    terraform: terraform ? JSON.parse(terraform).terraform_version : null,
    kind: kind?.match(/v\d+\.\d+\.\d+/)?.[0] ?? null,
    k6: k6?.match(/v(\d+\.\d+\.\d+)/)?.[1] ?? null,
  };
}

// The first of the repo's server ports something listens on, or null.
async function serverRunning() {
  for (const port of SERVER_PORTS) {
    const open = await new Promise((resolve) => {
      const socket = net.connect({ host: "127.0.0.1", port });
      socket.once("connect", () => {
        socket.destroy();
        resolve(true);
      });
      socket.once("error", () => resolve(false));
      socket.setTimeout(500, () => {
        socket.destroy();
        resolve(false);
      });
    });
    if (open) return port;
  }
  return null;
}

// The one line /recall shows.
function summaryLine(result) {
  const parts = [];
  if (result.result === "stopped") parts.push(`Not synced: ${result.reason}.`);
  else if (result.pulled) {
    parts.push(
      `Pulled ${result.pulled}${result.installed.length ? `; installed ${result.installed.join(", ")}` : ""}.`,
    );
  } else if (result.behind > 0) {
    parts.push(
      `GitHub is ${result.behind} commit${result.behind === 1 ? "" : "s"} ahead; not pulled: ${result.reason}.`,
    );
  } else parts.push("Up to date with GitHub.");
  for (const skipped of result.skipped) parts.push(`Skipped ${skipped}.`);
  for (const line of result.pcPrograms) parts.push(`${line}.`);
  return parts.join(" ");
}

// One sync.
async function main(args) {
  const check = args.includes("--check");
  const result = {
    at: new Date().toISOString(),
    result: "ok",
    reason: "",
    behind: 0,
    pulled: "",
    installed: [],
    skipped: [],
    pcPrograms: [],
  };

  // GitHub's main, fetched without changing any file here.
  if (trySh("git fetch -q origin main") === null) {
    result.result = "stopped";
    result.reason = "GitHub could not be reached";
  } else {
    const branch = sh("git branch --show-current");
    const status = sh("git status --porcelain");
    result.behind = Number(sh("git rev-list --count HEAD..origin/main"));
    const ahead =
      branch === "main"
        ? Number(sh("git rev-list --count origin/main..HEAD"))
        : 0;
    const decision = decidePull({
      branch,
      status,
      behind: result.behind,
      ahead,
    });
    result.reason = decision.reason;

    // Pull and install, unless only checking.
    if (decision.pull && !check) {
      const before = sh("git rev-parse HEAD");
      const playwrightBefore = playwrightVersion();
      if (trySh("git pull --ff-only -q origin main") === null) {
        result.result = "stopped";
        result.reason = "the pull could not fast-forward";
      } else {
        const after = sh("git rev-parse HEAD");
        const changed = sh(`git diff --name-only ${before} ${after}`)
          .split("\n")
          .filter(Boolean);
        result.pulled = `${result.behind} commit${result.behind === 1 ? "" : "s"} (${before.slice(0, 7)}..${after.slice(0, 7)})`;
        const steps = installsFor(
          changed,
          playwrightBefore,
          playwrightVersion(),
        );
        const busy = steps.some((step) => step.id === "npm")
          ? await serverRunning()
          : null;
        for (const step of steps) {
          // npm ci empties node_modules first, which fails on Windows while a
          // server runs from it.
          if (step.id === "npm" && busy) {
            result.skipped.push(
              `npm ci (a server is running on port ${busy}; stop it, then run npm ci)`,
            );
            continue;
          }
          try {
            execSync(step.command, { cwd: ROOT, stdio: "ignore" });
            result.installed.push(step.id);
          } catch {
            result.skipped.push(`${step.id} (${step.command} failed)`);
            result.result = "partial";
          }
        }
      }
    }
  }

  // The PC's own programs against the repo's pins, and what winget has of
  // the ones behind.
  const pins = readPins();
  const have = installedPrograms();
  result.pcPrograms = pcProgramsBehind(pins, have, wingetVersions(pins, have));

  // The log, and the one line.
  const line = summaryLine(result);
  if (!check) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const json = JSON.stringify({ ...result, line }, null, 2);
    fs.writeFileSync(path.join(OUT_DIR, "latest.json"), `${json}\n`);
    fs.writeFileSync(
      path.join(OUT_DIR, `${result.at.slice(0, 10)}.json`),
      `${json}\n`,
    );
  }
  console.log(line);
}

if (require.main === module) {
  main(process.argv.slice(2)).catch((error) => {
    // Never fail /recall: say what went wrong in one line.
    console.log(`Not synced: ${error.message.split("\n")[0]}.`);
  });
}

// What the guard spec uses.
module.exports = {
  decidePull,
  installsFor,
  pcProgramsBehind,
  summaryLine,
  wingetVersions,
};
