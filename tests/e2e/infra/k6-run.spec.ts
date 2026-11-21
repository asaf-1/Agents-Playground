// Runs the k6 run script as a separate process, and reads files.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
// Playwright's test tools, with the [RESULT] block printed after every test.
import {
  expect,
  expected,
  fact,
  test,
} from "../../../framework/fixtures/resultBlock";
// The run script's pure parts: its stages, its default address, the
// refusals, and how a run's numbers become its verdict.
import {
  DEFAULT_ADDRESS,
  GITHUB_LIMITS,
  K6_VERSION,
  LIMITS,
  STAGES,
  judgeRun,
  moneyLine,
  parseArgs,
  refuseAddress,
} from "../../../scripts/k6/run.js";
// The test runner's catalog: how a flow becomes a command.
import {
  buildArgv,
  buildEnv,
  describeCommand,
  findFlow,
  readCatalog,
  toSpawn,
} from "../../../scripts/test-runner/catalog.js";

// The guard on the k6 load tests (Part 7 of the Codex review plan): they run
// only against this PC, never Render or any other site. scripts/k6/run.js
// refuses any other address, an unknown stage or an unknown option before it
// starts k6 or a server, so all of it is checked here without k6: GitHub's
// runners have none, and the load tests themselves run by hand on the PC.

test.describe("k6 load tests (guard)", () => {
  // Only http://127.0.0.1:<port>; every other spelling is refused.
  test("any address but http://127.0.0.1:<port> is refused", async () => {
    expected(
      "Render, https, localhost, another IP, no port and port 80 refused; the default and another 127.0.0.1 port allowed",
    );
    const refused = [
      "https://agents-playground-app.onrender.com",
      "https://127.0.0.1:4174",
      "http://localhost:4174",
      "http://10.0.0.5:4174",
      "http://127.0.0.1",
      "http://127.0.0.1:80",
    ];
    await test.step("other addresses are refused", () => {
      for (const address of refused) {
        expect(refuseAddress(address), `${address} is refused`).toContain(
          "Refused",
        );
      }
    });
    await test.step("this PC is allowed", () => {
      fact("default", DEFAULT_ADDRESS);
      expect(
        refuseAddress(DEFAULT_ADDRESS),
        "the default address is this PC",
      ).toBeNull();
      expect(
        refuseAddress("http://127.0.0.1:4500"),
        "another port on this PC is allowed",
      ).toBeNull();
    });
  });

  // A customer at the bank's 100-order list limit means the money check could
  // not see every order. The verdict says that, never that money was lost
  // (stress on GitHub, 2026-11-21, read "DOES NOT add up" for exactly this).
  test("a full order list fails as 'could not count every order', not as lost money", async () => {
    expected(
      "full_order_lists=1: the run fails with 'could not count every order', and no 'does not add up'; full_order_lists=0 with a gap: 'does not add up'; adding up: passes",
    );
    // One stress run's inputs with nothing wrong but the money line: no k6
    // error, an empty k6 summary, balanced books, stock and ready fine.
    const run = (line: string) =>
      judgeRun({
        stage: "stress",
        address: DEFAULT_ADDRESS,
        k6Version: K6_VERSION,
        k6Run: { code: 0, samples: [] },
        summary: { metrics: {} },
        money: moneyLine(line),
        after: {
          books: { balanced: true, differenceCents: 0, checkedAccounts: 2 },
          belowZero: 0,
          ready: 200,
        },
      });

    await test.step("a full order list: could not count every order", () => {
      const result = run(
        "MONEY before=1000 after=900 spent=50 full_order_lists=1 adds_up=false",
      );
      fact("failures", result.failures);
      expect(result.passed, "the run does not pass").toBe(false);
      expect(
        result.failures.join("; "),
        "it says the orders could not all be counted",
      ).toContain("could not count every order: 1 customer has 100 or more");
      expect(
        result.failures.join("; "),
        "it never says the money does not add up",
      ).not.toContain("does not add up");
    });

    await test.step("every order counted, money missing: does not add up", () => {
      const result = run(
        "MONEY before=1000 after=900 spent=50 full_order_lists=0 adds_up=false",
      );
      expect(
        result.failures,
        "a real gap still fails as money that does not add up",
      ).toEqual(["the customers' money does not add up"]);
    });

    await test.step("every order counted, money adds up: passes", () => {
      const result = run(
        "MONEY before=1000 after=950 spent=50 full_order_lists=0 adds_up=true",
      );
      expect(result.passed, "nothing wrong, so the run passes").toBe(true);
    });
  });

  // The stage must be one of the six, and options only --base-url.
  test("an unknown stage or option is refused", async () => {
    expected(
      "no stage, 'endurance' and '--vus 50' refused; 'stress' alone runs against the default address",
    );
    await test.step("the refusals", () => {
      expect(parseArgs([]).error, "no stage is refused").toContain("Refused");
      expect(
        parseArgs(["endurance"]).error,
        "an unknown stage is refused",
      ).toContain("Refused");
      expect(
        parseArgs(["stress", "--vus", "50"]).error,
        "an unknown option is refused",
      ).toContain("Refused");
    });
    await test.step("a known stage", () => {
      expect(parseArgs(["stress"]), "stress runs against this PC").toEqual({
        stage: "stress",
        address: DEFAULT_ADDRESS,
      });
    });
  });

  // The real script, started like npm run k6:baseline but aimed at Render:
  // it stops at once, before a server or k6.
  test("the run script refuses Render before it starts a bank or k6", async () => {
    expected(
      "node scripts/k6/run.js baseline --base-url https://agents-playground-app.onrender.com: exit 2, 'Refused', no bank started",
    );
    const run = await test.step("start it aimed at Render", () =>
      spawnSync(
        process.execPath,
        [
          "scripts/k6/run.js",
          "baseline",
          "--base-url",
          "https://agents-playground-app.onrender.com",
        ],
        { encoding: "utf8", timeout: 20_000 },
      ));
    fact("exit", run.status);
    fact("said", run.stderr.trim());
    expect(run.status, "it refuses with exit code 2").toBe(2);
    expect(run.stderr, "it says why").toContain("Refused");
    expect(run.stdout, "it never starts a bank").not.toContain(
      "Starting a fresh bank",
    );
  });

  // Each stage has its script, every script goes through the shared helpers
  // (whose first lines refuse any address but this PC), and no script names
  // an address of its own.
  test("every stage has a script, and every script uses the shared address guard", async () => {
    expected(
      "tests/k6/<stage>.js for each of the 5 stages, each importing framework/k6/bank.js, none with an http address; the helpers refuse anything but 127.0.0.1",
    );
    const files = readdirSync("tests/k6").filter((file) =>
      file.endsWith(".js"),
    );
    fact("scripts", files.join(", "));
    await test.step("one script per stage, no more", () => {
      expect(files.sort(), "the scripts match the run script's stages").toEqual(
        STAGES.map((stage) => `${stage}.js`).sort(),
      );
    });
    await test.step("each goes through the shared helpers", () => {
      for (const file of files) {
        const text = readFileSync(`tests/k6/${file}`, "utf8");
        expect(text, `${file} imports the shared helpers`).toContain(
          'from "../../framework/k6/bank.js"',
        );
        expect(text, `${file} names no address of its own`).not.toMatch(
          /https?:\/\//,
        );
      }
    });
    await test.step("the helpers refuse anything but this PC", () => {
      expect(
        existsSync("framework/k6/bank.js"),
        "the shared helpers exist",
      ).toBe(true);
      const helpers = readFileSync("framework/k6/bank.js", "utf8");
      expect(helpers, "the helpers check the address").toContain(
        "/^http:\\/\\/127\\.0\\.0\\.1:\\d{2,5}$/",
      );
      expect(helpers, "the helpers throw before any request").toContain(
        "const BASE = bankAddress();",
      );
    });
  });

  // Each npm script runs its stage through the run script, so the refusals
  // always come first.
  test("each npm run k6:<stage> goes through the run script", () => {
    expected(
      "k6:baseline ... k6:breakpoint each run node scripts/k6/run.js <stage>",
    );
    const scripts = JSON.parse(readFileSync("package.json", "utf8")).scripts;
    for (const stage of STAGES) {
      expect(
        scripts[`k6:${stage}`],
        `k6:${stage} goes through the run script`,
      ).toBe(`node scripts/k6/run.js ${stage}`);
    }
  });

  // The breakpoint stage pushes until the bank breaks, so it must stop
  // itself the moment it does, and have no response-time limit of its own.
  test("the breakpoint stage stops itself at the break, and has no limit", async () => {
    expected(
      "tests/k6/breakpoint.js: abortOnFail on unexpected errors, slow answers and p95; LIMITS.breakpoint null",
    );
    const text = readFileSync("tests/k6/breakpoint.js", "utf8");
    await test.step("each 'broken' line stops the test", () => {
      for (const line of [
        'unexpected_errors: [{ threshold: "count<1", abortOnFail: true }]',
        'slow_answers: [{ threshold: "count<50", abortOnFail: true }]',
        'threshold: "p(95)<500", abortOnFail: true',
      ]) {
        expect(text, `breakpoint.js stops on ${line}`).toContain(line);
      }
    });
    await test.step("no response-time limit", () => {
      expect(LIMITS.breakpoint, "the breakpoint stage has no limit").toBeNull();
    });
  });

  // GitHub's limits were set from three GitHub runs per stage (2026-11-21):
  // every stage with a PC limit has one on GitHub too, and the two stages
  // without (soak, breakpoint) stay without on both.
  test("every stage with a PC limit has a GitHub limit too, set from GitHub runs", async () => {
    expected(
      "baseline, load, stress and spike: a GitHub p95 and p99, p99 above p95; soak and breakpoint: none on the PC or GitHub",
    );
    for (const stage of STAGES) {
      await test.step(`the ${stage} stage`, () => {
        const pc = LIMITS[stage as keyof typeof LIMITS];
        const github = GITHUB_LIMITS[stage as keyof typeof GITHUB_LIMITS];
        fact(stage, github ? `p95 ${github.p95}, p99 ${github.p99}` : "none");
        if (pc === null) {
          expect(github, `${stage} has no limit on GitHub either`).toBeNull();
          return;
        }
        expect(github, `${stage} has a GitHub limit`).not.toBeNull();
        expect(github!.p95, `${stage}'s GitHub p95 is set`).toBeGreaterThan(0);
        expect(
          github!.p99,
          `${stage}'s GitHub p99 is above its p95`,
        ).toBeGreaterThan(github!.p95);
      });
    }
  });
});

// The test runner's Performance group (md/plans/k6-test-runner-plan.md): one
// suite per stage, run on a GitHub machine through the same run script, never
// against a deployed host.
test.describe("k6 in the test runner (guard)", () => {
  // The catalog has one performance suite per stage, and each names a real
  // stage.
  test("the runner's Performance group has one suite per k6 stage", async () => {
    expected(
      "group-perf-<stage> suites in the performance category for exactly the run script's six stages, each runner k6, one shard, no app",
    );
    const groups = readCatalog().flows.filter(
      (flow: { runner: string }) => flow.runner === "k6",
    );
    fact(
      "groups",
      groups.map((flow: { name: string }) => flow.name).join(", "),
    );
    await test.step("one group per stage", () => {
      expect(
        groups.map((flow: { stage: string }) => flow.stage).sort(),
        "the groups match the stages",
      ).toEqual([...STAGES].sort());
    });
    await test.step("each is a performance suite with one shard and no app", () => {
      for (const flow of groups) {
        expect(flow.id, `${flow.id} is named for its stage`).toBe(
          `group-perf-${flow.stage}`,
        );
        expect(flow.category, `${flow.id} is under Performance`).toBe(
          "performance",
        );
        expect(flow.maxShards, `${flow.id} runs on one machine`).toBe(1);
        expect(flow.needsApp, `${flow.id} serves no app`).toBe(false);
        expect(
          flow.seconds,
          `${flow.id} says how long it runs`,
        ).toBeGreaterThan(0);
      }
    });
  });

  // A load flow becomes the run script's command, with nothing of
  // Playwright's, and refuses a deployed host.
  test("a load flow runs the k6 run script and refuses a target URL", async () => {
    expected(
      "group-perf-stress: argv k6-run stress, spawned as node scripts/k6/run.js stress, no extra env; a target URL refused before anything runs",
    );
    const flow = findFlow(readCatalog(), "group-perf-stress");
    await test.step("the command", () => {
      expect(buildArgv(flow, {}), "the stage goes to the run script").toEqual([
        "k6-run",
        "stress",
      ]);
      const spawned = toSpawn(buildArgv(flow, {}));
      expect(spawned.command, "run with Node").toBe(process.execPath);
      expect(spawned.args[0].replace(/\\/g, "/"), "the k6 run script").toMatch(
        /scripts\/k6\/run\.js$/,
      );
      expect(spawned.args[1], "its stage").toBe("stress");
      expect(buildEnv(flow, {}), "no Playwright settings").toEqual({});
      expect(describeCommand(flow, {}), "the command as people read it").toBe(
        "node scripts/k6/run.js stress",
      );
    });
    await test.step("a deployed host is refused", () => {
      expect(
        () =>
          buildArgv(flow, {
            targetUrl: "https://agents-playground-app.onrender.com",
          }),
        "a load flow never aims at a deployed host",
      ).toThrow(/never a deployed host/);
    });
  });

  // The workflow downloads exactly the pinned k6 and checks its SHA256.
  test("the runner's workflow installs the pinned k6, checked against its SHA256", async () => {
    expected(
      "remote-test-runner.yml: an Install k6 step only for k6 flows, K6_VERSION equal to the run script's pin, a 64-hex K6_SHA256 checked with sha256sum -c",
    );
    const workflow = readFileSync(
      ".github/workflows/remote-test-runner.yml",
      "utf8",
    );
    // Just the Install k6 step: from its name to the next step's.
    const start = workflow.indexOf("- name: Install k6");
    const next = workflow.indexOf("- name:", start + 1);
    const step = workflow.slice(start, next === -1 ? undefined : next);
    await test.step("the step runs only for k6 flows", () => {
      expect(step, "the step exists").toContain("- name: Install k6");
      expect(step, "only for k6 flows").toContain(
        "if: needs.plan.outputs.runner == 'k6'",
      );
    });
    await test.step("pinned and checked", () => {
      fact("pin", K6_VERSION);
      expect(step, "the run script's version").toContain(
        `K6_VERSION: ${K6_VERSION}`,
      );
      expect(step, "a published SHA256").toMatch(/K6_SHA256: [0-9a-f]{64}\n/);
      expect(step, "the download is checked before use").toContain(
        "sha256sum -c -",
      );
      expect(step, "never a moving 'latest' address").not.toContain("latest");
    });
  });
});
