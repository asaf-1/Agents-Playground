// The bug hunt's score, worked out only at the end: the findings against the
// planted-fault list (GET /api/practice). A finding that also happened with
// practice mode off is new (the faults were off). One seen only with practice
// mode on is matched to one fault at most, by two things:
//   - where it happened: its endpoint or a page is a path the fault's "where"
//     names ("same"), or shares a part with one ("area": the page
//     /app/bank/transfer and the API /api/bank/transfers);
//   - what it says: the words its title and what happened share with the
//     fault's title and hint, each worth more the fewer faults use it.
// Found needs both, and one fault clearly ahead of the rest there; anything
// weaker is a maybe. Then the report, in Markdown.
//
// The first Claude hunt (2026-11-14) showed why both are needed: matching by
// endpoint alone credited one GraphQL finding with all six GraphQL faults,
// and faults that live on a page could never be found.

// The finding and walk types, the honesty rules, and the route patterns.
import { HONESTY, routePattern, type Finding, type Pass } from "./findings";

// One planted fault, as /api/practice lists it.
export type PlantedFault = {
  flag: string;
  title: string;
  where: string;
  kind?: string;
  hint?: string;
};

// A fault the hunt matched, and how.
export type Match = {
  fault: PlantedFault;
  how: "found" | "maybe";
  findings: Finding[];
  // Why each finding matched, in the same order: the place and the words.
  why: string[];
};

// The score and the findings sorted for the report.
export type Score = {
  planted: number;
  found: Match[];
  maybe: Match[];
  // Seen with practice mode off too: real, not planted.
  fresh: Finding[];
  // Seen only with practice mode on, matching no fault.
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

// Words that say nothing about a bug, left out when comparing.
const STOP_WORDS = new Set(
  [
    "the and for with that this are was its into from but not you your their",
    "they them one any can than then when what who has have had all out get",
    "gets got also still only just too very more most some same other after",
    "before over under each every does did done been being about like way",
    "there here shows show shown says say page app api bank customer",
    "even though while which where whose would could should will",
  ]
    .join(" ")
    .split(" "),
);

// A text's meaningful words, roughly stemmed ("leaves", "left" stay apart,
// but "transfers" and "transfer", "skipped" and "skip", "deeply" and "deep"
// meet), lower case, three letters or more.
export function wordsOf(text: string): Set<string> {
  return new Set(stemsOf(text).keys());
}

// The same, each stem with the word as the text first wrote it, for the
// report ("charges", not "charg").
function stemsOf(text: string): Map<string, string> {
  const words = new Map<string, string>();
  for (const raw of String(text)
    .toLowerCase()
    .split(/[^a-z0-9]+/)) {
    if (raw.length < 3 || STOP_WORDS.has(raw)) continue;
    let word = raw;
    if (word.endsWith("ly") && word.length > 5) word = word.slice(0, -2);
    else if (word.endsWith("ies") && word.length > 4)
      word = `${word.slice(0, -3)}y`;
    else if (word.endsWith("ing") && word.length > 5) word = word.slice(0, -3);
    else if (word.endsWith("ed") && word.length > 4) word = word.slice(0, -2);
    else if (word.endsWith("es") && word.length > 4) word = word.slice(0, -2);
    else if (word.endsWith("s") && !word.endsWith("ss") && word.length > 3)
      word = word.slice(0, -1);
    if (!words.has(word)) words.set(word, raw);
  }
  return words;
}

// A fault's own words: its title and its hint.
function faultWords(fault: PlantedFault): Set<string> {
  return wordsOf([fault.title, fault.hint].filter(Boolean).join(" "));
}

// What a finding says: its title, kind and what actually happened.
function findingText(finding: Finding): string {
  return [finding.title, finding.kind, finding.actual]
    .filter(Boolean)
    .join(" ");
}

// The words (stems) a finding shares with a fault's title and hint.
export function sharedWords(finding: Finding, fault: PlantedFault): string[] {
  const theirs = faultWords(fault);
  return [...wordsOf(findingText(finding))].filter((word) => theirs.has(word));
}

// What each word is worth: 1 divided by the number of faults that use it, so
// "backorder" (one fault) is worth 1 and "transfer" (six) is worth 1/6. A
// word every fault shares tells them apart from nothing. Worked out from the
// live fault list each time, so a new planted fault needs no change here.
export function wordWeights(faults: PlantedFault[]): Map<string, number> {
  const uses = new Map<string, number>();
  for (const fault of faults)
    for (const word of faultWords(fault))
      uses.set(word, (uses.get(word) ?? 0) + 1);
  return new Map([...uses].map(([word, n]) => [word, 1 / n]));
}

// A path's meaningful parts, so /app/bank/transfer and /api/bank/transfers
// both give "transfer". "admin" is a whole section, not a place.
function areasOf(path: string): string[] {
  return [...wordsOf(path.replace(/[/._:-]+/g, " "))].filter(
    (part) => part !== "admin",
  );
}

// Where a finding happened against where a fault lives: "same" when its
// endpoint or one of its pages is a path the fault's "where" names, "area"
// when they only share a part, and null when neither.
export function placeOf(
  finding: Finding,
  fault: PlantedFault,
): "same" | "area" | null {
  const theirs = pathsIn(fault.where);
  const ours = [finding.endpoint?.split(" ")[1], ...finding.pages]
    .filter((path): path is string => Boolean(path))
    .map(routePattern);
  if (ours.some((path) => theirs.includes(path))) return "same";
  const areas = new Set(ours.flatMap(areasOf));
  return theirs.flatMap(areasOf).some((part) => areas.has(part))
    ? "area"
    : null;
}

// Found needs 1.5 points (say, one word only that fault uses and one two
// faults share) and half a point clear of the next fault at the place.
const FOUND_POINTS = 1.5;
const CLEAR_BY = 0.5;

// One fault weighed against one finding: the shared words as the finding
// wrote them, and their points.
type Weighed = {
  fault: PlantedFault;
  place: "same" | "area" | null;
  words: string[];
  points: number;
};

// The score: each finding classed as new, found, maybe or unmatched, and
// found for one fault at most.
export function scoreFindings(
  findings: Finding[],
  faults: PlantedFault[],
): Score {
  const weights = wordWeights(faults);
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
    // Practice mode on only: every fault, by place and words, best first.
    const asWritten = stemsOf(findingText(finding));
    const ranked: Weighed[] = faults
      .map((fault) => {
        const stems = sharedWords(finding, fault);
        return {
          fault,
          place: placeOf(finding, fault),
          words: stems.map((stem) => asWritten.get(stem) ?? stem),
          points: stems.reduce((sum, s) => sum + (weights.get(s) ?? 0), 0),
        };
      })
      .sort((a, b) => b.points - a.points);
    const same = ranked.filter((r) => r.place === "same");
    const near = ranked.filter((r) => r.place !== null);

    // Found: the clearest story at the very endpoint or page first, then in
    // the same area.
    const pick = clearest(same) ?? clearest(near);
    if (pick) {
      add(found, pick, "found", finding);
      continue;
    }
    // A maybe: the closest stories at the place (within half a point of the
    // best there), and a strong story somewhere else.
    const close = near.filter(
      (r) => r.points > 0 && near[0].points - r.points < CLEAR_BY,
    );
    const elsewhere =
      ranked[0] &&
      ranked[0].points >= FOUND_POINTS &&
      !close.includes(ranked[0])
        ? [ranked[0]]
        : [];
    const maybes = [...close, ...elsewhere];
    if (maybes.length === 0) unmatched.push(finding);
    for (const r of maybes) add(maybe, r, "maybe", finding);
  }
  // A fault found by one finding is not also a maybe.
  const pointedAt = new Map<Finding, { match: Match; why: string }>();
  for (const [flag, match] of maybe) {
    const foundMatch = found.get(flag);
    if (!foundMatch) continue;
    match.findings.forEach((finding, i) => {
      if (!pointedAt.has(finding))
        pointedAt.set(finding, { match: foundMatch, why: match.why[i] });
    });
    maybe.delete(flag);
  }
  // A finding that pointed only at faults already found stays in the report,
  // under the first of them, as a weaker match.
  const listed = new Set(
    [...found.values(), ...maybe.values()].flatMap((m) => m.findings),
  );
  for (const [finding, { match, why }] of pointedAt) {
    if (listed.has(finding)) continue;
    match.findings.push(finding);
    match.why.push(`as a weaker match, ${why}`);
  }
  return {
    planted: faults.length,
    found: [...found.values()],
    maybe: [...maybe.values()],
    fresh,
    unmatched,
  };
}

// The fault clearly ahead in a list sorted best first: enough points, and
// half a point clear of the next. None when it is close.
function clearest(list: Weighed[]): Weighed | undefined {
  const [best, next] = list;
  if (!best || best.points < FOUND_POINTS) return undefined;
  return best.points - (next?.points ?? 0) >= CLEAR_BY ? best : undefined;
}

// Adds a finding to a fault's match, with why it matched.
function add(
  into: Map<string, Match>,
  weighed: Weighed,
  how: Match["how"],
  finding: Finding,
): void {
  const { fault } = weighed;
  const match = into.get(fault.flag) ?? { fault, how, findings: [], why: [] };
  if (!match.findings.includes(finding)) {
    match.findings.push(finding);
    match.why.push(whyText(weighed));
  }
  into.set(fault.flag, match);
}

// "at the same endpoint or page; words in common: negative, amount (2.67
// points)".
function whyText(weighed: Weighed): string {
  const place =
    weighed.place === "same"
      ? "at the same endpoint or page"
      : weighed.place === "area"
        ? "in the same area"
        : "somewhere else";
  const words = weighed.words.length ? weighed.words.join(", ") : "none";
  return `${place}; words in common: ${words} (${weighed.points.toFixed(2)} points)`;
}

// The walks' totals, for the report's first lines. "requests" is the API
// calls sent by hand (the /bug-hunt skill counts them against its cap).
export type WalkSummary = {
  pass: Pass;
  pages: number;
  pressed: number;
  requests?: number;
};

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
  // Who hunted: the walk by default, or the /bug-hunt skill.
  by?: string;
}): string {
  const { score } = input;
  const counted = input.findings.filter((f) => f.classification === "bug");
  const notCounted = input.findings.filter((f) => f.classification !== "bug");
  // The walks table, with the requests column only when a walk counted them.
  const withRequests = input.walks.some((w) => w.requests !== undefined);
  const walkTable = withRequests
    ? [
        "| Walk | Pages opened | Buttons pressed | Requests sent |",
        "| --- | --- | --- | --- |",
        ...input.walks.map(
          (w) =>
            `| ${w.pass} | ${w.pages} | ${w.pressed} | ${w.requests ?? 0} |`,
        ),
      ]
    : [
        "| Walk | Pages opened | Buttons pressed |",
        "| --- | --- | --- |",
        ...input.walks.map((w) => `| ${w.pass} | ${w.pages} | ${w.pressed} |`),
      ];
  const lines: string[] = [
    `# Bug hunt — ${input.when}`,
    "",
    `Target: ${input.base}/app (local). ${input.by ?? "Walked with no AI by `npm run bug-hunt`."}`,
    "",
    `**Score: found ${score.found.length} of ${score.planted} planted faults, ${score.maybe.length} maybe, ${score.fresh.length} new.**`,
    "",
    ...walkTable,
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
          input.by
            ? "None."
            : "None. The walk finds crashes and errors; most planted faults are logic bugs it cannot see.",
          "",
        ]),
    "## Maybe (a weak or shared match, never counted as found)",
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

// A matched fault and the findings that matched it, each with why.
function matchBlock(match: Match): string[] {
  return [
    `### ${match.fault.title} (\`${match.fault.flag}\`)`,
    "",
    `Lives at: ${match.fault.where}. ${match.how === "found" ? "Found" : "A maybe, not counted"}.`,
    "",
    ...match.findings.flatMap((finding, i) => {
      const block = findingBlock(finding);
      return [block[0], "", `Matched ${match.why[i]}.`, ...block.slice(1)];
    }),
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
    // The finding's own steps when it has them (the /bug-hunt skill writes
    // them); otherwise the walk's page and action.
    ...(f.steps && f.steps.length
      ? f.steps.map((step, i) => `${i + 1}. ${step}`)
      : [
          `1. As the ${role.split(",")[0]}${role.includes("practice on") ? ", with practice mode on" : ""}, open ${f.page}.`,
          ...(f.action !== "open the page" ? [`2. Then ${f.action}.`] : []),
        ]),
    "",
    `Expected: ${f.expected ?? expectedFor(f)}`,
    "",
    `Actual: ${f.actual ?? actualFor(f)}`,
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
