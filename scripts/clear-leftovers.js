#!/usr/bin/env node
// Stops the processes this Claude session started, and nothing else (Asaf,
// 2026-11-17: "every docs skill activate you clear all process u created this
// session before u even write anything", "make sure u only touch what u made
// and not something that not related to u"). A `tail -f | grep` watcher left
// from the day before had made the Git installer refuse to update.
//
// Run by /docs as its first step (.claude/skills/docs/SKILL.md, step 0), from
// inside the session: `node scripts/clear-leftovers.js`, or `--dry-run` to
// only list.
//
// What counts as this session's, and is stopped:
//   1. every process below this session's claude.exe (found by walking up from
//      this script): the shells, servers, watchers and background tasks its
//      commands started;
//   2. an orphan (its parent is gone) whose command line holds Claude's own
//      temp folder (scratchpads, task logs): what an ended watcher left.
// What is never touched:
//   - Claude Code itself and its helpers (the MCP servers it starts, their
//     console host), and the chain running this script;
//   - every other process: VS Code and its terminals, Codex, your own servers,
//     anything without one of the two marks above.

// Running a command, reading files and folders, and a path's last part.
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

// Claude's own temp folder: scratchpads, task output, watcher logs.
const CLAUDE_TEMP = /[\\/]temp[\\/]claude[\\/]/i;

// Claude Code's own program.
const CLAUDE_PROGRAM = /^claude(\.exe)?$/i;

// Claude Code's helpers, started with the session: the MCP servers (Docker's
// gateway, Playwright's, Chrome DevTools') and the console host.
const HELPER = /\bmcp\b|mcp-server|-mcp@|mcp gateway/i;
const CONSOLE_HOST = /^conhost(\.exe)?$/i;

// --- Listing the processes ------------------------------------------------------

// Every process as { pid, ppid, name, cmd }.
function listProcesses() {
  if (process.platform === "win32") return windowsProcesses();
  if (process.platform === "linux") return linuxProcesses();
  return psProcesses();
}

// Windows: one CIM query through PowerShell, as JSON.
function windowsProcesses() {
  const text = execFileSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,CommandLine | ConvertTo-Json -Compress",
    ],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, windowsHide: true },
  );
  const rows = JSON.parse(text || "[]");
  return (Array.isArray(rows) ? rows : [rows]).map((row) => ({
    pid: row.ProcessId,
    ppid: row.ParentProcessId,
    name: String(row.Name || ""),
    cmd: String(row.CommandLine || ""),
  }));
}

// Linux: the kernel's own tables, no tool needed (a container may have no ps).
function linuxProcesses() {
  const list = [];
  for (const entry of fs.readdirSync("/proc")) {
    if (!/^\d+$/.test(entry)) continue;
    try {
      const stat = fs.readFileSync(`/proc/${entry}/stat`, "utf8");
      // "pid (comm) state ppid ...": comm may hold spaces, so cut at the last ")".
      const close = stat.lastIndexOf(")");
      list.push({
        pid: Number(entry),
        ppid: Number(stat.slice(close + 2).split(" ")[1]),
        name: stat.slice(stat.indexOf("(") + 1, close),
        cmd: fs
          .readFileSync(`/proc/${entry}/cmdline`, "utf8")
          .split("\0")
          .join(" ")
          .trim(),
      });
    } catch {
      // gone while reading
    }
  }
  return list;
}

// macOS and the rest: ps.
function psProcesses() {
  const text = execFileSync("ps", ["-axo", "pid=,ppid=,comm=,args="], {
    encoding: "utf8",
  });
  return text
    .split("\n")
    .map((line) => line.trim().match(/^(\d+)\s+(\d+)\s+(\S+)\s*(.*)$/))
    .filter(Boolean)
    .map(([, pid, ppid, comm, args]) => ({
      pid: Number(pid),
      ppid: Number(ppid),
      name: path.basename(comm),
      cmd: args,
    }));
}

// --- Deciding ---------------------------------------------------------------------

// The chain from a process up to the top: [self, parent, grandparent, ...].
function ancestors(byPid, pid) {
  const chain = [];
  for (let at = pid; byPid.has(at) && !chain.includes(at);) {
    chain.push(at);
    at = byPid.get(at).ppid;
  }
  return chain;
}

// This session's leftovers in a process list, as { session, leftovers, tree }.
// `tree` is every process below the session with its decision and why, for
// --dry-run to show. `self` is this script's own pid. Exported so a test can
// check the rules on a made-up list without touching any real process.
function pickLeftovers(processes, { self }) {
  const byPid = new Map(processes.map((proc) => [proc.pid, proc]));
  const children = new Map();
  for (const proc of processes) {
    if (!children.has(proc.ppid)) children.set(proc.ppid, []);
    children.get(proc.ppid).push(proc);
  }
  // This script, every process above it, and the ones it started itself (its
  // own process query): never stopped.
  const chain = ancestors(byPid, self);
  const keep = new Set(chain);
  const own = [...(children.get(self) || [])];
  while (own.length) {
    const proc = own.shift();
    keep.add(proc.pid);
    own.push(...(children.get(proc.pid) || []));
  }
  // The session: the nearest claude.exe above this script (none when the
  // script is run by hand from a terminal).
  const session =
    chain
      .map((pid) => byPid.get(pid))
      .find((p) => CLAUDE_PROGRAM.test(p.name)) || null;

  const picked = new Map();
  const tree = [];
  // 1. Everything below the session, each with its decision. A helper's or a
  //    kept process's own children are kept with it.
  if (session) {
    tree.push({
      proc: session,
      depth: 0,
      stop: false,
      why: "Claude Code itself",
    });
    const walk = (parent, depth, keptAbove) => {
      for (const proc of children.get(parent.pid) || []) {
        let why = null;
        if (keptAbove) why = `belongs to ${keptAbove}`;
        else if (keep.has(proc.pid)) why = "this check itself";
        else if (CONSOLE_HOST.test(proc.name)) why = "Windows console host";
        else if (depth === 1 && HELPER.test(proc.cmd))
          why = "Claude Code's helper (MCP server)";
        const stop = why === null;
        tree.push({
          proc,
          depth,
          stop,
          why: stop ? "started by a command of this session" : why,
        });
        if (stop) picked.set(proc.pid, proc);
        // Below a kept helper everything stays; below a stopped one, it goes
        // with its parent's tree.
        walk(proc, depth + 1, stop ? null : keptAbove || why);
      }
    };
    walk(session, 1, null);
  }
  // 2. Orphans carrying Claude's temp folder.
  for (const proc of processes) {
    const orphan = !byPid.has(proc.ppid) || proc.ppid === 1;
    if (orphan && !keep.has(proc.pid) && CLAUDE_TEMP.test(proc.cmd)) {
      picked.set(proc.pid, proc);
    }
  }
  // A process whose parent is also picked is stopped with it (the parent's
  // tree), so list only the top of each tree.
  const leftovers = [...picked.values()].filter(
    (proc) => !picked.has(proc.ppid),
  );
  return { session, leftovers, tree };
}

// --- Stopping ---------------------------------------------------------------------

// Stops one process and the ones it started.
function stopTree(pid) {
  try {
    if (process.platform === "win32") {
      execFileSync("taskkill", ["/PID", String(pid), "/T", "/F"], {
        stdio: "ignore",
        windowsHide: true,
      });
    } else {
      process.kill(pid, "SIGKILL");
    }
    return true;
  } catch {
    return false; // already gone
  }
}

// Lists, decides, stops, and says what it did in one line or a short list.
// Never fails: a problem is one line and exit 0.
function main() {
  const dryRun = process.argv.includes("--dry-run");
  try {
    const { session, leftovers, tree } = pickLeftovers(listProcesses(), {
      self: process.pid,
    });
    const where = session
      ? `this session (claude ${session.pid})`
      : "no Claude session above this script, so only marked orphans";
    const describe = (proc) =>
      `${proc.name} ${proc.pid}: ${proc.cmd.replace(/\s+/g, " ").slice(0, 90)}`;
    // A dry run shows every process below the session, kept or stopped, and
    // why; nothing outside that tree is ever looked at except marked orphans.
    if (dryRun) {
      console.log(`[leftovers] dry run, nothing is stopped. ${where}:`);
      for (const { proc, depth, stop, why } of tree) {
        console.log(
          `${"  ".repeat(depth)}${stop ? "STOP" : "keep"} ${describe(proc)}  <- ${why}`,
        );
      }
      const orphans = leftovers.filter(
        (proc) => !tree.some((row) => row.proc.pid === proc.pid),
      );
      orphans.forEach((proc) =>
        console.log(
          `STOP ${describe(proc)}  <- orphan with Claude's temp folder`,
        ),
      );
      console.log(
        leftovers.length
          ? `[leftovers] would stop ${leftovers.length} (and what each started)`
          : "[leftovers] nothing left running: would stop nothing",
      );
      return;
    }
    if (leftovers.length === 0) {
      console.log(`[leftovers] nothing left running from ${where}`);
      return;
    }
    const stopped = leftovers.filter((proc) => stopTree(proc.pid));
    console.log(`[leftovers] stopped ${stopped.length}, from ${where}:`);
    stopped.forEach((proc) => console.log(`  ${describe(proc)}`));
  } catch (error) {
    console.log(`[leftovers] could not check: ${error.message}`);
  }
}

if (require.main === module) main();

module.exports = { pickLeftovers };
