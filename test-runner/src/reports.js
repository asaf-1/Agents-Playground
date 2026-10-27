// Reports and Triage: what the last two weeks of runs say about the suite.
//
// Everything is computed on request from two sources this app already reads:
// the run list (one GitHub call) and each finished run's results file (the
// same artifact the run page reads, cached once read - a finished run never
// changes). Nothing is stored. GitHub keeps a results file for 14 days, so 14
// days is the longest window, and a run whose file has expired still counts in
// the run totals but adds no test detail.
//
// The functions below `buildReport` are pure: runs and results in, numbers
// out. That is what the tests drive, and what keeps the GitHub half small.

const github = require("./github.js");
const { CATEGORIES, classify, categoryOf } = require("./triage.js");
const { similarProblems } = require("./knowledge.js");

const DAY_MS = 24 * 60 * 60 * 1000;
const WINDOWS = { "1d": 1, "7d": 7, "14d": 14 };
const DEFAULT_WINDOW = "14d";
const OUTCOMES = ["passed", "failed", "infra", "cancelled"];
// Results files read per report. Twenty finished runs is two weeks of casual
// use, and keeps a cold report to a few seconds of downloads.
const MAX_RESULT_RUNS = 20;
const RESULT_CONCURRENCY = 4;
const RUN_PAGE = 50;
const TOP_TESTS = 15;
const TOP_GROUPS = 12;
const SIMILAR_LIMIT = 3;
const CSV_MESSAGE_CHARS = 500;
const TITLE_REQUESTER_MARKER = " · requested by ";
const FLOW_ID_SHAPE = /^[a-z0-9][a-z0-9-]*$/;
const NAME_SHAPE = /^[A-Za-z0-9._-]{1,48}$/;

// ── filters ──────────────────────────────────────────────────────────────

function readFilters(params) {
  const get = (name) =>
    params && typeof params.get === "function"
      ? String(params.get(name) || "").trim()
      : "";
  const window = Object.hasOwn(WINDOWS, get("window"))
    ? get("window")
    : DEFAULT_WINDOW;
  const flow = FLOW_ID_SHAPE.test(get("flow")) ? get("flow") : "";
  const actor = NAME_SHAPE.test(get("actor")) ? get("actor") : "";
  const outcome = OUTCOMES.includes(get("outcome")) ? get("outcome") : "";

  return { window, flow, actor, outcome };
}

// The workflow's run-name is "<flow id> · requested by <user>", the one
// caller-written string GitHub hands back (see app.js, TITLE_REQUESTER_MARKER).
function parseRunTitle(title) {
  const text = typeof title === "string" ? title : "";
  const marker = text.indexOf(TITLE_REQUESTER_MARKER);
  const head = (marker > 0 ? text.slice(0, marker) : text)
    .split(" · ")[0]
    .trim();
  const tail =
    marker > 0 ? text.slice(marker + TITLE_REQUESTER_MARKER.length).trim() : "";

  return {
    flowId: FLOW_ID_SHAPE.test(head) ? head : "",
    requester: NAME_SHAPE.test(tail) ? tail : "",
  };
}

function runTime(run) {
  const parsed = Date.parse(run && run.createdAt);

  return Number.isFinite(parsed) ? parsed : 0;
}

function runSeconds(run) {
  const start = Date.parse(run && run.createdAt);
  const end = Date.parse(run && run.updatedAt);

  return Number.isFinite(start) && Number.isFinite(end) && end >= start
    ? Math.round((end - start) / 1000)
    : null;
}

// ── small helpers ────────────────────────────────────────────────────────

function percent(part, whole) {
  return whole > 0 ? Math.round((part / whole) * 100) : null;
}

function bump(map, key, by = 1) {
  map.set(key, (map.get(key) || 0) + by);
}

// The same error worded with different numbers, ids or quoted values is one
// problem: "Expected: 3 Received: 0" and "Expected: 5 Received: 0" group.
function signatureOf(message) {
  const first = String(message || "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !/^at\s/.test(line))
    .slice(0, 4)
    .join(" ");

  return (
    first
      .replace(/(["'`]).*?\1/g, "…")
      // Status codes stay - "Expected 403, received 200" and "expected 200,
      // received 500" are different problems - and every other number goes.
      .replace(/\d+/g, (digits) => (/^[1-5]\d\d$/.test(digits) ? digits : "N"))
      .replace(/\s+/g, " ")
      .slice(0, 160)
      .trim()
  );
}

function testKey(failure) {
  return `${failure.file || ""}::${failure.title || ""}`;
}

// ── the report itself ────────────────────────────────────────────────────

// `runs` are mapRun() shapes, newest or oldest first; `resultsById` maps a run
// id to its getRunResults() summary. `now` is passed in so tests can pin it.
function buildReport({ runs, resultsById, filters, now, error = "" }) {
  const days = WINDOWS[filters.window] || WINDOWS[DEFAULT_WINDOW];
  const since = now - days * DAY_MS;
  const previousSince = since - days * DAY_MS;
  const described = (Array.isArray(runs) ? runs : []).map((run) => ({
    run,
    at: runTime(run),
    ...parseRunTitle(run && run.displayTitle),
  }));

  // What the filter menus offer: everything in the window, before the
  // flow/person/outcome filters narrow it, so a choice never hides itself.
  const inWindow = described.filter((entry) => entry.at >= since);
  const options = {
    flows: [...new Set(inWindow.map((e) => e.flowId).filter(Boolean))].sort(),
    actors: [
      ...new Set(inWindow.map((e) => e.requester).filter(Boolean)),
    ].sort(),
  };

  const matches = (entry) =>
    (!filters.flow || entry.flowId === filters.flow) &&
    (!filters.actor || entry.requester === filters.actor) &&
    (!filters.outcome || entry.run.outcome === filters.outcome);

  const selected = inWindow.filter(matches).sort((a, b) => a.at - b.at);
  const previous = described.filter(
    (entry) => entry.at >= previousSince && entry.at < since && matches(entry),
  );

  const outcomeCounts = { passed: 0, failed: 0, infra: 0, cancelled: 0 };
  for (const { run } of selected) {
    if (Object.hasOwn(outcomeCounts, run.outcome)) {
      outcomeCounts[run.outcome] += 1;
    }
  }
  const rated = outcomeCounts.passed + outcomeCounts.failed;
  const previousRated = previous.filter((e) =>
    ["passed", "failed"].includes(e.run.outcome),
  );
  const previousPassed = previousRated.filter(
    (e) => e.run.outcome === "passed",
  ).length;

  const tests = { passed: 0, failed: 0, flaky: 0, skipped: 0 };
  const series = [];
  const byFlow = new Map();
  const byCategory = new Map(CATEGORIES.map((c) => [c.id, 0]));
  const failingTests = new Map();
  const flakyTests = new Map();
  const groups = new Map();
  const rows = [];
  let withResults = 0;
  let missingResults = 0;
  let durationTotal = 0;
  let durationCount = 0;

  for (const entry of selected) {
    const { run } = entry;
    const seconds = run.status === "completed" ? runSeconds(run) : null;

    if (seconds !== null && run.outcome !== "cancelled") {
      durationTotal += seconds;
      durationCount += 1;
    }

    const point = {
      runId: run.id,
      runNumber: run.runNumber,
      at: run.createdAt,
      flowId: entry.flowId,
      requester: entry.requester,
      outcome: run.outcome,
      seconds,
      passed: null,
      failed: null,
      flaky: null,
      skipped: null,
      passRate: null,
    };

    const results = resultsById.get(String(run.id));

    if (results && results.available) {
      withResults += 1;
      point.passed = results.passed;
      point.failed = results.failed;
      point.flaky = results.flaky;
      point.skipped = results.skipped;
      point.passRate = percent(
        results.passed,
        results.passed + results.failed + results.flaky,
      );

      tests.passed += results.passed;
      tests.failed += results.failed;
      tests.flaky += results.flaky;
      tests.skipped += results.skipped;

      const record = (failure, status) => {
        const category = classify(failure.message);
        const key = testKey(failure);
        const row = {
          runId: run.id,
          runNumber: run.runNumber,
          at: run.createdAt,
          flowId: entry.flowId,
          requester: entry.requester,
          title: failure.title || "untitled",
          file: failure.file || "",
          line: failure.line ?? null,
          status,
          category,
          message: failure.message || "",
        };

        rows.push(row);
        bump(byCategory, category);

        if (status === "failed") {
          bump(byFlow, entry.flowId || "unknown");

          const known = failingTests.get(key) || {
            title: row.title,
            file: row.file,
            line: row.line,
            runs: new Set(),
            lastAt: row.at,
            category,
            message: row.message,
          };
          known.runs.add(String(run.id));
          // Newest wins: the latest wording is the one worth reading.
          if (Date.parse(row.at) >= Date.parse(known.lastAt)) {
            known.lastAt = row.at;
            known.category = category;
            known.message = row.message;
            known.line = row.line;
          }
          failingTests.set(key, known);

          const signature = signatureOf(row.message) || "(no message)";
          const group = groups.get(signature) || {
            signature,
            category,
            count: 0,
            tests: new Set(),
            sample: row.message,
            file: row.file,
            title: row.title,
          };
          group.count += 1;
          group.tests.add(key);
          groups.set(signature, group);
        } else {
          const known = flakyTests.get(key) || {
            title: row.title,
            file: row.file,
            line: row.line,
            runs: new Set(),
            lastAt: row.at,
            message: row.message,
          };
          known.runs.add(String(run.id));
          if (Date.parse(row.at) >= Date.parse(known.lastAt)) {
            known.lastAt = row.at;
            if (row.message) known.message = row.message;
          }
          flakyTests.set(key, known);
        }
      };

      for (const failure of results.failures || []) record(failure, "failed");
      for (const failure of results.flakyTests || []) record(failure, "flaky");
    } else if (run.outcome === "passed" || run.outcome === "failed") {
      missingResults += 1;
    }

    series.push(point);
  }

  const similar = (item, category) =>
    similarProblems(item, {
      limit: SIMILAR_LIMIT,
      // The failure's own category is already on the row; repeating it as a
      // "similar problem" would be the page agreeing with itself.
      exclude: [`category:${category}`],
    });

  const mostFailing = [...failingTests.values()]
    .sort(
      (a, b) =>
        b.runs.size - a.runs.size ||
        Date.parse(b.lastAt) - Date.parse(a.lastAt) ||
        a.title.localeCompare(b.title),
    )
    .slice(0, TOP_TESTS)
    .map((item) => {
      const category = categoryOf(item.category);

      return {
        title: item.title,
        file: item.file,
        line: item.line,
        runsFailed: item.runs.size,
        lastAt: item.lastAt,
        category: category.id,
        categoryLabel: category.label,
        message: item.message,
        similar: similar(item, category.id),
      };
    });

  const flaky = [...flakyTests.values()]
    .sort(
      (a, b) =>
        b.runs.size - a.runs.size ||
        Date.parse(b.lastAt) - Date.parse(a.lastAt) ||
        a.title.localeCompare(b.title),
    )
    .slice(0, TOP_TESTS)
    .map((item) => ({
      title: item.title,
      file: item.file,
      line: item.line,
      runsFlaky: item.runs.size,
      lastAt: item.lastAt,
      message: item.message,
    }));

  const grouped = [...groups.values()]
    .sort((a, b) => b.count - a.count || a.signature.localeCompare(b.signature))
    .slice(0, TOP_GROUPS)
    .map((group) => ({
      signature: group.signature,
      category: group.category,
      categoryLabel: categoryOf(group.category).label,
      count: group.count,
      tests: group.tests.size,
      sample: group.sample,
      example: { title: group.title, file: group.file },
    }));

  const categories = CATEGORIES.map((category) => ({
    id: category.id,
    label: category.label,
    tone: category.tone,
    meaning: category.meaning,
    fix: category.fix,
    count: byCategory.get(category.id) || 0,
  })).filter((category) => category.count > 0);

  const testTotal = tests.passed + tests.failed + tests.flaky;
  const passRate = percent(outcomeCounts.passed, rated);
  const previousRate = percent(previousPassed, previousRated.length);

  return {
    generatedAt: new Date(now).toISOString(),
    filters,
    window: { days, since: new Date(since).toISOString() },
    options,
    error,
    limits: { resultRuns: MAX_RESULT_RUNS, retentionDays: 14 },
    summary: {
      runs: selected.length,
      outcomes: outcomeCounts,
      rated,
      passRate,
      previousPassRate: previousRate,
      change:
        passRate !== null && previousRate !== null
          ? passRate - previousRate
          : null,
      tests,
      testPassRate: percent(tests.passed, testTotal),
      averageSeconds: durationCount
        ? Math.round(durationTotal / durationCount)
        : null,
      withResults,
      missingResults,
    },
    series,
    failuresByFlow: [...byFlow.entries()]
      .map(([flowId, count]) => ({ flowId, count }))
      .sort((a, b) => b.count - a.count || a.flowId.localeCompare(b.flowId)),
    categories,
    mostFailing,
    flaky,
    groups: grouped,
    rows: rows.sort(
      (a, b) =>
        Date.parse(b.at) - Date.parse(a.at) || a.title.localeCompare(b.title),
    ),
  };
}

// ── the GitHub half ──────────────────────────────────────────────────────

async function mapLimit(items, limit, worker) {
  const out = new Array(items.length);
  let next = 0;

  async function lane() {
    while (next < items.length) {
      const index = next;
      next += 1;
      out[index] = await worker(items[index]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, lane),
  );

  return out;
}

// The run list calls every failed run "failed" provisionally: only the run's
// jobs say whether the tests failed or the pipeline broke around them, and the
// run page reads them for exactly that (refineFailureOutcome in github.js).
// The report has to ask too, or a broken checkout would count as a test
// failure. A finished run never changes, so each answer is kept.
const refined = new Map();
const MAX_REFINED = 200;

async function refineFailures(runs, since) {
  const pending = runs.filter(
    (run) =>
      run.status === "completed" &&
      run.outcome === "failed" &&
      run.outcomePrecise === false &&
      runTime(run) >= since &&
      !refined.has(String(run.id)),
  );

  await mapLimit(pending, RESULT_CONCURRENCY, async (run) => {
    try {
      const detail = await github.getRun(run.id);

      if (detail && detail.run && detail.run.outcomePrecise) {
        if (refined.size >= MAX_REFINED) {
          refined.delete(refined.keys().next().value);
        }
        refined.set(String(run.id), {
          outcome: detail.run.outcome,
          outcomeNote: detail.run.outcomeNote,
          outcomePrecise: true,
        });
      }
    } catch {
      // Left provisional: counted as a failure, which is what the run list
      // already says, rather than dropped.
    }
  });

  return runs.map((run) =>
    refined.has(String(run.id))
      ? { ...run, ...refined.get(String(run.id)) }
      : run,
  );
}

async function getReport(params, { now = Date.now() } = {}) {
  const filters = readFilters(params);
  let runs = [];
  let error = "";

  try {
    ({ runs } = await github.listRuns(RUN_PAGE));
  } catch (cause) {
    // Like the dashboard: a report that says why it is empty beats a 502.
    error = (cause && cause.message) || "The run list could not be read.";
  }

  const days = WINDOWS[filters.window];
  const since = now - days * DAY_MS;

  runs = await refineFailures(runs, since - days * DAY_MS);

  const wanted = runs
    .filter(
      (run) =>
        run.status === "completed" &&
        (run.outcome === "passed" || run.outcome === "failed") &&
        runTime(run) >= since,
    )
    .filter((run) => {
      const { flowId, requester } = parseRunTitle(run.displayTitle);

      return (
        (!filters.flow || flowId === filters.flow) &&
        (!filters.actor || requester === filters.actor) &&
        (!filters.outcome || run.outcome === filters.outcome)
      );
    })
    .sort((a, b) => runTime(b) - runTime(a))
    .slice(0, MAX_RESULT_RUNS);

  const resultsById = new Map();
  const loaded = await mapLimit(wanted, RESULT_CONCURRENCY, async (run) => {
    try {
      return [String(run.id), await github.getRunResults(run.id)];
    } catch {
      // One unreadable run must not sink the report; it simply has no detail.
      return [String(run.id), null];
    }
  });

  for (const [id, results] of loaded) {
    if (results) resultsById.set(id, results);
  }

  return buildReport({ runs, resultsById, filters, now, error });
}

// ── downloads ────────────────────────────────────────────────────────────

// RFC 4180 quoting, plus the spreadsheet-formula guard: a cell that starts
// with = + - @ is a formula to Excel, and a test title is not ours to trust.
function csvCell(value) {
  let text = value === null || value === undefined ? "" : String(value);

  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;

  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(report) {
  const header = [
    "run",
    "date",
    "flow",
    "started_by",
    "test",
    "file",
    "line",
    "status",
    "category",
    "message",
  ];
  const lines = [header.join(",")];

  for (const row of report.rows) {
    lines.push(
      [
        row.runNumber ?? row.runId,
        row.at,
        row.flowId,
        row.requester,
        row.title,
        row.file,
        row.line,
        row.status,
        row.category,
        row.message.replace(/\s+/g, " ").slice(0, CSV_MESSAGE_CHARS),
      ]
        .map(csvCell)
        .join(","),
    );
  }

  // A BOM so Excel on Windows reads the file as UTF-8, not as the local
  // code page, which would mangle the "›" in every test title.
  return `﻿${lines.join("\r\n")}\r\n`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const DOWNLOAD_COLOURS = {
  passed: "#059669",
  failed: "#dc2626",
  flaky: "#b45309",
  skipped: "#94a3b8",
};

// A donut drawn with stroke-dasharray: one circle per slice, each offset by
// the slices before it. No script, so it survives being saved and printed.
function donutSvg(slices, centre, caption) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  const rings = total
    ? slices
        .filter((slice) => slice.value > 0)
        .map((slice) => {
          const length = (slice.value / total) * circumference;
          const ring = `<circle cx="70" cy="70" r="${radius}" fill="none" stroke="${slice.colour}" stroke-width="20" stroke-dasharray="${length.toFixed(2)} ${(circumference - length).toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}" transform="rotate(-90 70 70)"><title>${escapeHtml(slice.label)}: ${slice.value}</title></circle>`;
          offset += length;
          return ring;
        })
        .join("")
    : `<circle cx="70" cy="70" r="${radius}" fill="none" stroke="#e2e6ef" stroke-width="20"/>`;

  return `<svg viewBox="0 0 140 140" width="160" height="160" role="img" aria-label="${escapeHtml(caption)}">${rings}<text x="70" y="68" text-anchor="middle" font-size="22" font-weight="700" fill="#111827">${escapeHtml(centre)}</text><text x="70" y="88" text-anchor="middle" font-size="10" fill="#5b6782">${escapeHtml(caption)}</text></svg>`;
}

function shortDate(iso) {
  const parsed = Date.parse(iso);

  return Number.isFinite(parsed)
    ? new Date(parsed).toISOString().replace("T", " ").slice(0, 16) + " UTC"
    : "";
}

function toHtml(report) {
  const s = report.summary;
  const filterWords = [
    `last ${report.window.days} day${report.window.days === 1 ? "" : "s"}`,
    report.filters.flow && `flow ${report.filters.flow}`,
    report.filters.actor && `started by ${report.filters.actor}`,
    report.filters.outcome && `${report.filters.outcome} runs`,
  ]
    .filter(Boolean)
    .join(" · ");
  const donut = donutSvg(
    ["passed", "failed", "flaky", "skipped"].map((key) => ({
      label: key,
      value: s.tests[key],
      colour: DOWNLOAD_COLOURS[key],
    })),
    s.testPassRate === null ? "—" : `${s.testPassRate}%`,
    "tests passed",
  );
  const legend = ["passed", "failed", "flaky", "skipped"]
    .map(
      (key) =>
        `<li><span class="swatch" style="background:${DOWNLOAD_COLOURS[key]}"></span>${escapeHtml(key)} <b>${s.tests[key]}</b></li>`,
    )
    .join("");

  const byCategory = new Map();
  for (const row of report.rows) {
    if (!byCategory.has(row.category)) byCategory.set(row.category, []);
    byCategory.get(row.category).push(row);
  }
  const testsByKey = new Map(
    report.mostFailing.map((item) => [`${item.file}::${item.title}`, item]),
  );

  const sections = report.categories
    .map((category) => {
      const items = new Map();

      for (const row of byCategory.get(category.id) || []) {
        const key = `${row.file}::${row.title}`;
        const item = items.get(key) || {
          title: row.title,
          file: row.file,
          line: row.line,
          failed: 0,
          flaky: 0,
          runs: new Set(),
          message: row.message,
          lastAt: row.at,
        };

        if (row.status === "failed") item.failed += 1;
        else item.flaky += 1;
        item.runs.add(row.runNumber ?? row.runId);
        if (Date.parse(row.at) >= Date.parse(item.lastAt)) {
          item.lastAt = row.at;
          if (row.message) item.message = row.message;
        }
        items.set(key, item);
      }

      const list = [...items.entries()]
        .sort((a, b) => b[1].failed + b[1].flaky - (a[1].failed + a[1].flaky))
        .map(([key, item]) => {
          const similar = (testsByKey.get(key) || {}).similar || [];
          const known = similar.length
            ? `<div class="known"><b>Similar known problems</b><ol>${similar
                .map(
                  (hit) =>
                    `<li><b>${escapeHtml(hit.title)}</b> <span class="score">score ${hit.score}</span><br>${escapeHtml(hit.meaning)}</li>`,
                )
                .join("")}</ol></div>`
            : "";

          return `<li class="test"><p class="title">${escapeHtml(item.title)}</p><p class="where">${escapeHtml(item.file)}${item.line ? `:${item.line}` : ""} · ${item.failed ? `failed ${item.failed}×` : ""}${item.failed && item.flaky ? ", " : ""}${item.flaky ? `flaky ${item.flaky}×` : ""} · runs ${escapeHtml([...item.runs].join(", "))} · last ${escapeHtml(shortDate(item.lastAt))}</p>${item.message ? `<pre>${escapeHtml(item.message)}</pre>` : ""}${known}</li>`;
        })
        .join("");

      return `<section class="category"><h2>${escapeHtml(category.label)} <span class="count">${category.count}</span></h2><p class="id">${escapeHtml(category.id)}</p><p><b>What it usually means:</b> ${escapeHtml(category.meaning)}</p><p><b>Where to look:</b> ${escapeHtml(category.fix)}</p><ul class="tests">${list}</ul></section>`;
    })
    .join("");

  const empty = report.rows.length
    ? ""
    : `<p class="empty">No failed or flaky tests in this window. Nothing to triage.</p>`;
  const missing = s.missingResults
    ? `<p class="note">${s.missingResults} finished run${s.missingResults === 1 ? " has" : "s have"} no results file (expired or never written) and add${s.missingResults === 1 ? "s" : ""} no test detail.</p>`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Test triage report — ${escapeHtml(shortDate(report.generatedAt))}</title>
<style>
  :root { color-scheme: light; }
  body { margin: 0; background: #f4f6fb; color: #111827; font: 15px/1.5 "Segoe UI", system-ui, -apple-system, Roboto, sans-serif; }
  main { max-width: 960px; margin: 0 auto; padding: 32px 16px 64px; }
  h1 { font-size: 26px; margin: 0 0 4px; }
  .lede { color: #3f4a63; margin: 0 0 24px; }
  .summary { display: flex; flex-wrap: wrap; gap: 24px; align-items: center; background: #fff; border: 1px solid #e2e6ef; border-radius: 14px; padding: 20px; }
  .summary ul { list-style: none; margin: 0; padding: 0; }
  .summary li { margin: 4px 0; }
  .swatch { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 8px; }
  .figures { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; flex: 1; min-width: 260px; }
  .figure { background: #f3f5fa; border-radius: 10px; padding: 10px 12px; }
  .figure b { display: block; font-size: 22px; }
  .figure span { color: #5b6782; font-size: 13px; }
  .category { background: #fff; border: 1px solid #e2e6ef; border-radius: 14px; padding: 20px; margin-top: 20px; break-inside: avoid-page; }
  .category h2 { margin: 0; font-size: 19px; }
  .count { background: #fee2e2; color: #b91c1c; border-radius: 999px; padding: 1px 10px; font-size: 14px; }
  .id { font-family: Consolas, ui-monospace, monospace; color: #5b6782; font-size: 12px; margin: 2px 0 10px; }
  .tests { list-style: none; margin: 12px 0 0; padding: 0; }
  .test { border-top: 1px solid #e2e6ef; padding: 12px 0; }
  .title { font-weight: 600; margin: 0; }
  .where { color: #5b6782; font-size: 13px; margin: 2px 0 6px; font-family: Consolas, ui-monospace, monospace; }
  pre { white-space: pre-wrap; word-break: break-word; background: #f7f9fc; border: 1px solid #e2e6ef; border-radius: 8px; padding: 8px 10px; font-size: 12.5px; margin: 6px 0; }
  .known { background: #f5f3ff; border-radius: 8px; padding: 8px 12px; font-size: 13.5px; }
  .known ol { margin: 6px 0 0; padding-left: 20px; }
  .known li { margin: 4px 0; }
  .score { color: #5b6782; font-size: 12px; }
  .note, .empty { color: #3f4a63; }
  footer { color: #5b6782; font-size: 12px; margin-top: 32px; }
  @media print { body { background: #fff; } .summary, .category { border-color: #ccc; } }
</style>
</head>
<body>
<main>
<h1>Test triage report</h1>
<p class="lede">${escapeHtml(filterWords)} · made ${escapeHtml(shortDate(report.generatedAt))}</p>
<section class="summary">
${donut}
<ul>${legend}</ul>
<div class="figures">
<div class="figure"><b>${s.runs}</b><span>runs</span></div>
<div class="figure"><b>${s.passRate === null ? "—" : `${s.passRate}%`}</b><span>runs passed (of ${s.rated} with a verdict)</span></div>
<div class="figure"><b>${s.tests.failed}</b><span>failed tests</span></div>
<div class="figure"><b>${s.tests.flaky}</b><span>flaky tests</span></div>
</div>
</section>
${missing}
${empty}
${sections}
<footer>Categories use the names of FailureClassifier (framework/agents/diagnosis). "Similar known problems" are found by BM25 keyword search over the planted-bug notes and the category notes; no AI model wrote any of this report.</footer>
</main>
</body>
</html>
`;
}

function downloadName(report, extension) {
  return `test-triage-${report.generatedAt.slice(0, 10)}.${extension}`;
}

module.exports = {
  WINDOWS,
  MAX_RESULT_RUNS,
  readFilters,
  parseRunTitle,
  signatureOf,
  buildReport,
  getReport,
  toCsv,
  toHtml,
  csvCell,
  downloadName,
};
