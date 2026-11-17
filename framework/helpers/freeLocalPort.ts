// Running a command and waiting for it, reading files, links and folders, and
// a path's last part.
import { execSync } from "node:child_process";
import { readFileSync, readdirSync, readlinkSync } from "node:fs";
import { basename } from "node:path";

// Linux, with no tool at all (a slim container has no lsof or ss, checked
// 2026-11-17): /proc/net/tcp and tcp6 list every socket with its port, state
// and inode; a pid owns the socket whose inode one of its /proc/<pid>/fd
// links names.
function linuxListeners(port: number): number[] {
  // The inodes of the sockets listening on the port (state 0A is LISTEN).
  const inodes = new Set<string>();
  for (const table of ["/proc/net/tcp", "/proc/net/tcp6"]) {
    let text = "";
    try {
      text = readFileSync(table, "utf8");
    } catch {
      continue;
    }
    for (const line of text.split("\n").slice(1)) {
      const cols = line.trim().split(/\s+/);
      if (cols.length < 10 || cols[3] !== "0A") continue;
      const localPort = Number.parseInt(cols[1].split(":")[1] || "", 16);
      if (localPort === port && cols[9] !== "0") inodes.add(cols[9]);
    }
  }
  if (inodes.size === 0) return [];
  // The processes holding one of those sockets.
  const pids = new Set<number>();
  for (const entry of readdirSync("/proc")) {
    if (!/^\d+$/.test(entry)) continue;
    let fds: string[];
    try {
      fds = readdirSync(`/proc/${entry}/fd`);
    } catch {
      continue; // another user's process, or gone
    }
    for (const fd of fds) {
      try {
        const link = readlinkSync(`/proc/${entry}/fd/${fd}`);
        const socket = /^socket:\[(\d+)\]$/.exec(link);
        if (socket && inodes.has(socket[1])) pids.add(Number(entry));
      } catch {
        // closed while reading
      }
    }
  }
  return [...pids];
}

// Frees the test site's port before a local run (Asaf, 2026-11-17: "we need
// to do something to clear this port ... it happened a few times"). A server
// left running on 4173 serves old code, or other settings, and Playwright
// reuses it instead of starting a fresh one: on 2026-11-17 a demo server with
// Render's sign-up limit made 277 tests fail. So before a local test run
// starts its server, any node process still listening there is stopped.
//
// It only acts when tests really run on this PC: not on CI (a fresh runner),
// not for --list (VS Code and flows:discover list tests often), not inside a
// test worker (they load the config too, and would stop the run's own
// server), and not when the caller says the target is elsewhere. It never
// stops a program that isn't node; it names it instead.

// The pids listening on a TCP port: netstat on Windows, the kernel's own
// tables on Linux, lsof on macOS.
export function listenersOn(port: number): number[] {
  try {
    if (process.platform === "win32") {
      // Every protocol, so a server on IPv6 ([::1]) is seen too; UDP lines
      // are dropped by parseNetstat.
      const text = execSync("netstat -ano", {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      });
      return parseNetstat(text, port);
    }
    if (process.platform === "linux") {
      return linuxListeners(port);
    }
    const text = execSync(`lsof -nP -iTCP:${port} -sTCP:LISTEN -t`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return [
      ...new Set(
        text
          .split(/\s+/)
          .map(Number)
          .filter((n) => n > 0),
      ),
    ];
  } catch {
    // lsof exits 1 when nothing listens; either way, nothing to stop.
    return [];
  }
}

// The listening pids in netstat -ano text: "TCP 127.0.0.1:4173 0.0.0.0:0
// LISTENING 77016". Exported so a test can check the reading.
export function parseNetstat(text: string, port: number): number[] {
  const pids = text
    .split(/\r?\n/)
    .map((line) => line.trim().split(/\s+/))
    .filter(
      (cols) =>
        cols[0] === "TCP" &&
        cols[3] === "LISTENING" &&
        cols[1]?.endsWith(`:${port}`),
    )
    .map((cols) => Number(cols[4]))
    .filter((pid) => pid > 0);
  return [...new Set(pids)];
}

// The program a pid runs ("node.exe", "node"), or "" if it is gone. Taken from
// the program's file, never the process's name: on Linux, Node 26 names its
// main thread "node-MainThread", which is what `ps -o comm=` prints, so a
// node server was taken for another program and left running (found on the
// GitHub runner, PR #105, 2026-11-17).
export function programOf(pid: number): string {
  try {
    if (process.platform === "win32") {
      const row = execSync(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`, {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      });
      return (row.split(",")[0] || "").replace(/"/g, "").trim();
    }
    if (process.platform === "linux") {
      // The file the process was started from, e.g. /usr/bin/node.
      return basename(readlinkSync(`/proc/${pid}/exe`));
    }
    // macOS: `ps -o comm=` prints the program's full path there.
    return basename(
      execSync(`ps -p ${pid} -o comm=`, {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim(),
    );
  } catch {
    return "";
  }
}

// Stops one pid and the processes it started.
function stop(pid: number): void {
  try {
    if (process.platform === "win32") {
      execSync(`taskkill /PID ${pid} /T /F`, { stdio: "ignore" });
    } else {
      process.kill(pid, "SIGKILL");
    }
  } catch {
    // Already gone.
  }
}

// Waits without an event loop (the config is read synchronously).
function pause(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

// Stops every node process listening on the port, then waits up to 5 s for it
// to be free. Returns what was stopped, for the line it prints.
export function freePort(port: number): number[] {
  const stopped: number[] = [];
  for (const pid of listenersOn(port)) {
    const program = programOf(pid);
    if (!/^node(\.exe)?$/i.test(program)) {
      console.warn(
        `[port ${port}] ${program || "a program"} (pid ${pid}) is listening there and is not node, so it was left running. Stop it, or the tests may reach it.`,
      );
      continue;
    }
    stop(pid);
    stopped.push(pid);
  }
  for (let waited = 0; stopped.length && waited < 5_000; waited += 100) {
    if (listenersOn(port).length === 0) break;
    pause(100);
  }
  if (stopped.length) {
    console.log(
      `[port ${port}] stopped a server left running (pid ${stopped.join(", ")}), so this run starts a fresh one with the current code.`,
    );
  }
  return stopped;
}

// Whether this process is a local test run that is about to start the site:
// the playwright CLI's "test" command, not --list, not a worker, not CI. The
// arguments and settings default to this process's own; a test passes others.
export function isLocalTestRun(
  args: string[] = process.argv.slice(2),
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return (
    !env.CI &&
    !env.TEST_WORKER_INDEX &&
    args.includes("test") &&
    !args.includes("--list")
  );
}
