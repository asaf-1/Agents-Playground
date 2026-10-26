// A GitHub that lives inside this process.
//
// Switched on by TR_GITHUB_STUB=1 and never on by default. It exists for two
// jobs: the runner's own Playwright tests, and recording screenshots for the
// README. In both, a real dispatch would be the wrong thing - thirty pipeline
// runs for one check of a button, each one minutes long, each one real.
//
// github.js keeps every line of its real code: the stub sits below it, where
// fetch() would be, and answers the handful of GitHub API calls this app makes
// with the shapes GitHub answers them in. Nothing here touches the network.
//
// A run started here is time-driven rather than timer-driven: its state is a
// pure function of how long ago it was dispatched and TR_STUB_STEP_MS, so a
// snapshot is the same whoever asks and nothing has to be scheduled or torn
// down. Five steps take a run from queued to completed:
//
//   step 0  queued            Plan waiting
//   step 1  in progress       Plan running
//   step 2                    Plan done, shards running
//   step 4                    shards done, Report running
//   step 5  completed         Report done, artifacts up
//
// The reason a colleague types steers the outcome, so a test can ask for any
// of them: "[stub:fail]" makes two tests fail in shard 1, "[stub:infra]" makes
// Plan break before any test runs, anything else passes. Cancelling freezes the
// run at the moment of the cancel, as GitHub does.

const fs = require("node:fs");
const path = require("node:path");
const { config } = require("./config.js");

const API_ROOT = "https://api.github.com";
const WORKFLOW_NAME = "Remote Test Runner";
const TOKEN_OWNER = "stub-token-owner";
const RESULTS_ARTIFACT = "remote-test-results";
const REQUESTED_BY_SHAPE = /^[A-Za-z0-9._-]{1,48}$/;

// Where the run stands after this many steps.
const STEP_PLAN_STARTS = 1;
const STEP_SHARDS_START = 2;
const STEP_REPORT_STARTS = 4;
const STEP_DONE = 5;

// How many of a failing run's tests fail. Two: one would read as a fluke.
const FAILING_TESTS = 2;
// results.json lists every test; a 444-test regression is a few hundred
// kilobytes, which is what the real artifact weighs too.
const MAX_RESULT_TESTS = 1000;

// Seeded history, so a fresh stub has a dashboard worth looking at. Ages are
// relative to the moment the stub is first asked anything.
const SEEDS = [
  {
    flow: "group-sanity",
    who: "maya",
    ago: 11 * 60,
    seconds: 81,
    scenario: "pass",
  },
  {
    flow: "group-regression",
    who: "sam",
    ago: 47 * 60,
    seconds: 372,
    scenario: "fail",
  },
  {
    flow: "spec-app-react-bank-cards",
    who: "maya",
    ago: 75 * 60,
    seconds: 100,
    scenario: "pass",
  },
  {
    flow: "group-contract",
    who: "alex",
    ago: 2 * 3600,
    seconds: 40,
    scenario: "cancel",
  },
  {
    flow: "group-sanity-all",
    who: "sam",
    ago: 3 * 3600,
    seconds: 25,
    scenario: "infra",
  },
  {
    flow: "group-functional",
    who: "maya",
    ago: 5 * 3600,
    seconds: 95,
    scenario: "pass",
  },
  {
    flow: "group-sanity",
    who: "alex",
    ago: 26 * 3600,
    seconds: 78,
    scenario: "pass",
  },
];

// Used only when the checkout has no catalog to serve: enough to sign in, pick
// something and watch it run, which is all a stub without a repository needs.
const BUILT_IN_CATALOG = {
  schemaVersion: 1,
  discovery: "stub",
  totals: {
    flows: 4,
    specFiles: 2,
    e2eTests: 12,
    visualTests: 0,
    unitTestFiles: 0,
  },
  flows: [
    {
      id: "group-sanity",
      kind: "group",
      name: "sanity:smoke",
      description: "home, orders, product; one browser pass, a few seconds",
      area: "groups",
      runner: "playwright",
      specs: ["tests/e2e/sanity/sanity-smoke.spec.ts"],
      grep: null,
      path: null,
      testCount: 1,
      maxShards: 1,
      needsApp: true,
      tags: ["fast", "smoke"],
    },
    {
      id: "group-regression",
      kind: "group",
      name: "regression:full",
      description:
        "every Playwright test under tests/e2e; minutes, even across 8 shards",
      area: "groups",
      runner: "playwright",
      specs: [],
      grep: null,
      path: null,
      testCount: 12,
      maxShards: 8,
      needsApp: true,
      tags: ["slow", "regression"],
    },
    {
      id: "spec-app-react-orders",
      kind: "spec",
      name: "app:react-orders",
      description:
        "7 checks in tests/e2e/app/react-orders.spec.ts; under a minute",
      summary:
        "The orders screen of the React app: list, filters and the refresh button.",
      area: "app",
      runner: "playwright",
      specs: ["tests/e2e/app/react-orders.spec.ts"],
      grep: null,
      path: "tests/e2e/app/react-orders.spec.ts",
      testCount: 7,
      maxShards: 1,
      needsApp: true,
      tags: ["app"],
    },
    {
      id: "suite-app-react-orders-orders-page",
      kind: "suite",
      name: "app:react-orders > orders-page",
      description: '5 checks in "Orders page"; under a minute',
      title: "Orders page",
      area: "app",
      runner: "playwright",
      specs: ["tests/e2e/app/react-orders.spec.ts"],
      grep: "Orders page",
      path: "tests/e2e/app/react-orders.spec.ts",
      testCount: 5,
      maxShards: 1,
      needsApp: true,
      tags: ["app"],
    },
  ],
};

const BUILT_IN_PIPELINE_CONFIG = {
  environments: {
    schemaVersion: 1,
    default: "pipeline",
    entries: [
      {
        name: "pipeline",
        label: "Pipeline build (this run)",
        description:
          "The run builds the app from the checked-out commit and serves it itself. No deployed host is involved.",
        baseURL: null,
      },
    ],
  },
};

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const state = {
  seeded: false,
  runs: new Map(), // id -> record
  nextNumber: 1,
  // Eleven digits, like GitHub's, so requireRunId's shape check still passes
  // and nothing downstream has to know the run is pretend.
  nextId: 90_000_000_001,
};

function nowMs() {
  return Date.now();
}

// ---------------------------------------------------------------------------
// Repository files
// ---------------------------------------------------------------------------

function readRepoFile(relativePath) {
  const cfg = config();
  const absolute = path.join(cfg.stubRepoRoot, ...relativePath.split("/"));

  try {
    return fs.readFileSync(absolute, "utf8");
  } catch {
    return null;
  }
}

function catalogText() {
  const cfg = config();

  return (
    readRepoFile(cfg.catalogPath) ||
    `${JSON.stringify(BUILT_IN_CATALOG, null, 2)}\n`
  );
}

function pipelineConfigText() {
  const cfg = config();

  return (
    readRepoFile(cfg.pipelineConfigPath) ||
    `${JSON.stringify(BUILT_IN_PIPELINE_CONFIG, null, 2)}\n`
  );
}

function catalogFlows() {
  try {
    const parsed = JSON.parse(catalogText());

    return Array.isArray(parsed.flows) ? parsed.flows : [];
  } catch {
    return BUILT_IN_CATALOG.flows;
  }
}

function findFlow(flowId) {
  return catalogFlows().find((flow) => flow && flow.id === flowId) || null;
}

// ---------------------------------------------------------------------------
// Runs
// ---------------------------------------------------------------------------

function scenarioFor(reason, flowId) {
  const text = typeof reason === "string" ? reason.toLowerCase() : "";

  if (text.includes("[stub:fail]")) return "fail";
  if (text.includes("[stub:infra]")) return "infra";
  if (config().stubFailFlows.includes(flowId)) return "fail";

  return "pass";
}

// The spec files a flow covers, from the catalog: the flow's own file, or for
// a suite, every page under the folders it names. A stub run's tests carry
// these names, so its failures point at files that exist.
function filesOf(flow) {
  if (!flow) return [];
  if (typeof flow.path === "string" && flow.path) return [flow.path];

  const roots = Array.isArray(flow.specs) ? flow.specs : [];

  return catalogFlows()
    .filter(
      (candidate) =>
        candidate &&
        candidate.kind === "spec" &&
        typeof candidate.path === "string" &&
        (roots.length === 0 ||
          roots.some(
            (root) =>
              candidate.path === root || candidate.path.startsWith(`${root}/`),
          )),
    )
    .map((candidate) => candidate.path);
}

// The describe titles inside a spec file, from the catalog's single checks.
function blocksOf(file) {
  return catalogFlows()
    .filter(
      (candidate) =>
        candidate &&
        candidate.kind === "suite" &&
        candidate.path === file &&
        typeof candidate.title === "string" &&
        candidate.title,
    )
    .map((candidate) => candidate.title);
}

function createRun(inputs, { createdAt, stepMs, scenario, cancelAtStep } = {}) {
  const cfg = config();
  const flowId =
    (typeof inputs.flow_override === "string" && inputs.flow_override.trim()) ||
    (typeof inputs.flow === "string" && inputs.flow.trim()) ||
    "group-sanity";
  const flow = findFlow(flowId);
  const requestedBy =
    typeof inputs.requested_by === "string" &&
    REQUESTED_BY_SHAPE.test(inputs.requested_by.trim())
      ? inputs.requested_by.trim()
      : "";
  const askedShards = Number(inputs.shards);
  const maxShards =
    flow && Number.isFinite(flow.maxShards) ? flow.maxShards : 1;
  const shards =
    Number.isInteger(askedShards) && askedShards >= 1
      ? Math.min(askedShards, Math.max(maxShards, 1))
      : Math.max(maxShards, 1);
  const testCount =
    flow && Number.isFinite(flow.testCount)
      ? Math.max(flow.testCount, 0)
      : null;

  const record = {
    id: state.nextId,
    number: state.nextNumber,
    flowId,
    flowName: flow && typeof flow.name === "string" ? flow.name : flowId,
    specPath:
      (flow && typeof flow.path === "string" && flow.path) ||
      (flow && Array.isArray(flow.specs) && flow.specs[0]) ||
      "tests/e2e",
    files: filesOf(flow),
    title: flow && typeof flow.title === "string" ? flow.title : "",
    runner:
      flow && typeof flow.runner === "string" ? flow.runner : "playwright",
    testCount,
    shards: flow && flow.runner !== "playwright" ? 1 : shards,
    browser: typeof inputs.browser === "string" ? inputs.browser : "chromium",
    requestedBy,
    reason: typeof inputs.reason === "string" ? inputs.reason : "",
    ref: typeof inputs.ref === "string" ? inputs.ref : cfg.ref,
    createdAt: createdAt ?? nowMs(),
    stepMs: stepMs ?? cfg.stubStepMs,
    scenario: scenario ?? scenarioFor(inputs.reason, flowId),
    cancelledAt: null,
    cancelAtStep: cancelAtStep ?? null,
  };

  state.nextId += 1;
  state.nextNumber += 1;
  state.runs.set(String(record.id), record);

  return record;
}

function seedIfWanted() {
  if (state.seeded) return;
  state.seeded = true;

  if (!config().stubSeed) return;

  const now = nowMs();

  // Oldest first, so run numbers climb with time the way GitHub's do.
  [...SEEDS]
    .sort((a, b) => b.ago - a.ago)
    .forEach((seed) => {
      const createdAt = now - seed.ago * 1000;
      const stepMs = Math.max(
        50,
        Math.round((seed.seconds * 1000) / STEP_DONE),
      );
      const cancel = seed.scenario === "cancel";

      createRun(
        {
          flow: seed.flow,
          requested_by: seed.who,
          reason: `${seed.who} via test runner`,
        },
        {
          createdAt,
          stepMs,
          scenario: cancel ? "pass" : seed.scenario,
          // Cancelled mid-shards: the shape a colleague who pressed Cancel sees.
          cancelAtStep: cancel ? 3.2 : null,
        },
      );
    });
}

// Elapsed steps at `now`, frozen at the cancel when there was one.
function stepsAt(record, now) {
  const frozen = record.cancelledAt !== null ? record.cancelledAt : now;
  const raw = (frozen - record.createdAt) / record.stepMs;

  return Math.max(0, raw);
}

function cancelMoment(record) {
  if (record.cancelledAt !== null) return record.cancelledAt;
  if (record.cancelAtStep !== null) {
    return record.createdAt + record.cancelAtStep * record.stepMs;
  }

  return null;
}

// A seeded cancel happens by itself once its moment has passed, so a seeded
// run reads the same whether it is inspected a second or a day later.
function settleCancel(record, now) {
  if (record.cancelledAt === null && record.cancelAtStep !== null) {
    const moment = record.createdAt + record.cancelAtStep * record.stepMs;

    if (now >= moment) record.cancelledAt = moment;
  }
}

function iso(ms) {
  return new Date(ms).toISOString();
}

function at(record, step) {
  return record.createdAt + step * record.stepMs;
}

function runUrl(record) {
  return `https://github.com/${config().repo}/actions/runs/${record.id}`;
}

function jobUrl(record, jobId) {
  return `${runUrl(record)}/job/${jobId}`;
}

// The run's own title, exactly as the workflow's run-name writes it.
function displayTitle(record) {
  const who = record.requestedBy
    ? `requested by ${record.requestedBy}`
    : TOKEN_OWNER;

  return `${record.flowId} · ${who}`;
}

// Where each part of the run stands, from the clock alone.
function phases(record, now) {
  settleCancel(record, now);

  const steps = stepsAt(record, now);
  const cancelled = record.cancelledAt !== null;
  const infra = record.scenario === "infra";
  const failing = record.scenario === "fail";

  const plan = {
    started: steps >= STEP_PLAN_STARTS,
    done: steps >= STEP_SHARDS_START,
    conclusion: infra ? "failure" : "success",
  };

  const shardsStarted = plan.done && !infra && steps >= STEP_SHARDS_START;
  const shardsDone = shardsStarted && steps >= STEP_REPORT_STARTS;
  const reportStarted = shardsDone && steps >= STEP_REPORT_STARTS;
  const reportDone = reportStarted && steps >= STEP_DONE;

  // Everything below the cancel line is frozen: whatever was running becomes
  // cancelled, whatever had not started is skipped.
  const finished = cancelled || reportDone || (infra && plan.done);

  let status = "queued";
  let conclusion = null;

  if (finished) {
    status = "completed";
    conclusion = cancelled
      ? "cancelled"
      : infra || failing
        ? "failure"
        : "success";
  } else if (steps >= STEP_PLAN_STARTS) {
    status = "in_progress";
  }

  return {
    steps,
    cancelled,
    infra,
    failing,
    plan,
    shardsStarted,
    shardsDone,
    reportStarted,
    reportDone,
    finished,
    status,
    conclusion,
  };
}

function updatedAt(record, now) {
  const p = phases(record, now);

  if (p.cancelled) return record.cancelledAt;
  if (p.infra && p.plan.done) return at(record, STEP_SHARDS_START);
  if (p.reportDone) return at(record, STEP_DONE);

  return Math.min(now, at(record, Math.ceil(p.steps)));
}

function rawRun(record, now) {
  const cfg = config();
  const p = phases(record, now);

  return {
    id: record.id,
    name: WORKFLOW_NAME,
    display_title: displayTitle(record),
    run_number: record.number,
    event: "workflow_dispatch",
    status: p.status,
    conclusion: p.conclusion,
    workflow_id: 1,
    head_branch: record.ref,
    path: `.github/workflows/${cfg.workflowFile}`,
    workflow_url: `${API_ROOT}/repos/${cfg.repo}/actions/workflows/1`,
    html_url: runUrl(record),
    created_at: iso(record.createdAt),
    updated_at: iso(updatedAt(record, now)),
    run_started_at: iso(record.createdAt),
    actor: { login: TOKEN_OWNER },
  };
}

// Job state from the run's phases. `startStep`/`endStep` are where the job
// runs on the step line; `wanted` false means the job never gets to run
// (shards after a broken Plan, Report after a cancel).
function jobState(record, p, { startStep, endStep, wanted, conclusion }) {
  const cancelAt = cancelMoment(record);
  const startedAt = at(record, startStep);
  const endedAt = at(record, endStep);

  if (!wanted) {
    // A job that will never run is skipped once the run has settled, and
    // simply absent from GitHub's list before that.
    return p.finished
      ? {
          status: "completed",
          conclusion: "skipped",
          startedAt: null,
          completedAt: null,
        }
      : null;
  }

  if (p.steps < startStep) {
    if (p.cancelled) {
      return {
        status: "completed",
        conclusion: "skipped",
        startedAt: null,
        completedAt: null,
      };
    }

    // GitHub lists a job only once the jobs it needs have finished: the test
    // machines appear after Plan, Report after the tests. Plan exists from
    // the start, waiting for a machine.
    return startStep > STEP_PLAN_STARTS
      ? null
      : {
          status: "queued",
          conclusion: null,
          startedAt: null,
          completedAt: null,
        };
  }

  if (p.cancelled && cancelAt < endedAt) {
    return {
      status: "completed",
      conclusion: "cancelled",
      startedAt,
      completedAt: cancelAt,
    };
  }

  if (p.steps < endStep) {
    return {
      status: "in_progress",
      conclusion: null,
      startedAt,
      completedAt: null,
    };
  }

  return { status: "completed", conclusion, startedAt, completedAt: endedAt };
}

const PLAN_STEPS = [
  "Set up job",
  "Resolve revision",
  "Checkout",
  "Set up Node.js",
  "Install dependencies",
  "Resolve flow into an execution plan",
  "Upload plan",
];

const SHARD_STEPS = [
  "Set up job",
  "Checkout",
  "Set up Node.js",
  "Install dependencies",
  "Install Playwright browser",
  "Resolve plan for this shard",
  "Run flow",
  "Upload blob report",
  "Upload run artifacts",
];

const REPORT_STEPS = [
  "Set up job",
  "Checkout",
  "Set up Node.js",
  "Install dependencies",
  "Download blob reports",
  "Merge shard reports into one HTML report",
  "Upload merged HTML report",
  "Produce machine-readable results",
  "Upload machine-readable results",
  "Write run summary",
  "Reflect the test result",
];

// Steps mirror the job: all done when the job is done, the first few done and
// one running while it runs, none before it starts. A broken job breaks on its
// main step.
function rawSteps(names, job, brokenStep) {
  return names.map((name, index) => {
    const number = index + 1;

    if (!job || job.status === "queued") {
      return { number, name, status: "queued", conclusion: null };
    }

    if (job.status === "in_progress") {
      const running = Math.min(Math.floor(names.length / 2), names.length - 1);

      if (index < running) {
        return { number, name, status: "completed", conclusion: "success" };
      }
      if (index === running) {
        return { number, name, status: "in_progress", conclusion: null };
      }

      return { number, name, status: "queued", conclusion: null };
    }

    if (job.conclusion === "skipped") {
      return { number, name, status: "completed", conclusion: "skipped" };
    }

    if (job.conclusion === "cancelled") {
      return {
        number,
        name,
        status: "completed",
        conclusion:
          index < Math.floor(names.length / 2) ? "success" : "cancelled",
      };
    }

    if (job.conclusion === "failure" && typeof brokenStep === "number") {
      return {
        number,
        name,
        status: "completed",
        conclusion:
          index < brokenStep
            ? "success"
            : index === brokenStep
              ? "failure"
              : "skipped",
      };
    }

    return { number, name, status: "completed", conclusion: "success" };
  });
}

function jobRecords(record, now) {
  const p = phases(record, now);
  const jobs = [];
  const planJob = jobState(record, p, {
    startStep: STEP_PLAN_STARTS,
    endStep: STEP_SHARDS_START,
    wanted: true,
    conclusion: p.infra ? "failure" : "success",
  });

  jobs.push({
    kind: "plan",
    id: record.id * 100 + 1,
    name: "Plan",
    state: planJob,
    steps: rawSteps(PLAN_STEPS, planJob, 5),
    shard: 0,
  });

  for (let shard = 1; shard <= record.shards; shard += 1) {
    const failsHere = p.failing && shard === 1;
    const shardJob = jobState(record, p, {
      startStep: STEP_SHARDS_START,
      endStep: STEP_REPORT_STARTS,
      wanted: !p.infra,
      conclusion: failsHere ? "failure" : "success",
    });

    jobs.push({
      kind: "shard",
      id: record.id * 100 + 1 + shard,
      name: `${record.flowName} (${shard}/${record.shards})`,
      state: shardJob,
      steps: rawSteps(SHARD_STEPS, shardJob, 6),
      shard,
    });
  }

  const reportJob = jobState(record, p, {
    startStep: STEP_REPORT_STARTS,
    endStep: STEP_DONE,
    wanted: !p.infra,
    conclusion: p.failing ? "failure" : "success",
  });

  jobs.push({
    kind: "report",
    id: record.id * 100 + 99,
    name: "Report",
    state: reportJob,
    steps: rawSteps(REPORT_STEPS, reportJob, 10),
    shard: 0,
  });

  // GitHub lists only jobs that exist yet. A skipped-because-never-started job
  // appears once the run has settled, which jobState already encodes as null
  // versus "skipped".
  return jobs.filter((job) => job.state !== null);
}

function rawJob(record, job) {
  return {
    id: job.id,
    run_id: record.id,
    name: job.name,
    status: job.state.status,
    conclusion: job.state.conclusion,
    started_at: job.state.startedAt === null ? null : iso(job.state.startedAt),
    completed_at:
      job.state.completedAt === null ? null : iso(job.state.completedAt),
    html_url: jobUrl(record, job.id),
    steps: job.steps,
  };
}

function findJob(jobId) {
  const wanted = String(jobId);

  for (const record of state.runs.values()) {
    const job = jobRecords(record, nowMs()).find(
      (entry) => String(entry.id) === wanted,
    );

    if (job) return { record, job };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Tests, logs and results
// ---------------------------------------------------------------------------

// The tests a run claims to have executed. The catalog knows how many, and
// which files and describe blocks they live in; the test titles themselves
// are "check N", because the catalog does not list single tests and the stub
// will not invent names that look like real ones.
function testsOf(record) {
  const count = Math.min(record.testCount ?? 0, MAX_RESULT_TESTS);
  const tests = [];
  const failing =
    record.scenario === "fail" ? Math.min(FAILING_TESTS, count) : 0;
  const files = record.files.length ? record.files : [record.specPath];

  for (let index = 1; index <= count; index += 1) {
    const shard = ((index - 1) % record.shards) + 1;
    const failed = index <= failing;
    const file = files[(index - 1) % files.length];
    const blocks = record.title ? [record.title] : blocksOf(file);
    const block = blocks.length
      ? blocks[Math.floor((index - 1) / files.length) % blocks.length]
      : record.flowName;
    const line = 10 + index * 7;

    tests.push({
      title: `${block} › check ${index}`,
      file,
      line,
      shard,
      // Seconds, spread so a table of durations does not read as one number.
      durationMs: 400 + ((index * 137) % 2600),
      status: failed ? "unexpected" : "expected",
      error: failed
        ? `Error: expect(received).toBe(expected)\n\nExpected: 200\nReceived: 500\n\n    at ${file}:${line}:5`
        : null,
    });
  }

  return tests;
}

function shardLog(record, job, now) {
  const p = phases(record, now);
  const tests = testsOf(record).filter((test) => test.shard === job.shard);
  const lines = [
    `##[group]Run node scripts/test-runner/exec-flow.js --shard ${job.shard}`,
    `[flow] ${record.flowId} (${record.flowName}) shard ${job.shard}/${record.shards}, browser ${record.browser}`,
    `Running ${tests.length} test${tests.length === 1 ? "" : "s"} using 2 workers`,
    "",
  ];

  if (job.state.status === "queued") {
    return "";
  }

  const shown =
    job.state.status === "in_progress"
      ? tests.slice(0, Math.max(1, Math.floor(tests.length / 2)))
      : tests;

  for (const [index, test] of shown.entries()) {
    const mark = test.status === "unexpected" ? "✘" : "✓";

    lines.push(
      `  ${mark}  ${index + 1} [default] › ${test.file}:${test.line}:5 › ${test.title} (${(test.durationMs / 1000).toFixed(1)}s)`,
    );

    if (test.status === "unexpected") {
      lines.push(
        "",
        ...test.error.split("\n").map((line) => `    ${line}`),
        "",
      );
    }
  }

  if (job.state.status === "completed") {
    const failed = shown.filter((test) => test.status === "unexpected").length;
    const passed = shown.length - failed;

    lines.push("");
    if (failed) lines.push(`  ${failed} failed`);
    lines.push(`  ${passed} passed (${(shown.length * 1.4).toFixed(1)}s)`);

    if (job.state.conclusion === "cancelled") {
      lines.push("", "##[error]The operation was canceled.");
    } else if (failed) {
      lines.push("", "##[error]Process completed with exit code 1.");
    }
  } else if (p.cancelled) {
    lines.push("", "##[error]The operation was canceled.");
  }

  return `${lines.join("\n")}\n`;
}

function planLog(record, job) {
  const lines = [
    "[plan] resolving flow against scripts/test-runner/flow-catalog.json",
    `[plan] flow ${record.flowId} -> ${record.flowName}`,
    `[plan] shards ${record.shards}, browser ${record.browser}, environment pipeline`,
  ];

  if (job.state.conclusion === "failure") {
    lines.push(
      "",
      "##[error]npm ci failed: ENOTFOUND registry.npmjs.org (stub pipeline problem)",
      "##[error]Process completed with exit code 1.",
    );
  } else if (job.state.status === "completed") {
    lines.push("[plan] wrote .artifacts/test-runner/plan.json");
  }

  return `${lines.join("\n")}\n`;
}

function reportLog(record, job) {
  const lines = [
    `[report] merging ${record.shards} blob report${record.shards === 1 ? "" : "s"}`,
    "[report] wrote playwright-report/index.html",
    "[report] wrote .artifacts/test-runner/results.json",
  ];

  if (job.state.conclusion === "failure") {
    lines.push("", "##[error]Remote test run failed (shards: failure)");
  }

  return `${lines.join("\n")}\n`;
}

function jobLog(record, job, now) {
  if (job.kind === "plan") return planLog(record, job);
  if (job.kind === "report") return reportLog(record, job);

  return shardLog(record, job, now);
}

// Playwright's JSON report, as `merge-reports --reporter=json` writes it: a
// suite per file, a spec per test, the status vocabulary of expected,
// unexpected, flaky and skipped.
function resultsJson(record) {
  const tests = testsOf(record);
  const byFile = new Map();

  for (const test of tests) {
    if (!byFile.has(test.file)) byFile.set(test.file, []);
    byFile.get(test.file).push(test);
  }

  const suites = [...byFile.entries()].map(([file, list]) => ({
    title: file,
    file,
    line: 0,
    column: 0,
    specs: list.map((test) => ({
      title: test.title,
      ok: test.status === "expected",
      tags: [],
      tests: [
        {
          timeout: 30000,
          annotations: [],
          expectedStatus: "passed",
          projectId: "default",
          projectName: "default",
          results: [
            {
              workerIndex: test.shard - 1,
              status: test.status === "expected" ? "passed" : "failed",
              duration: test.durationMs,
              error: test.error ? { message: test.error } : undefined,
              errors: test.error ? [{ message: test.error }] : [],
              retry: 0,
              startTime: iso(at(record, STEP_SHARDS_START)),
              attachments: [],
            },
          ],
          status: test.status,
        },
      ],
      id: `stub-${record.id}-${test.line}`,
      file,
      line: test.line,
      column: 5,
    })),
  }));

  const unexpected = tests.filter(
    (test) => test.status === "unexpected",
  ).length;

  return {
    config: {
      rootDir: "tests/e2e",
      projects: [{ id: "default", name: "default" }],
    },
    suites,
    errors: [],
    stats: {
      startTime: iso(at(record, STEP_SHARDS_START)),
      duration: (STEP_REPORT_STARTS - STEP_SHARDS_START) * record.stepMs,
      expected: tests.length - unexpected,
      skipped: 0,
      unexpected,
      flaky: 0,
    },
  };
}

// ---------------------------------------------------------------------------
// A zip file, stored, no compression: the one format the artifact endpoint
// answers in. Small enough to write by hand, and nothing in Node writes one.
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);

  for (let n = 0; n < 256; n += 1) {
    let c = n;

    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }

    table[n] = c >>> 0;
  }

  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;

  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function storedZip(entries) {
  const parts = [];
  const central = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const data = Buffer.isBuffer(entry.data)
      ? entry.data
      : Buffer.from(entry.data, "utf8");
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // utf-8 names
    local.writeUInt16LE(0, 8); // stored
    local.writeUInt16LE(0, 10); // time
    local.writeUInt16LE(0x21, 12); // date: 1980-01-01
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);

    const header = Buffer.alloc(46);
    header.writeUInt32LE(0x02014b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(20, 6);
    header.writeUInt16LE(0x0800, 8);
    header.writeUInt16LE(0, 10);
    header.writeUInt16LE(0, 12);
    header.writeUInt16LE(0x21, 14);
    header.writeUInt32LE(crc, 16);
    header.writeUInt32LE(data.length, 20);
    header.writeUInt32LE(data.length, 24);
    header.writeUInt16LE(name.length, 28);
    header.writeUInt16LE(0, 30);
    header.writeUInt16LE(0, 32);
    header.writeUInt16LE(0, 34);
    header.writeUInt16LE(0, 36);
    header.writeUInt32LE(0, 38);
    header.writeUInt32LE(offset, 42);

    parts.push(local, name, data);
    central.push(header, name);
    offset += local.length + name.length + data.length;
  }

  const centralSize = central.reduce((total, part) => total + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...parts, ...central, end]);
}

// ---------------------------------------------------------------------------
// Artifacts
// ---------------------------------------------------------------------------

function artifactRecords(record, now) {
  const p = phases(record, now);
  const artifacts = [];

  if (record.runner === "vitest") return artifacts;

  if (p.shardsDone || (p.cancelled && p.shardsStarted)) {
    for (let shard = 1; shard <= record.shards; shard += 1) {
      artifacts.push({
        id: record.id * 10 + shard,
        name: `remote-test-blob-${record.number}-${shard}`,
        size_in_bytes: 18_000 + shard * 911,
        expired: false,
      });
    }
  }

  if (p.reportDone) {
    artifacts.push({
      id: record.id * 10 + 9,
      name: `remote-test-report-${record.flowId}-${record.number}`,
      size_in_bytes: 412_000,
      expired: false,
    });

    const results = Buffer.from(JSON.stringify(resultsJson(record)), "utf8");

    artifacts.push({
      id: record.id * 10,
      name: RESULTS_ARTIFACT,
      size_in_bytes: results.length,
      expired: false,
      zip: () => storedZip([{ name: "results.json", data: results }]),
    });
  }

  return artifacts;
}

function rawArtifact(artifact) {
  return {
    id: artifact.id,
    name: artifact.name,
    size_in_bytes: artifact.size_in_bytes,
    expired: artifact.expired,
  };
}

function findArtifact(artifactId) {
  const wanted = String(artifactId);

  for (const record of state.runs.values()) {
    const artifact = artifactRecords(record, nowMs()).find(
      (entry) => String(entry.id) === wanted,
    );

    if (artifact) return artifact;
  }

  return null;
}

// ---------------------------------------------------------------------------
// The API
// ---------------------------------------------------------------------------

function json(status, payload, headers = {}) {
  return new Response(payload === null ? null : JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });
}

function notFound() {
  return json(404, { message: "Not Found" });
}

function segmentsOf(pathname) {
  return pathname.split("/").filter(Boolean).map(decodeURIComponent);
}

function parseJsonBody(init) {
  if (!init || typeof init.body !== "string" || !init.body) return {};

  try {
    const parsed = JSON.parse(init.body);

    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function sortedRuns() {
  return [...state.runs.values()].sort((a, b) => b.createdAt - a.createdAt);
}

// Answers like fetch() would, for the URLs github.js builds. Anything it does
// not know is a 404 in GitHub's own words, which is also what the real API
// says to a path that does not exist.
async function stubFetch(url, init = {}) {
  seedIfWanted();

  const parsed = new URL(String(url));
  const method = (init.method || "GET").toUpperCase();
  const segments = segmentsOf(parsed.pathname);
  const now = nowMs();

  if (
    parsed.origin !== API_ROOT ||
    segments[0] !== "repos" ||
    segments.length < 3
  ) {
    return notFound();
  }

  const rest = segments.slice(3);

  // GET /repos/:o/:r/contents/<path>
  if (method === "GET" && rest[0] === "contents") {
    const repoPath = rest.slice(1).join("/");
    const cfg = config();
    let text = null;

    if (repoPath === cfg.catalogPath) text = catalogText();
    if (repoPath === cfg.pipelineConfigPath) text = pipelineConfigText();

    if (text === null) return notFound();

    return json(200, {
      name: repoPath.split("/").pop(),
      path: repoPath,
      encoding: "base64",
      content: Buffer.from(text, "utf8").toString("base64"),
    });
  }

  if (rest[0] !== "actions") return notFound();

  // POST /repos/:o/:r/actions/workflows/:wf/dispatches
  if (
    method === "POST" &&
    rest[1] === "workflows" &&
    rest[3] === "dispatches"
  ) {
    const body = parseJsonBody(init);
    const inputs =
      body.inputs && typeof body.inputs === "object" ? body.inputs : {};

    createRun({
      ...inputs,
      ref: typeof body.ref === "string" ? body.ref : undefined,
    });

    return new Response(null, { status: 204 });
  }

  // GET /repos/:o/:r/actions/workflows/:wf/runs
  if (method === "GET" && rest[1] === "workflows" && rest[3] === "runs") {
    const perPage = Math.min(
      Math.max(Number(parsed.searchParams.get("per_page")) || 30, 1),
      100,
    );
    const runs = sortedRuns()
      .slice(0, perPage)
      .map((record) => rawRun(record, now));

    return json(200, { total_count: state.runs.size, workflow_runs: runs });
  }

  if (rest[1] === "runs" && rest[2]) {
    const record = state.runs.get(rest[2]);

    if (!record) return notFound();

    if (method === "GET" && rest.length === 3) {
      return json(200, rawRun(record, now));
    }

    if (method === "GET" && rest[3] === "jobs") {
      const jobs = jobRecords(record, now).map((job) => rawJob(record, job));

      return json(200, { total_count: jobs.length, jobs });
    }

    if (method === "GET" && rest[3] === "artifacts") {
      const artifacts = artifactRecords(record, now).map(rawArtifact);

      return json(200, { total_count: artifacts.length, artifacts });
    }

    if (method === "POST" && rest[3] === "cancel") {
      const p = phases(record, now);

      if (p.finished) {
        return json(409, {
          message: "Cannot cancel a workflow run that is completed.",
        });
      }

      record.cancelledAt = now;

      return new Response(null, { status: 202 });
    }

    return notFound();
  }

  // GET /repos/:o/:r/actions/jobs/:id/logs
  if (method === "GET" && rest[1] === "jobs" && rest[3] === "logs") {
    const found = findJob(rest[2]);

    if (!found) return notFound();

    const text = jobLog(found.record, found.job, now);

    if (!text) return json(404, { message: "Not Found" });

    return new Response(text, {
      status: 200,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  // GET /repos/:o/:r/actions/artifacts/:id/zip
  if (method === "GET" && rest[1] === "artifacts" && rest[3] === "zip") {
    const artifact = findArtifact(rest[2]);

    if (!artifact) return notFound();

    if (!artifact.zip) {
      return json(410, {
        message: "Artifact has expired or is not downloadable here.",
      });
    }

    return new Response(artifact.zip(), {
      status: 200,
      headers: { "content-type": "application/zip" },
    });
  }

  return notFound();
}

module.exports = { fetch: stubFetch, RESULTS_ARTIFACT };
