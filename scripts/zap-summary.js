#!/usr/bin/env node

// Strict mode for the whole file.
"use strict";

// Turns a ZAP JSON report into the Security Scan job summary.
//
//   node scripts/zap-summary.js <report.json> <summary.md>
//
// Appends a short Markdown list to <summary.md> (the workflow passes
// $GITHUB_STEP_SUMMARY): one line per finding, highest risk first, with how
// many URLs it was seen on. Prints one ::warning line with the counts, so the
// result shows on the PR's checks without opening the run. Report only: it
// never exits non-zero because of findings.

// Node's file tools.
const fs = require("node:fs");

// ZAP's risk levels, in the order of their numbers (0 to 3).
const RISKS = ["Informational", "Low", "Medium", "High"];

// The report to read and the summary file to add to, from the command line.
const [reportPath, summaryPath] = process.argv.slice(2);
// Without both, show how to run it and stop.
if (!reportPath || !summaryPath) {
  console.error(
    "usage: node scripts/zap-summary.js <report.json> <summary.md>",
  );
  process.exit(2);
}

// Read ZAP's report.
const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
// Every alert, from every site in the report.
const alerts = (report.site || []).flatMap((site) => site.alerts || []);

// One finding per alert, highest risk first, then by name.
const findings = alerts
  .map((a) => ({
    risk: Number(a.riskcode),
    id: a.pluginid,
    name: a.name || a.alert,
    urls: Number(a.count) || (a.instances || []).length,
  }))
  .sort((a, b) => b.risk - a.risk || a.name.localeCompare(b.name));

// How many findings there are at each risk level.
const counts = RISKS.map(
  (_, risk) => findings.filter((f) => f.risk === risk).length,
);
// The counts as one line, highest risk first: "High 0 · Medium 0 · ...".
const countLine = [...RISKS]
  .reverse()
  .map((label) => `${label} ${counts[RISKS.indexOf(label)]}`)
  .join(" · ");

// The ZAP version for the heading, when the workflow passes it.
const version = process.env.ZAP_VERSION ? ` ${process.env.ZAP_VERSION}` : "";
// The summary: heading, counts, a line per finding, and where the full report
// is.
const lines = [
  `## Security Scan (ZAP${version})`,
  "",
  "Passive baseline scan of the website. Report only: findings never fail the job.",
  "",
  `**${countLine}**`,
  "",
  ...(findings.length
    ? findings.map(
        (f) =>
          `- **${RISKS[f.risk]}** \`${f.id}\` ${f.name} (${f.urls} URL${f.urls === 1 ? "" : "s"})`,
      )
    : ["No findings."]),
  "",
  "Full report: the `security-scan-<sha>` artifact (`report.html`).",
  "",
];
// Add it to the job summary.
fs.appendFileSync(summaryPath, lines.join("\n"));

// Low, Medium and High findings: the ones worth a warning.
const notable = counts[1] + counts[2] + counts[3];
// Any of those: one warning line on the PR's checks; otherwise a plain line.
if (notable > 0) {
  console.log(
    `::warning title=Security Scan::${countLine}. See the job summary.`,
  );
} else {
  console.log(`Security Scan: ${countLine}.`);
}
