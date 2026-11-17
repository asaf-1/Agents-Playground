// Playwright's test tools, with the [RESULT] block printed after every test.
import {
  expect,
  expected,
  fact,
  test,
} from "../../../framework/fixtures/resultBlock";
// Running the script once, the way /docs does, but only listing.
import { execFileSync } from "node:child_process";
// The rules that decide what the cleanup stops.
import { pickLeftovers } from "../../../scripts/clear-leftovers.js";

// Guards scripts/clear-leftovers.js, which /docs runs first (Asaf,
// 2026-11-17: "make sure u only touch what u made and not something that not
// related to u"). The rules are checked on a MADE-UP list of processes: no
// real process is ever stopped by these tests. If a later change made the
// script pick something that isn't this session's, a test here fails first.

// A made-up PC: VS Code with a terminal of yours and your own server in it,
// this Claude session with its helpers, a background task of mine still
// running, and leftovers from an older session (one carrying Claude's temp
// folder, two that carry nothing).
const PC = [
  { pid: 10, ppid: 1, name: "explorer.exe", cmd: "explorer.exe" },
  { pid: 100, ppid: 10, name: "Code.exe", cmd: "Code.exe" },
  // Your VS Code terminal, and a server you started in it.
  {
    pid: 300,
    ppid: 100,
    name: "bash.exe",
    cmd: 'bash.exe --init-file "vs/workbench/contrib/terminal/common/scripts/shellIntegration-bash.sh"',
  },
  { pid: 301, ppid: 300, name: "node.exe", cmd: "node server.js 4173" },
  // This Claude session and Windows' console host for it.
  { pid: 200, ppid: 100, name: "claude.exe", cmd: "claude.exe -" },
  { pid: 201, ppid: 200, name: "conhost.exe", cmd: "conhost.exe 0x4" },
  // Claude Code's helpers (MCP servers) and what they started.
  { pid: 202, ppid: 200, name: "docker.exe", cmd: "docker mcp gateway run" },
  {
    pid: 203,
    ppid: 202,
    name: "docker-mcp.exe",
    cmd: "docker-mcp.exe mcp gateway run",
  },
  {
    pid: 204,
    ppid: 200,
    name: "cmd.exe",
    cmd: "cmd /c npx playwright run-test-mcp-server",
  },
  {
    pid: 205,
    ppid: 204,
    name: "node.exe",
    cmd: "node npx-cli.js playwright run-test-mcp-server",
  },
  // A background task of mine, still running: a shell with a sleep inside.
  {
    pid: 210,
    ppid: 200,
    name: "bash.exe",
    cmd: 'bash.exe -c "source snapshot.sh && sleep 600"',
  },
  { pid: 211, ppid: 210, name: "sleep.exe", cmd: "sleep 600" },
  { pid: 212, ppid: 210, name: "conhost.exe", cmd: "conhost.exe 0x4" },
  // The command running the cleanup: its shell, the script, its own query.
  {
    pid: 220,
    ppid: 200,
    name: "bash.exe",
    cmd: 'bash.exe -c "node scripts/clear-leftovers.js"',
  },
  {
    pid: 221,
    ppid: 220,
    name: "node.exe",
    cmd: "node scripts/clear-leftovers.js",
  },
  {
    pid: 222,
    ppid: 221,
    name: "powershell.exe",
    cmd: "powershell.exe -Command Get-CimInstance Win32_Process",
  },
  // Leftovers of an older session: their parents are gone.
  {
    pid: 500,
    ppid: 9999,
    name: "tail.exe",
    cmd: "tail -n +1 -f C:/Users/x/AppData/Local/Temp/claude/abc/scratchpad/k8s.log",
  },
  {
    pid: 501,
    ppid: 9998,
    name: "grep.exe",
    cmd: "grep --line-buffered Apply complete",
  },
  { pid: 502, ppid: 9997, name: "node.exe", cmd: "node server.js 4191" },
];

// The pids a decision picked, sorted, for a stable comparison.
const pids = (list: { pid: number }[]) =>
  list.map((proc) => proc.pid).sort((a, b) => a - b);

test("the cleanup picks only what this session started, never your terminals, Windows' console hosts or Claude Code's helpers", async () => {
  expected(
    "from inside the session (script pid 221): stops my background task (210) and the marked orphan (500); nothing of yours, no conhost, no helper, not itself",
  );

  const { session, leftovers } =
    await test.step("ask the rules about the made-up PC, from inside the session", async () =>
      pickLeftovers(PC, { self: 221 }));
  fact("picked", pids(leftovers).join(", "));

  await test.step("check what it would stop", async () => {
    expect(session?.pid, "it finds this session's claude.exe").toBe(200);
    expect(
      pids(leftovers),
      "only my background task (and the sleep in it) and the orphan with Claude's temp folder",
    ).toEqual([210, 500]);
  });

  await test.step("check what it never picks", async () => {
    const picked = new Set(pids(leftovers));
    expect(picked.has(300), "your VS Code terminal is never picked").toBe(
      false,
    );
    expect(picked.has(301), "your own server in it is never picked").toBe(
      false,
    );
    expect(picked.has(201), "Windows' console host is never picked").toBe(
      false,
    );
    expect(
      picked.has(212),
      "a console host under my task is never picked on its own",
    ).toBe(false);
    expect(
      picked.has(202) || picked.has(204),
      "Claude Code's helpers are never picked",
    ).toBe(false);
    expect(picked.has(200), "Claude Code itself is never picked").toBe(false);
    expect(
      picked.has(220) || picked.has(221) || picked.has(222),
      "the cleanup never picks itself or the command running it",
    ).toBe(false);
  });

  await test.step("check unmarked orphans are left alone", async () => {
    const picked = new Set(pids(leftovers));
    expect(
      picked.has(501),
      "an orphan without my mark (a grep) is left alone: it may not be mine",
    ).toBe(false);
    expect(
      picked.has(502),
      "an orphaned server without my mark is left alone: it may be yours",
    ).toBe(false);
  });
});

test("run by hand outside a Claude session, the cleanup stops only orphans that carry Claude's temp folder", async () => {
  expected(
    "script run from your terminal (pid 302 under your bash 300): no session; only the marked orphan 500",
  );
  // The script started from your own terminal, not from Claude.
  const fromYourTerminal = [
    ...PC,
    {
      pid: 302,
      ppid: 300,
      name: "node.exe",
      cmd: "node scripts/clear-leftovers.js",
    },
  ];

  const { session, leftovers } =
    await test.step("ask the rules from your terminal", async () =>
      pickLeftovers(fromYourTerminal, { self: 302 }));
  fact("picked", pids(leftovers).join(", "));

  await test.step("check only the marked orphan is picked", async () => {
    expect(session, "there is no Claude session above it").toBeNull();
    expect(
      pids(leftovers),
      "only the orphan with Claude's temp folder; nothing of a session it is not in",
    ).toEqual([500]);
  });
});

test("the cleanup's dry run lists and stops nothing on this machine", async () => {
  expected(
    "--dry-run exits 0 and prints a [leftovers] report; nothing is stopped",
  );

  // A dry run only reads the process list: safe to run anywhere, CI included.
  const output = await test.step("run the cleanup with --dry-run", async () =>
    execFileSync(
      process.execPath,
      ["scripts/clear-leftovers.js", "--dry-run"],
      {
        encoding: "utf8",
        timeout: 60_000,
      },
    ));
  fact("first line", output.split("\n")[0]);

  await test.step("check it reported without stopping", async () => {
    expect(output, "it prints its report").toContain("[leftovers]");
    expect(output, "a dry run never says it stopped anything").not.toContain(
      "] stopped",
    );
  });
});
