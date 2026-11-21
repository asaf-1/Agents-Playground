#!/usr/bin/env node

// Strict mode for the whole file.
"use strict";

// Runs one k6 load-test stage against Playground Bank on this PC, and only on
// this PC (Part 7 of the Codex review plan):
//
//   npm run k6:baseline | k6:load | k6:stress | k6:spike | k6:soak | k6:breakpoint
//
// 1. Refuses any address but http://127.0.0.1:<port>, before anything else,
//    so Render or any other site can never be load-tested by mistake.
// 2. Starts a fresh bank on that port: PGlite in memory, never DATABASE_URL.
// 3. Runs the stage's k6 script (tests/k6/<stage>.js), sampling the bank's
//    memory as it goes.
// 4. Checks the money afterwards: the stage's own check (the customers'
//    money only moved between them and to the shop), the Books check (every
//    account's history adds up to its balance), no stock below zero, and the
//    bank still answers ready.
// 5. Prints a [RESULT] block and writes the numbers to .artifacts/k6/, each
//    run replacing the last. The bank is stopped at the end.
//
// No CI: k6 runs on this PC only. A normal test (tests/e2e/infra/k6-run.spec.ts)
// checks the refusals without k6, because GitHub's runners have no k6.

// Files, paths, child processes, and the network.
const fs = require("node:fs");
const path = require("node:path");
const net = require("node:net");
const { execSync, spawn } = require("node:child_process");

// The repo's root folder, and where the results go.
const ROOT = path.resolve(__dirname, "..", "..");
const OUT = path.join(ROOT, ".artifacts", "k6");

// The k6 version this repo is written for. scripts/infra-versions.js keeps it
// current (grafana/k6's own releases, the 7-day wait), and
// scripts/local-sync.js says when this PC's k6 differs. The repo downloads
// nothing for k6: winget installs it on the PC and checks its own hash.
const K6_VERSION = "2.4.0";

// The stages, each a script in tests/k6/ named for its kind of test:
// baseline (light reading), load (normal use), stress (heavy use), spike (a
// sudden jump, then recovery), soak (10 minutes, to watch memory and
// slow-downs) and breakpoint (more and more load until the bank breaks, to
// find where).
const STAGES = ["baseline", "load", "stress", "spike", "soak", "breakpoint"];

// The stage whose job is to break the bank: crossing a line there is its
// result, not a failure.
const BREAKPOINT = "breakpoint";

// The address when none is given. Not 4173: a Playwright run frees that port
// before it starts, and would stop this bank in the middle of a load test.
const DEFAULT_ADDRESS = "http://127.0.0.1:4174";

// The public demo Admin log-in (README), to read the Books check.
const ADMIN = { email: "alex@playgroundbank.test", password: "demo1234" };

// The pass/fail limits for each stage's response times, in milliseconds, set
// from three runs of each stage on this PC on 2026-11-19 (never guessed): the
// worst of the three, doubled for a PC's normal ups and downs, rounded up to
// 5 ms. The worst p95 / p99 measured: baseline 4.6 / 26.8, load 13.6 / 36.8,
// stress 46.7 / 61.1, spike 12.7 / 31.2 (measured under their first names,
// mix, busy and burst). "soak" is watched, not limited: it is run by hand, for
// memory and slow-downs. "breakpoint" has no limit by design: it stops itself
// where the bank breaks (tests/k6/breakpoint.js). PGlite runs one
// transaction at a time, so these are PGlite's numbers; Postgres numbers wait
// for backend Phase 1.
const LIMITS = {
  baseline: { p95: 10, p99: 55 },
  load: { p95: 30, p99: 75 },
  stress: { p95: 95, p99: 125 },
  spike: { p95: 30, p99: 65 },
  soak: null,
  breakpoint: null,
};

// On GitHub (the test runner's load-test flows), a machine that is slower and
// shared, so this PC's limits would fail there for no reason. GitHub's own
// were set the same way from three GitHub runs of each stage on 2026-11-21
// (v1.38.2 for load and stress, whose scripts changed that day): the worst of
// the three, doubled, rounded up to 5 ms. The worst p95 / p99 measured:
// baseline 5.89 / 35.15, load 7.64 / 48.65, stress 74.58 / 92.47, spike
// 6.51 / 10.18. Stress varies most there (p95 39 to 75 across its runs).
// Soak and breakpoint have none, as on the PC.
const ON_GITHUB = process.env.GITHUB_ACTIONS === "true";
const GITHUB_LIMITS = {
  baseline: { p95: 15, p99: 75 },
  load: { p95: 20, p99: 100 },
  stress: { p95: 150, p99: 185 },
  spike: { p95: 15, p99: 25 },
  soak: null,
  breakpoint: null,
};

// Where the run happens, for the report.
const WHERE = ON_GITHUB ? "the GitHub runner" : "this PC";

// --- The refusals (no k6, no server) ---------------------------------------------

// Why an address is refused, or null when it is this PC: exactly
// http://127.0.0.1:<port>. "localhost" is refused too: the rule is one
// spelling, so nothing can resolve it elsewhere.
function refuseAddress(address) {
  if (!/^http:\/\/127\.0\.0\.1:\d{2,5}$/.test(String(address || ""))) {
    return `Refused: load tests run only against this PC, http://127.0.0.1:<port>. "${address}" is not that.`;
  }
  const port = Number(address.split(":").pop());
  if (port < 1024 || port > 65535) {
    return `Refused: port ${port} is not one a test server can use (1024-65535).`;
  }
  return null;
}

// The stage and the address from the command line, or why they are refused.
function parseArgs(argv) {
  const [stage, ...rest] = argv;
  if (!STAGES.includes(stage)) {
    return {
      error: `Refused: the stage must be one of ${STAGES.join(", ")}, not "${stage ?? ""}".`,
    };
  }
  let address = DEFAULT_ADDRESS;
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === "--base-url") address = rest[++i];
    else if (rest[i].startsWith("--base-url=")) address = rest[i].slice(11);
    else return { error: `Refused: unknown option "${rest[i]}".` };
  }
  const refused = refuseAddress(address);
  if (refused) return { error: refused };
  return { stage, address };
}

// k6's version on this PC, or null when it is not installed.
function installedK6() {
  try {
    const text = execSync("k6 version", {
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8",
    });
    return text.match(/v(\d+\.\d+\.\d+)/)?.[1] ?? null;
  } catch {
    return null;
  }
}

// --- The bank under test ---------------------------------------------------------

// Whether something already listens on this port.
function portInUse(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
}

// Starts a fresh bank on the port: PGlite in memory (DATABASE_URL removed, so
// Neon is never touched), no tracing, no test hooks, no sign-up limit.
function startBank(port) {
  const env = { ...process.env, HOST: "127.0.0.1", PORT: String(port) };
  for (const name of [
    "DATABASE_URL",
    "OTEL_EXPORTER_OTLP_ENDPOINT",
    "BANK_TEST_HOOKS",
    "BANK_SIGNUP_BURST",
    "BANK_SIGNUP_EVERY_SECONDS",
    "BANK_TRUST_PROXY",
  ]) {
    delete env[name];
  }
  const child = spawn(process.execPath, ["server.js", String(port)], {
    cwd: ROOT,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (chunk) => (output += chunk));
  child.stderr.on("data", (chunk) => (output += chunk));
  return { child, output: () => output };
}

// Waits until the bank says ready, or gives up after 90 seconds.
async function waitReady(address, bank) {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (bank.child.exitCode !== null) {
      throw new Error(`the bank stopped while starting:\n${bank.output()}`);
    }
    try {
      const response = await fetch(`${address}/api/bank/health/ready`);
      if (response.ok) return;
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(
    `the bank was not ready in 90 s:\n${bank.output().slice(-800)}`,
  );
}

// A process's memory in megabytes, or null when it can't be read.
function memoryMb(pid) {
  try {
    if (process.platform === "win32") {
      const row = execSync(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`, {
        stdio: ["ignore", "pipe", "ignore"],
        encoding: "utf8",
      });
      const kb = Number(row.trim().split('","').pop().replace(/\D/g, ""));
      return kb ? Math.round(kb / 1024) : null;
    }
    if (process.platform === "linux") {
      const status = fs.readFileSync(`/proc/${pid}/status`, "utf8");
      const kb = Number(status.match(/VmRSS:\s+(\d+)/)?.[1]);
      return kb ? Math.round(kb / 1024) : null;
    }
    const kb = Number(
      execSync(`ps -o rss= -p ${pid}`, { encoding: "utf8" }).trim(),
    );
    return kb ? Math.round(kb / 1024) : null;
  } catch {
    return null;
  }
}

// --- k6 ----------------------------------------------------------------------

// Runs the stage's script while the bank's memory is sampled every 5
// seconds. k6 gets the terminal itself, so it draws one progress bar with a
// percentage that updates in place (piped, it prints a new block every
// second). Its log lines (console.log in the scripts, the MONEY line among
// them) come on stderr: those are shown as they come and kept. Returns k6's
// exit code, its log lines and the memory samples.
function runK6(stage, address, summaryFile, bankPid) {
  return new Promise((resolve) => {
    // Each sample: seconds since k6 started, and megabytes.
    const samples = [];
    const started = Date.now();
    const sample = () => {
      const mb = memoryMb(bankPid);
      if (mb) samples.push({ at: (Date.now() - started) / 1000, mb });
    };
    sample();
    const timer = setInterval(sample, 5_000);
    let output = "";
    const k6 = spawn(
      "k6",
      [
        "run",
        "--summary-export",
        summaryFile,
        "--summary-trend-stats",
        "avg,med,p(95),p(99),max",
        "-e",
        `BASE_URL=${address}`,
        path.join("tests", "k6", `${stage}.js`),
      ],
      { cwd: ROOT, stdio: ["ignore", "inherit", "pipe"], shell: false },
    );
    k6.stderr.on("data", (chunk) => {
      output += chunk;
      process.stderr.write(chunk);
    });
    k6.on("close", (code) => {
      clearInterval(timer);
      sample();
      resolve({ code, output, samples });
    });
  });
}

// The stage's own money line, printed by moneyStillAddsUp in
// framework/k6/bank.js.
function moneyLine(output) {
  const m = output.match(
    /MONEY before=(-?\d+) after=(-?\d+) spent=(\d+) full_order_lists=(\d+) adds_up=(true|false)/,
  );
  return m
    ? {
        before: +m[1],
        after: +m[2],
        spent: +m[3],
        fullLists: +m[4],
        addsUp: m[5] === "true",
      }
    : null;
}

// --- After the run: the bank's own books ---------------------------------------

// Logs in as the demo Admin and reads the Books check; reads the shop's
// stock; asks ready once more.
async function afterChecks(address) {
  const login = await fetch(`${address}/api/bank/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(ADMIN),
  });
  const cookie = (login.headers.getSetCookie?.() || [])
    .map((value) => value.split(";")[0])
    .join("; ");
  const books = await (
    await fetch(`${address}/api/bank/admin/books`, {
      headers: { cookie },
    })
  ).json();
  const products = (
    await (await fetch(`${address}/api/bank/shop/products`)).json()
  ).products;
  // Ready again: a bank that was pushed until it broke gets 30 seconds to
  // work through what was waiting.
  let ready = 0;
  const deadline = Date.now() + 30_000;
  while (ready !== 200 && Date.now() < deadline) {
    try {
      ready = (await fetch(`${address}/api/bank/health/ready`)).status;
    } catch {
      ready = 0;
    }
    if (ready !== 200)
      await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return {
    books,
    belowZero: products.filter((item) => item.stock < 0).length,
    ready,
  };
}

// --- The report --------------------------------------------------------------

// One line of the [RESULT] block, the same layout as the tests' block
// (framework/fixtures/resultBlock.ts).
function row(label, value) {
  return `${label.padEnd(10)}: ${value}`.trimEnd();
}

// A number from k6's summary, or 0 when the metric never happened.
function metric(summary, name, field) {
  return summary.metrics?.[name]?.[field] ?? 0;
}

// Milliseconds, rounded.
const ms = (value) => `${Math.round(value)} ms`;

// The lines that mean "broken" in tests/k6/breakpoint.js, in words.
const BREAK_LINES = {
  unexpected_errors: "unexpected errors",
  slow_answers: "50 answers over a second",
  http_req_duration: "p95 over 500 ms",
};

// Where the breakpoint stage stopped: the lines it crossed (true in k6's
// summary means crossed), the visits a second it had reached, and the most
// virtual users busy at once.
function breakReport(summary, code) {
  const crossed = Object.entries(BREAK_LINES)
    .filter(([name]) =>
      Object.values(summary.metrics?.[name]?.thresholds || {}).some(Boolean),
    )
    .map(([, words]) => words);
  return {
    broke: code === 99 && crossed.length > 0,
    crossed,
    rate: metric(summary, "load_rate", "value"),
    users: metric(summary, "load_users", "max"),
  };
}

// The bank's memory over the run: at the start, settled (the first sample 30
// seconds in, after PGlite's start-up peak), the highest after that, and at
// the end. A bank that keeps growing shows as an end well above "settled";
// that is what the soak stage is for.
function memoryReport(samples) {
  if (samples.length === 0) return null;
  const settledAt = samples.findIndex((sample) => sample.at >= 30);
  const settled = samples[settledAt === -1 ? samples.length - 1 : settledAt];
  const after = samples.slice(
    settledAt === -1 ? samples.length - 1 : settledAt,
  );
  return {
    start: samples[0].mb,
    settled: settled.mb,
    peakAfterSettled: Math.max(...after.map((sample) => sample.mb)),
    end: samples[samples.length - 1].mb,
  };
}

// Everything one run found, and whether it passed.
function judgeRun({ stage, address, k6Version, k6Run, summary, money, after }) {
  const failures = [];
  const unexpected = metric(summary, "unexpected_errors", "count");
  const checksFailed = metric(summary, "checks", "fails");
  const p95 = metric(summary, "http_req_duration", "p(95)");
  const p99 = metric(summary, "http_req_duration", "p(99)");
  // The breakpoint stage stops itself (k6's code 99, "thresholds crossed")
  // when the bank breaks, with unexpected answers among the signs: that is
  // its result. Any other stage, or any other code, fails.
  const breakpoint = stage === BREAKPOINT;
  if (k6Run.code !== 0 && !(breakpoint && k6Run.code === 99)) {
    failures.push(`k6 ended with code ${k6Run.code}`);
  }
  if (unexpected > 0 && !breakpoint) {
    failures.push(`${unexpected} unexpected errors`);
  }
  if (checksFailed > 0) failures.push(`${checksFailed} checks failed`);
  if (!money) failures.push("the stage printed no MONEY line");
  // A full order list means the check could not see every order: it cannot
  // say the money adds up, but nothing says money was lost either.
  else if (money.fullLists > 0)
    failures.push(
      `could not count every order: ${money.fullLists} ${money.fullLists === 1 ? "customer has" : "customers have"} 100 or more, the most the bank lists`,
    );
  else if (!money.addsUp) failures.push("the customers' money does not add up");
  if (!after.books.balanced) failures.push("the Books check is out of balance");
  if (after.belowZero > 0)
    failures.push(`${after.belowZero} products below zero stock`);
  if (after.ready !== 200)
    failures.push(`ready answered ${after.ready} after the run`);
  const limit = (ON_GITHUB ? GITHUB_LIMITS : LIMITS)[stage];
  if (limit && p95 > limit.p95)
    failures.push(`p95 ${ms(p95)} over its limit ${ms(limit.p95)}`);
  if (limit && p99 > limit.p99)
    failures.push(`p99 ${ms(p99)} over its limit ${ms(limit.p99)}`);
  return {
    stage,
    passed: failures.length === 0,
    failures,
    target: address,
    k6: k6Version,
    requests: metric(summary, "http_reqs", "count"),
    perSecond: metric(summary, "http_reqs", "rate"),
    p95,
    p99,
    max: metric(summary, "http_req_duration", "max"),
    unexpected,
    slow: metric(summary, "slow_answers", "count"),
    dropped: metric(summary, "dropped_iterations", "count"),
    breakpoint: breakpoint ? breakReport(summary, k6Run.code) : null,
    busy: metric(summary, "busy_answers", "count"),
    refused: metric(summary, "refused_answers", "count"),
    replays: metric(summary, "replayed_answers", "count"),
    checksPassed: metric(summary, "checks", "passes"),
    checksFailed,
    phases: Object.fromEntries(
      Object.entries(summary.metrics || {})
        .filter(([name]) => name.startsWith("http_req_duration{phase:"))
        .map(([name, value]) => [
          name.slice("http_req_duration{phase:".length, -1),
          { p95: value["p(95)"], p99: value["p(99)"] },
        ]),
    ),
    money,
    books: {
      balanced: after.books.balanced,
      differenceCents: after.books.differenceCents,
      accounts: after.books.checkedAccounts,
    },
    stockBelowZero: after.belowZero,
    memoryMb: memoryReport(k6Run.samples),
    refusedByCode: Object.fromEntries(
      Object.entries(summary.metrics || {})
        .filter(
          ([name, value]) =>
            name.startsWith("refused_answers{code:") && value.count > 0,
        )
        .map(([name, value]) => [
          name.slice("refused_answers{code:".length, -1),
          value.count,
        ]),
    ),
    limit,
  };
}

// The [RESULT] block for one run.
function resultBlock(result) {
  const phases = Object.entries(result.phases)
    .map(([name, value]) => `${name} ${ms(value.p95)}`)
    .join(", ");
  const lines = [
    row("test", `k6 ${result.stage} (tests/k6/${result.stage}.js)`),
    row("status", result.passed ? "PASSED" : "FAILED"),
    row(
      "expected",
      result.breakpoint
        ? "load rises until the bank breaks; after it, the money adds up, the books balance, no stock below zero, ready again"
        : "no unexpected errors, every check passes, the money adds up, the books balance, no stock below zero, ready after",
    ),
  ];
  if (!result.passed) lines.push(row("error", result.failures.join("; ")));
  lines.push(
    row("target", `${result.target} (PGlite on ${WHERE})`),
    row("k6", result.k6),
    row(
      "requests",
      `${result.requests} (${result.perSecond.toFixed(1)} per second)`,
    ),
    row(
      "p95 / p99",
      `${ms(result.p95)} / ${ms(result.p99)} (max ${ms(result.max)})`,
    ),
  );
  if (phases) lines.push(row("p95 phase", phases));
  if (result.breakpoint) {
    const where = result.breakpoint;
    lines.push(
      row(
        "broke at",
        where.broke
          ? `about ${where.rate} visits a second (${where.users} users busy at most), by ${where.crossed.join(" and ")}`
          : `did not break: reached ${where.rate} visits a second`,
      ),
      row("k6 behind", `${result.dropped} visits it couldn't start on time`),
    );
  }
  lines.push(
    row(
      "limit",
      result.limit
        ? `p95 ${ms(result.limit.p95)}, p99 ${ms(result.limit.p99)}`
        : result.breakpoint
          ? "none: it stops itself where the bank breaks"
          : result.stage === "soak"
            ? "none: this stage is watched, not limited"
            : "not set on GitHub yet (three GitHub runs first)",
    ),
    row("unexpected", result.unexpected),
    row("slow", `${result.slow} answers over a second`),
    row("busy 503", result.busy),
    row(
      "refused",
      Object.keys(result.refusedByCode).length
        ? `${result.refused} (${Object.entries(result.refusedByCode)
            .map(([code, count]) => `${code} ${count}`)
            .join(", ")})`
        : result.refused,
    ),
    row("replays", result.replays),
    row(
      "checks",
      `${result.checksPassed} passed, ${result.checksFailed} failed`,
    ),
    row(
      "money",
      result.money
        ? `before ${result.money.before}, after ${result.money.after}, spent in the shop ${result.money.spent}: ${result.money.fullLists > 0 ? `could not count every order (${result.money.fullLists} at the 100-order list limit)` : result.money.addsUp ? "adds up" : "DOES NOT add up"}`
        : "no MONEY line",
    ),
    row(
      "books",
      `${result.books.balanced ? "balanced" : "OUT OF BALANCE"}, ${result.books.accounts} accounts, difference ${result.books.differenceCents} cents`,
    ),
    row(
      "stock",
      result.stockBelowZero
        ? `${result.stockBelowZero} below zero`
        : "none below zero",
    ),
    row(
      "memory",
      result.memoryMb
        ? `start ${result.memoryMb.start} MB, at 30 s ${result.memoryMb.settled} MB, highest after ${result.memoryMb.peakAfterSettled} MB, end ${result.memoryMb.end} MB`
        : "not read",
    ),
    row("results", `.artifacts/k6/${result.stage}.json`),
  );
  const top = `${"=".repeat(16)} [RESULT] ${"=".repeat(16)}`;
  return [
    "",
    top,
    ...lines.map((line) => `  ${line}`),
    "=".repeat(42),
    "",
  ].join("\n");
}

// --- The run -----------------------------------------------------------------

async function main(argv) {
  // 1. The refusals, before anything starts.
  const args = parseArgs(argv);
  if (args.error) {
    console.error(args.error);
    return 2;
  }
  const k6Version = installedK6();
  if (!k6Version) {
    console.error(
      `k6 is not installed. Install the repo's version:\n  winget install --id GrafanaLabs.k6 --exact --version ${K6_VERSION}`,
    );
    return 2;
  }
  if (k6Version.split(".")[0] !== K6_VERSION.split(".")[0]) {
    console.error(
      `Refused: this PC has k6 ${k6Version}; the scripts are written for k6 ${K6_VERSION}, a different major.\n  winget upgrade --id GrafanaLabs.k6 --exact --version ${K6_VERSION}`,
    );
    return 2;
  }
  const port = Number(args.address.split(":").pop());
  if (await portInUse(port)) {
    console.error(
      `Port ${port} is in use. Stop what runs there first: the load test starts its own fresh bank.`,
    );
    return 2;
  }

  // 2. A fresh bank.
  fs.mkdirSync(OUT, { recursive: true });
  const summaryFile = path.join(OUT, `${args.stage}-summary.json`);
  fs.rmSync(summaryFile, { force: true });
  console.log(`Starting a fresh bank on ${args.address} (PGlite in memory)...`);
  const bank = startBank(port);
  try {
    await waitReady(args.address, bank);

    // 3. k6.
    console.log(`Running k6 ${k6Version}: tests/k6/${args.stage}.js`);
    const k6Run = await runK6(
      args.stage,
      args.address,
      summaryFile,
      bank.child.pid,
    );
    const summary = fs.existsSync(summaryFile)
      ? JSON.parse(fs.readFileSync(summaryFile, "utf8"))
      : { metrics: {} };

    // 4. The money.
    const after = await afterChecks(args.address);
    const result = judgeRun({
      stage: args.stage,
      address: args.address,
      k6Version:
        k6Version === K6_VERSION
          ? k6Version
          : `${k6Version} (the repo pins ${K6_VERSION})`,
      k6Run,
      summary,
      money: moneyLine(k6Run.output),
      after,
    });

    // 5. The report.
    fs.writeFileSync(
      path.join(OUT, `${args.stage}.json`),
      `${JSON.stringify({ ...result, at: new Date().toISOString() }, null, 2)}\n`,
    );
    const block = resultBlock(result);
    console.log(block);
    // On GitHub, the block goes in the run's summary too, where the runner
    // app and the Actions page show it.
    if (process.env.GITHUB_STEP_SUMMARY) {
      fs.appendFileSync(
        process.env.GITHUB_STEP_SUMMARY,
        `### k6 ${result.stage}\n\n\`\`\`\n${block.trim()}\n\`\`\`\n`,
      );
    }
    return result.passed ? 0 : 1;
  } finally {
    bank.child.kill();
  }
}

// Run only when started directly; the tests require the pure parts.
if (require.main === module) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error) => {
      console.error(error.message);
      process.exit(1);
    },
  );
}

module.exports = {
  DEFAULT_ADDRESS,
  K6_VERSION,
  LIMITS,
  GITHUB_LIMITS,
  STAGES,
  judgeRun,
  moneyLine,
  parseArgs,
  refuseAddress,
};
