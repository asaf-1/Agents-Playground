// The bug hunt's findings: what a walk saw (a signal), turned into a finding
// with the honesty labels from honesty.json (classification, confidence,
// severity) and a fingerprint, then merged so one problem seen on many pages
// is one finding. Pure functions, except reading honesty.json once.

// Node's file and path tools, to read the shared honesty rules.
import fs from "node:fs";
import path from "node:path";

// The honesty rules both ways of hunting read (the walk and /bug-hunt).
export const HONESTY = JSON.parse(
  fs.readFileSync(path.join(__dirname, "honesty.json"), "utf8"),
) as {
  classifications: Record<string, string>;
  confidence: Record<string, string>;
  severity: Record<string, string>;
  rules: string[];
};

// What a walk can see go wrong.
export type SignalKind =
  | "server-error" // an answer of 500 or more from the site
  | "page-error" // an uncaught error in the page's JavaScript
  | "page-crash" // the browser tab crashed
  | "console-error" // an error the page wrote to the console
  | "request-failed" // a request that got no answer at all
  | "slow" // an answer that took longer than SLOW_MS
  | "blank-page" // a page that rendered nothing
  | "dead-link"; // a link to a page the app does not have

// One thing seen, where and when.
export type Signal = {
  kind: SignalKind;
  // The page the walk was on, and what it was doing ("open the page",
  // 'press "Buy"', 'follow the link "Statement"').
  page: string;
  action: string;
  method?: string;
  path?: string;
  status?: number;
  requestId?: string;
  message?: string;
  ms?: number;
  // The page a dead link was found on.
  from?: string;
  // Seen again when the step was repeated.
  reproduced?: boolean;
  // A screenshot taken when it was first seen, from the run's folder.
  screenshot?: string;
};

// The five walks, by who walks and how.
export type Pass =
  | "customer, practice off"
  | "customer, practice on"
  | "admin, looking only"
  | "support, looking only"
  | "signed out";

// One finding, shaped like Debbie's candidate template.
export type Finding = {
  fingerprint: string;
  title: string;
  kind: SignalKind;
  classification: string;
  confidence: "high" | "medium" | "low";
  severity: "blocker" | "major" | "minor" | "nit";
  area: string;
  target: "local";
  // Where it was first seen, and every page and walk it showed up on.
  page: string;
  action: string;
  pages: string[];
  passes: Pass[];
  endpoint?: string;
  status?: number;
  requestId?: string;
  message?: string;
  ms?: number;
  reproduced: boolean;
  screenshot?: string;
};

// Slower than this, an answer is noted (as a nit, never as a bug).
export const SLOW_MS = 2000;

// A path as a pattern: a part with a digit, a long hex or uuid id, or a coin
// symbol (two to six capitals) becomes ":id", so /app/bank/accounts/12 and
// /app/bank/accounts/13 are one page. The query string is dropped.
export function routePattern(p: string): string {
  const clean = String(p).split("?")[0].split("#")[0];
  return clean
    .split("/")
    .map((part, index) =>
      index > 1 && (/\d/.test(part) || /^[A-Z]{2,6}$/.test(part))
        ? ":id"
        : part,
    )
    .join("/");
}

// API keys, bearer tokens and password values, as ***.
export function maskSecrets(text: string): string {
  return String(text)
    .replace(/pbk_[A-Za-z0-9_-]+/g, "pbk_***")
    .replace(/(Bearer\s+)\S+/gi, "$1***")
    .replace(/("?password"?\s*[:=]\s*"?)[^"&,\s}]+/gi, "$1***");
}

// A short slug for a fingerprint: lower case, letters and digits, dashes.
function slug(text: string, max = 48): string {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max);
}

// The page's area, from its first part after /app: bank, markets, admin...
export function areaOf(page: string): string {
  return routePattern(page).split("/")[2] || "home";
}

// The labels the honesty rules give each kind of signal. Repeating the step is
// what earns "high"; the walk never calls anything expected-bad-ux or
// test-gap (only a person or Claude can).
export function classify(
  signal: Signal,
): Pick<Finding, "classification" | "confidence" | "severity" | "title"> {
  const seenTwice = Boolean(signal.reproduced);
  switch (signal.kind) {
    case "server-error":
      return {
        classification: "bug",
        confidence: seenTwice ? "high" : "medium",
        severity: "major",
        title: `${signal.method} ${routePattern(signal.path ?? "")} answers ${signal.status}`,
      };
    case "page-error":
      return {
        classification: "bug",
        confidence: seenTwice ? "high" : "medium",
        severity: "major",
        title: `Uncaught error on ${routePattern(signal.page)}: ${cut(signal.message, 80)}`,
      };
    case "page-crash":
      return {
        classification: "bug",
        confidence: "high",
        severity: "blocker",
        title: `The page crashed on ${routePattern(signal.page)}`,
      };
    case "blank-page":
      return {
        classification: "bug",
        confidence: seenTwice ? "high" : "medium",
        severity: "major",
        title: `${routePattern(signal.page)} renders an empty page`,
      };
    case "dead-link":
      return {
        classification: "bug",
        confidence: "high",
        severity: "minor",
        title: `A link on ${routePattern(signal.from ?? signal.page)} leads to ${routePattern(signal.page)}, a page the app does not have`,
      };
    case "console-error": {
      // A security-policy refusal is always a real (if small) bug.
      const csp = /Content Security Policy|Refused to/i.test(
        signal.message ?? "",
      );
      return {
        classification: csp || seenTwice ? "bug" : "inconclusive",
        confidence: csp || seenTwice ? "high" : "low",
        severity: "minor",
        title: `Console error on ${routePattern(signal.page)}: ${cut(signal.message, 80)}`,
      };
    }
    case "request-failed":
      return {
        classification: "env",
        confidence: "medium",
        severity: "minor",
        title: `${signal.method ?? "A request"} ${routePattern(signal.path ?? "")} got no answer (${cut(signal.message, 40)})`,
      };
    case "slow":
    default:
      return {
        classification: "inconclusive",
        confidence: "low",
        severity: "nit",
        title: `${signal.method} ${routePattern(signal.path ?? "")} took ${signal.ms} ms`,
      };
  }
}

// The fingerprint: local, then the endpoint for an answer and the page for
// anything in the page, then the symptom. The same problem on two pages that
// call the same endpoint is one finding.
export function fingerprint(signal: Signal): string {
  switch (signal.kind) {
    case "server-error":
    case "slow":
    case "request-failed":
      return `local|${signal.method} ${routePattern(signal.path ?? "")}|${signal.kind}-${signal.status ?? slug(signal.message ?? "")}`;
    case "dead-link":
      return `local|${routePattern(signal.page)}|dead-link`;
    default:
      return `local|${routePattern(signal.page)}|${signal.kind}-${slug(signal.message ?? "")}`;
  }
}

// One signal as a finding, for one walk.
export function toFinding(signal: Signal, pass: Pass): Finding {
  const labels = classify(signal);
  return {
    fingerprint: fingerprint(signal),
    ...labels,
    kind: signal.kind,
    area: areaOf(signal.from ?? signal.page),
    target: "local",
    page: signal.page,
    action: signal.action,
    pages: [signal.page],
    passes: [pass],
    endpoint: signal.path
      ? `${signal.method ?? "GET"} ${routePattern(signal.path)}`
      : undefined,
    status: signal.status,
    requestId: signal.requestId,
    message: signal.message ? maskSecrets(cut(signal.message, 300)) : undefined,
    ms: signal.ms,
    reproduced: Boolean(signal.reproduced),
    screenshot: signal.screenshot,
  };
}

// Findings with the same fingerprint as one: every page and walk it was seen
// on, the strongest confidence, the first screenshot.
export function mergeFindings(list: Finding[]): Finding[] {
  const order = { low: 0, medium: 1, high: 2 } as const;
  const byPrint = new Map<string, Finding>();
  for (const finding of list) {
    const known = byPrint.get(finding.fingerprint);
    if (!known) {
      byPrint.set(finding.fingerprint, {
        ...finding,
        pages: [...finding.pages],
        passes: [...finding.passes],
      });
      continue;
    }
    for (const page of finding.pages)
      if (!known.pages.includes(page)) known.pages.push(page);
    for (const pass of finding.passes)
      if (!known.passes.includes(pass)) known.passes.push(pass);
    if (order[finding.confidence] > order[known.confidence]) {
      known.confidence = finding.confidence;
      known.classification = finding.classification;
    }
    known.reproduced ||= finding.reproduced;
    known.screenshot ||= finding.screenshot;
  }
  return [...byPrint.values()];
}

// A value on one line, cut short.
function cut(text: string | undefined, max: number): string {
  const line = String(text ?? "")
    .replace(/\s+/g, " ")
    .trim();
  return line.length > max ? `${line.slice(0, max)}...` : line;
}
