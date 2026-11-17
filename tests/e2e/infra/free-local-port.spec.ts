// Playwright's test tools, with the [RESULT] block printed after every test.
import {
  expect,
  expected,
  fact,
  test,
} from "../../../framework/fixtures/resultBlock";
// Starting a process, a socket (for a free port), and waiting for an event.
import { spawn } from "node:child_process";
import { createServer, type AddressInfo } from "node:net";
import { once } from "node:events";
// The port freeing every local run does first.
import {
  freePort,
  isLocalTestRun,
  listenersOn,
  parseNetstat,
} from "../../../framework/helpers/freeLocalPort";

// Guards framework/helpers/freeLocalPort.ts (Asaf, 2026-11-17): a server left
// on 4173 was reused by test runs several times, serving old code or other
// settings (277 failures once). Now a local run stops it first. These tests use
// a random free port, never 4173, so they never touch the suite's own server.

// A port the system says is free.
async function aFreePort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const { port } = probe.address() as AddressInfo;
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

test("a node server left on a port is stopped, and the port is free afterwards", async () => {
  expected("a node server listens; freePort stops it; nothing listens after");
  const port = await aFreePort();
  fact("port", port);

  // A stand-in for a server left running: plain node, listening on the port.
  const server =
    await test.step("start a node server on a free port", async () => {
      const child = spawn(
        process.execPath,
        [
          "-e",
          `require("http").createServer(() => {}).listen(${port}, "127.0.0.1")`,
        ],
        { stdio: "ignore" },
      );
      await expect
        .poll(() => listenersOn(port).length, {
          message: "the server is listening",
          timeout: 10_000,
        })
        .toBeGreaterThan(0);
      return child;
    });

  await test.step("free the port", async () => {
    const exited = once(server, "exit");
    const stopped = freePort(port);
    fact("stopped", stopped.join(", "));
    expect(stopped, "the server's process is the one stopped").toContain(
      server.pid,
    );
    await exited;
  });

  await test.step("check nothing listens there now", async () => {
    expect(listenersOn(port), "the port is free").toEqual([]);
  });
});

test("the netstat reading finds only what listens on that exact port", async () => {
  expected("4173 LISTENING found; 41730, an ESTABLISHED line and UDP are not");
  // Lines as Windows' netstat -ano prints them.
  const text = [
    "  Proto  Local Address          Foreign Address        State           PID",
    "  TCP    127.0.0.1:4173         0.0.0.0:0              LISTENING       77016",
    "  TCP    127.0.0.1:41730        0.0.0.0:0              LISTENING       555",
    "  TCP    127.0.0.1:52000        127.0.0.1:4173         ESTABLISHED     666",
    "  TCP    [::1]:4173             [::]:0                 LISTENING       77016",
    "  UDP    0.0.0.0:4173           *:*                                    777",
  ].join("\r\n");

  await test.step("read the listening pids for 4173", async () => {
    expect(
      parseNetstat(text, 4173),
      "only the process listening on 4173 itself, once",
    ).toEqual([77016]);
  });
});

test("only a real local test run frees the port: not a listing, a worker or CI", async () => {
  expected(
    "test: yes; test --list: no; in a worker: no; on CI: no; show-report: no",
  );

  await test.step("ask the rule for each kind of run", async () => {
    expect(isLocalTestRun(["test"], {}), "a local test run frees it").toBe(
      true,
    );
    expect(
      isLocalTestRun(["test", "--list"], {}),
      "listing tests (VS Code, flows:discover) leaves it alone",
    ).toBe(false);
    expect(
      isLocalTestRun(["test"], { TEST_WORKER_INDEX: "0" }),
      "a test worker leaves it alone (it would stop its own run's server)",
    ).toBe(false);
    expect(
      isLocalTestRun(["test"], { CI: "true" }),
      "CI leaves it alone (a fresh runner)",
    ).toBe(false);
    expect(
      isLocalTestRun(["show-report"], {}),
      "opening the report leaves it alone",
    ).toBe(false);
  });
});
