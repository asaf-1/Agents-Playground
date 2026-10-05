#!/usr/bin/env node

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

const fs = require("node:fs");

const RISKS = ["Informational", "Low", "Medium", "High"];

const [reportPath, summaryPath] = process.argv.slice(2);
if (!reportPath || !summaryPath) {
  console.error(
    "usage: node scripts/zap-summary.js <report.json> <summary.md>",
  );
  process.exit(2);
}

const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
const alerts = (report.site || []).flatMap((site) => site.alerts || []);

const findings = alerts
  .map((a) => ({
    risk: Number(a.riskcode),
    id: a.pluginid,
    name: a.name || a.alert,
    urls: Number(a.count) || (a.instances || []).length,
  }))
  .sort((a, b) => b.risk - a.risk || a.name.localeCompare(b.name));

const counts = RISKS.map(
  (_, risk) => findings.filter((f) => f.risk === risk).length,
);
const countLine = [...RISKS]
  .reverse()
  .map((label) => `${label} ${counts[RISKS.indexOf(label)]}`)
  .join(" · ");

const version = process.env.ZAP_VERSION ? ` ${process.env.ZAP_VERSION}` : "";
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
fs.appendFileSync(summaryPath, lines.join("\n"));

const notable = counts[1] + counts[2] + counts[3];
if (notable > 0) {
  console.log(
    `::warning title=Security Scan::${countLine}. See the job summary.`,
  );
} else {
  console.log(`Security Scan: ${countLine}.`);
}
