// The bug hunt's score, worked out only at the end: the findings against the
// planted-fault list (GET /api/practice). A finding that also happened with
// practice mode off is new (the faults were off). One seen only with practice
// mode on is matched to a fault: by its endpoint (found), or by its page only
// (maybe, never found). Then the report, in Markdown.

// The finding and walk types, the honesty rules, and the route patterns.
import { HONESTY, routePattern, type Finding, type Pass } from "./findings";

// One planted fault, as /api/practice lists it.
export type PlantedFault = {
  flag: string;
  title: string;
  where: string;
  kind?: string;
};

// A fault the hunt matched, and how.
export type Match = {
  fault: PlantedFault;
  how: "found" | "maybe";
  findings: Finding[];
};

// The score and the findings sorted for the report.
export type Score = {
  planted: number;
  found: Match[];
  maybe: Match[];
  // Seen with practice mode off too: real, not planted.
  fresh: Finding[];
  // Seen only with practice mode on, matching no fault's page or endpoint.
  unmatched: Finding[];
};

// The walks that run with every planted fault off.
const FAULTS_OFF: Pass[] = [
  "customer, practice off",
  "admin, looking only",
  "support, looking only",
  "signed out",
];

// The app and API paths a fault's "where" names, as patterns:
// "/app/bank/accounts/{id} — the history filter" gives
// /app/bank/accounts/:id; "POST /api/bank/transfers" gives /api/bank/transfers.
export function pathsIn(where: string): string[] {
  const found = String(where).match(/\/(?:app|api)[\w/{}:.-]*/g) ?? [];
  return found.map((p) =>
    routePattern(p.replace(/\{[^}]+\}/g, "0").replace(/[.:]+$/, "")),
  );
}

// The score: each finding classed as new, found, maybe or unmatched.
export function scoreFindings(
  findings: Finding[],
  faults: PlantedFault[],
): Score {
  const found = new Map<string, Match>();
  const maybe = new Map<string, Match>();
  const fresh: Finding[] = [];
  const unmatched: Finding[] = [];

  // Only real signals take part: an inconclusive or env finding is reported
  // but never counted (noise is worse than silence).
  for (const finding of findings) {
    if (finding.classification !== "bug") continue;
    if (finding.passes.some((pass) => FAULTS_OFF.includes(pass))) {
      fresh.push(finding);
      continue;
    }
    // Practice mode on only: the endpoint first, then the pages.
    const endpointPath = finding.endpoint?.split(" ")[1];
    const pagePatterns = finding.pages.map(routePattern);
    const byEndpoint = faults.filter(
      (fault) => endpointPath && pathsIn(fault.where).includes(endpointPath),
    );
    const byPage = faults.filter((fault) =>
      pathsIn(fault.where).some((p) => pagePatterns.includes(p)),
    );
    if (byEndpoint.length > 0) {
      for (const fault of byEndpoint) add(found, fault, "found", finding);
    } else if (byPage.length > 0) {
      for (const fault of byPage) add(maybe, fault, "maybe", finding);
    } else {
      unmatched.push(finding);
    }
  }
  // A fault found by one finding is not also a maybe.
  for (const flag of found.keys()) maybe.delete(flag);
  return {
    planted: faults.length,
    found: [...found.values()],
    maybe: [...maybe.values()],
    fresh,
    unmatched,
  };
}

// Adds a finding to a fault's match.
function add(
  into: Map<string, Match>,
  fault: PlantedFault,
  how: Match["how"],
  finding: Finding,
): void {
  const match = into.get(fault.flag) ?? { fault, how, findings: [] };
  if (!match.findings.includes(finding)) match.findings.push(finding);
  into.set(fault.flag, match);
}

// The walks' totals, for the report's first lines.
export type WalkSummary = { pass: Pass; pages: number; pressed: number };

// The report: the score first, then each group of findings shaped like the
// candidate template, then the hand-off and the rules it followed.
export function renderReport(input: {
  when: string;
  base: string;
  walks: WalkSummary[];
  findings: Finding[];
  score: Score;
  // The app's pages no walk opened: a gap in what the hunt looked at.
  notReached?: string[];
}): string {
  const { score } = input;
  const counted = input.findings.filter((f) => f.classification === "bug");
  const notCounted = input.findings.filter((f) => f.classification !== "bug");
  const lines: string[] = [
    `# Bug hunt — ${input.when}`,
    "",
    `Target: ${input.base}/app (local). Walked with no AI by \`npm run bug-hunt\`.`,
    "",
    `**Score: found ${score.found.length} of ${score.planted} planted faults, ${score.maybe.length} maybe, ${score.fresh.length} new.**`,
    "",
    "| Walk | Pages opened | Buttons pressed |",
    "| --- | --- | --- |",
    ...input.walks.map((w) => `| ${w.pass} | ${w.pages} | ${w.pressed} |`),
    "",
    `Findings: ${input.findings.length} (${counted.length} bugs counted, ${notCounted.length} not counted: inconclusive or environment).`,
    "",
    ...(input.notReached && input.notReached.length
      ? [
          `Pages no walk reached (${input.notReached.length}), so not looked at: ${input.notReached.map((p) => `\`${p}\``).join(", ")}. A page with an id needs a link to one, and a fresh account may have none (no ticket, no order).`,
          "",
        ]
      : []),
    "## Planted faults found",
    "",
    ...(score.found.length
      ? score.found.flatMap(matchBlock)
      : [
          "None. The walk finds crashes and errors; most planted faults are logic bugs it cannot see.",
          "",
        ]),
    "## Maybe (matched by page only, never counted as found)",
    "",
    ...(score.maybe.length ? score.maybe.flatMap(matchBlock) : ["None.", ""]),
    "## New (also happen with practice mode off)",
    "",
    ...(score.fresh.length ? score.fresh.flatMap(findingBlock) : ["None.", ""]),
    "## Only with practice mode on, matching no planted fault",
    "",
    ...(score.unmatched.length
      ? score.unmatched.flatMap(findingBlock)
      : ["None.", ""]),
    "## Not counted (inconclusive or environment)",
    "",
    ...(notCounted.length
      ? notCounted.map(
          (f) =>
            `- \`${f.classification}\`, ${f.confidence}: ${f.title} (${f.fingerprint})`,
        )
      : ["None."]),
    "",
    "## Hand-off",
    "",
    ...handOff(score.fresh),
    "",
    "## Rules this hunt followed",
    "",
    ...HONESTY.rules.map((rule) => `- ${rule}`),
    "",
  ];
  return lines.join("\n");
}

// A matched fault and the findings that matched it.
function matchBlock(match: Match): string[] {
  return [
    `### ${match.fault.title} (\`${match.fault.flag}\`)`,
    "",
    `Lives at: ${match.fault.where}. Matched ${match.how === "found" ? "by endpoint" : "by page only"}.`,
    "",
    ...match.findings.flatMap(findingBlock),
  ];
}

// One finding, in the shape of Debbie's candidate template: the labels, how to
// repeat it, what was expected and what happened, and the evidence.
function findingBlock(f: Finding): string[] {
  const role = f.passes[0];
  return [
    `#### ${f.title}`,
    "",
    "```yaml",
    `fingerprint: ${f.fingerprint}`,
    `classification: ${f.classification}`,
    `confidence: ${f.confidence}`,
    `severity: ${f.severity}`,
    `area: ${f.area}`,
    `target: ${f.target}`,
    `walks: ${f.passes.join("; ")}`,
    "```",
    "",
    "Repeat:",
    "",
    `1. As the ${role.split(",")[0]}${role.includes("practice on") ? ", with practice mode on" : ""}, open ${f.page}.`,
    ...(f.action !== "open the page" ? [`2. Then ${f.action}.`] : []),
    "",
    `Expected: ${expectedFor(f)}`,
    "",
    `Actual: ${actualFor(f)}`,
    "",
    "Evidence:",
    "",
    ...(f.requestId
      ? [
          `- Request id: \`${f.requestId}\` (the bank's audit log and its trace carry the same id)`,
        ]
      : []),
    ...(f.message ? [`- Message: \`${f.message}\``] : []),
    `- Seen again when repeated: ${f.reproduced ? "yes" : "no"}`,
    `- Pages: ${f.pages.slice(0, 5).join(", ")}${f.pages.length > 5 ? `, and ${f.pages.length - 5} more` : ""}`,
    ...(f.screenshot
      ? [`- Screenshot: [${f.screenshot}](${f.screenshot})`]
      : []),
    "",
  ];
}

// What should have happened, by kind of finding.
function expectedFor(f: Finding): string {
  switch (f.kind) {
    case "server-error":
      return "an answer below 500 (a 4xx is fine when the input is wrong).";
    case "dead-link":
      return "every link inside the app leads to a page the app has.";
    case "blank-page":
      return "the page shows its content.";
    default:
      return "no error in the page or its console.";
  }
}

// What did happen.
function actualFor(f: Finding): string {
  if (f.kind === "server-error") return `${f.endpoint} answered ${f.status}.`;
  if (f.kind === "slow") return `${f.endpoint} took ${f.ms} ms.`;
  return f.title + ".";
}

// The hand-off to /bug-report: each new, high-confidence bug, with the command
// to file it once a person adds what the page should show.
function handOff(fresh: Finding[]): string[] {
  const ready = fresh.filter((f) => f.confidence === "high");
  if (ready.length === 0)
    return ["Nothing new and high-confidence to hand to /bug-report."];
  return [
    "Each new, high-confidence bug below goes to `/bug-report` (local records only). Add what the page should show with `--expect-text`, `--expect-testid` or `--expect-role` and `--expect-name`:",
    "",
    ...ready.map(
      (f) =>
        `- ${f.title}: \`/bug-report --manual-url ${f.page} --name "${f.title.replace(/"/g, "'")}" --notes "${f.fingerprint}"\``,
    ),
  ];
}
