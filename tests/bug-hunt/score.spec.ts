// The bug hunt's score (npm run bug-hunt), once every walk is done (the
// "score" project depends on "walk"). Only now is the planted-fault list read
// (GET /api/practice): the walks never saw it. The findings are merged,
// scored, and written to report.md and findings.json in the run's folder.

// Node's file and path tools.
import fs from "node:fs";
import path from "node:path";
// The [RESULT] block's test tools.
import {
  expect,
  expected,
  fact,
  test,
} from "../../framework/fixtures/resultBlock";
// Merging, route patterns, scoring and the report.
import {
  mergeFindings,
  routePattern,
} from "../../framework/helpers/bugHunt/findings";
import {
  renderReport,
  scoreFindings,
  type PlantedFault,
} from "../../framework/helpers/bugHunt/score";
import {
  appRoutes,
  runFolder,
  type WalkResult,
} from "../../framework/helpers/bugHunt/walk";

test("scores the hunt against the planted faults", async ({
  request,
  baseURL,
}) => {
  expected(
    "every walk's findings merged; only then the planted-fault list read; the score and report written",
  );
  const dir = runFolder();
  // Each walk's results.
  const walks: WalkResult[] = fs
    .readdirSync(dir)
    .filter((file) => /^walk-.*\.json$/.test(file))
    .map((file) => JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")));
  expect(walks.length).toBeGreaterThan(0);
  const findings = mergeFindings(walks.flatMap((walk) => walk.findings));

  // The planted-fault list, read for the first time now.
  const answer = await request.get("/api/practice");
  expect(answer.status()).toBe(200);
  const faults = (await answer.json()).bugs as PlantedFault[];

  // The score, the app's pages no walk opened, and the report beside the
  // walks' files.
  const score = scoreFindings(findings, faults);
  const reached = new Set(
    walks.flatMap((walk) => walk.pages.map((p) => routePattern(p))),
  );
  const notReached = appRoutes().filter((route) => !reached.has(route));
  const report = renderReport({
    when: new Date().toISOString().replace("T", " ").slice(0, 16) + " UTC",
    base: baseURL!,
    walks: walks.map((walk) => ({
      pass: walk.pass,
      pages: walk.pages.length,
      pressed: walk.pressed,
    })),
    findings,
    score,
    notReached,
  });
  const reportFile = path.join(dir, "report.md");
  fs.writeFileSync(reportFile, report);
  fs.writeFileSync(
    path.join(dir, "findings.json"),
    JSON.stringify(
      {
        planted: score.planted,
        found: score.found.map((m) => m.fault.flag),
        maybe: score.maybe.map((m) => m.fault.flag),
        fresh: score.fresh.map((f) => f.fingerprint),
        unmatched: score.unmatched.map((f) => f.fingerprint),
        findings,
      },
      null,
      2,
    ),
  );

  fact(
    "score",
    `found ${score.found.length} of ${score.planted} planted, ${score.maybe.length} maybe, ${score.fresh.length} new`,
  );
  fact(
    "found",
    score.found.map((m) => `${m.fault.flag}: ${m.fault.title}`),
  );
  fact(
    "maybe",
    score.maybe.map((m) => `${m.fault.flag}: ${m.fault.title}`),
  );
  fact(
    "new",
    score.fresh.map((f) => f.title),
  );
  fact("pages not reached", notReached);
  fact("report", reportFile);
  console.log(`\n[bug-hunt] Report: ${reportFile}\n`);

  // The list had the planted faults in it.
  expect(score.planted).toBeGreaterThan(0);
});
