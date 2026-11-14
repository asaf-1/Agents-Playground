// Scores a /bug-hunt run, Claude's findings, exactly the way the walk with no
// AI is scored (framework/helpers/bugHunt/score.ts):
//
//   npm run bug-hunt:score -- .artifacts/bug-hunt/claude-<time>
//
// The folder holds findings.json, written by the skill:
//   { "walks": [{ "pass", "pages", "pressed", "requests" }], "findings": [ ... ] }
// ("requests", the API calls sent by hand, is optional; the report shows it
// when a walk has it.)
// Every finding is checked against the honesty rules first, and the file is
// refused if any breaks them (an unknown label, "high" without being seen
// again). Only then is the planted-fault list read (GET /api/practice), from
// the local site only. The report goes to report.md beside it.

// Teach require() to load the TypeScript helpers, as the bug-report script does.
require("../bug-reporting/register-ts-runtime");

// Node's file and path tools, and the hunt's own checks, merge, score and report.
const fs = require("node:fs");
const path = require("node:path");
const {
  checkFinding,
  mergeFindings,
} = require("../../framework/helpers/bugHunt/findings.ts");
const {
  renderReport,
  scoreFindings,
} = require("../../framework/helpers/bugHunt/score.ts");

// The local site; BUG_HUNT_BASE_URL may name another local port, never a
// remote site.
const BASE = (process.env.BUG_HUNT_BASE_URL || "http://127.0.0.1:4173").replace(
  /\/+$/,
  "",
);

// Stops with a message and a failing exit code.
function fail(message) {
  console.error(`[bug-hunt] ${message}`);
  process.exit(1);
}

async function main() {
  // The run's folder and its findings file.
  const dir = process.argv[2];
  if (!dir) fail("Usage: npm run bug-hunt:score -- <run folder>");
  const file = path.join(dir, "findings.json");
  if (!fs.existsSync(file)) fail(`No findings.json in ${dir}`);
  // A byte-order mark at the start is dropped: Windows PowerShell writes one
  // into UTF-8 files, and JSON.parse refuses it.
  const data = JSON.parse(fs.readFileSync(file, "utf8").replace(/^﻿/, ""));
  const findings = Array.isArray(data.findings) ? data.findings : [];
  const walks = Array.isArray(data.walks) ? data.walks : [];

  // The honesty rules first: a file that breaks them is not scored.
  const problems = findings.flatMap((finding) => checkFinding(finding));
  if (problems.length > 0) {
    fail(
      `findings.json breaks the honesty rules:\n  - ${problems.join("\n  - ")}`,
    );
  }

  // The local site only.
  if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(BASE)) {
    fail(
      `${BASE} is not the local site; the hunt never scores against a remote one`,
    );
  }

  // The planted-fault list, read for the first time now.
  const answer = await fetch(`${BASE}/api/practice`).catch(() => null);
  if (!answer || !answer.ok)
    fail(`The local site did not answer ${BASE}/api/practice`);
  const faults = (await answer.json()).bugs;

  // The score and the report, in the walk's own shape.
  const merged = mergeFindings(findings);
  const score = scoreFindings(merged, faults);
  const report = renderReport({
    when: `${new Date().toISOString().replace("T", " ").slice(0, 16)} UTC`,
    base: BASE,
    walks,
    findings: merged,
    score,
    by: "Hunted by Claude through the `/bug-hunt` skill: exploring like a tester, capped, black box.",
  });
  fs.writeFileSync(path.join(dir, "report.md"), report);
  fs.writeFileSync(
    path.join(dir, "score.json"),
    `${JSON.stringify(
      {
        planted: score.planted,
        found: score.found.map((m) => m.fault.flag),
        maybe: score.maybe.map((m) => m.fault.flag),
        fresh: score.fresh.map((f) => f.fingerprint),
        unmatched: score.unmatched.map((f) => f.fingerprint),
      },
      null,
      2,
    )}\n`,
  );

  console.log(
    `[bug-hunt] Score: found ${score.found.length} of ${score.planted} planted, ${score.maybe.length} maybe, ${score.fresh.length} new`,
  );
  for (const match of score.found) {
    console.log(`  found  ${match.fault.flag}: ${match.fault.title}`);
  }
  for (const match of score.maybe) {
    console.log(`  maybe  ${match.fault.flag}: ${match.fault.title}`);
  }
  console.log(`[bug-hunt] Report: ${path.resolve(dir, "report.md")}`);
}

main();
