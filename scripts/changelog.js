#!/usr/bin/env node
// Regenerates the "Unreleased" section of CHANGELOG.md from commit messages.
//
// The point is that nobody has to remember. `.github/workflows/changelog.yml`
// runs this on every pull request and commits the result to the PR's own branch,
// so a changelog entry is a side effect of writing a decent commit message rather
// than a separate chore that gets skipped. Run it by hand with
// `npm run changelog` if you want it before opening the PR.
//
// Not a pre-push hook: a commit created inside pre-push is not part of the push
// that triggered it, because git has already decided which refs it is sending.
// The hook could only fail and ask you to re-run, which is the reminder this is
// meant to remove.
//
// What it reads: every commit since the newest `v*` tag, excluding merge commits
// (a merge's subject repeats the branch name and says nothing). What it writes:
// one bullet per commit, grouped by the commit's conventional-commit type.
//
// What it deliberately does NOT touch: any section below "Unreleased". Released
// entries are hand-written prose and better than anything generated - this only
// owns the top block.
//
// Usage:
//   node scripts/changelog.js            rewrite the Unreleased section
//   node scripts/changelog.js --check    exit 1 if it is stale, write nothing
//   node scripts/changelog.js --print    print the section, write nothing

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const CHANGELOG = path.join(ROOT, "CHANGELOG.md");
const MARKER = "## Unreleased";

// Conventional-commit type -> the heading it lands under. Order here is the
// order in the output: what a reader cares about first comes first.
const GROUPS = [
  ["feat", "Added"],
  ["fix", "Fixed"],
  ["perf", "Fixed"],
  ["style", "Changed"],
  ["refactor", "Changed"],
  ["docs", "Documentation"],
  ["test", "Tests"],
  ["build", "Internal"],
  ["ci", "Internal"],
  ["chore", "Internal"],
  ["revert", "Reverted"],
];

const HEADING_ORDER = [
  "Added",
  "Fixed",
  "Changed",
  "Documentation",
  "Tests",
  "Reverted",
  "Internal",
];

function git(args) {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
}

// The newest v-tag reachable from HEAD. Without one, everything is unreleased,
// which is the correct answer for a repository that has never cut a release.
function lastReleaseTag() {
  try {
    return git(["describe", "--tags", "--abbrev=0", "--match", "v*"]);
  } catch {
    return "";
  }
}

function commitsSince(tag) {
  const range = tag ? `${tag}..HEAD` : "HEAD";

  // %x1f between fields, %x1e between records: neither appears in a commit
  // message, unlike newlines and pipes. %ad with --date=short so entries can be
  // grouped by the day the work happened.
  const raw = git([
    "log",
    range,
    "--no-merges",
    "--date=short",
    "--format=%H%x1f%ad%x1f%s%x1e",
  ]);

  if (!raw) return [];

  return raw
    .split("\x1e")
    .map((record) => record.trim())
    .filter(Boolean)
    .map((record) => {
      const [sha, date, subject] = record.split("\x1f");
      return {
        sha: (sha || "").trim(),
        date: (date || "").trim(),
        subject: (subject || "").trim(),
      };
    })
    .filter((entry) => entry.sha && entry.subject);
}

// "fix(test-runner): job names ... (#23)" ->
//   { heading: "Fixed", scope: "test-runner", text: "job names ...", pr: "23" }
//
// A subject with no recognised type is still recorded, under Changed, rather
// than dropped: a missing entry is worse than an ungrouped one, and the commit
// is real either way.
function classify(subject) {
  const match = subject.match(/^([a-z]+)(?:\(([^)]+)\))?!?:\s*(.+)$/);

  let type = "";
  let scope = "";
  let text = subject;

  if (match) {
    type = match[1];
    scope = match[2] || "";
    text = match[3];
  }

  const pair = GROUPS.find(([name]) => name === type);
  const heading = pair ? pair[1] : "Changed";

  // GitHub appends "(#N)" on squash merges. Pull it out so it can become a link
  // instead of sitting in the middle of a sentence.
  const pr = text.match(/\s*\(#(\d+)\)\s*$/);
  if (pr) text = text.slice(0, pr.index).trim();

  return { heading, scope, text, pr: pr ? pr[1] : "" };
}

function repoSlug() {
  try {
    const url = git(["remote", "get-url", "origin"]);
    const m = url.match(/github\.com[:/]+([^/]+\/[^/.]+)/i);
    return m ? m[1] : "";
  } catch {
    return "";
  }
}

function renderSection(entries, tag) {
  const slug = repoSlug();

  const lines = [MARKER, ""];

  if (entries.length === 0) {
    lines.push(
      tag
        ? `Nothing since [\`${tag}\`](../../releases/tag/${tag}).`
        : "Nothing yet.",
    );
    lines.push("");
    return lines.join("\n");
  }

  lines.push(
    `${entries.length} commit${entries.length === 1 ? "" : "s"} since ` +
      (tag ? `[\`${tag}\`](../../releases/tag/${tag})` : "the start") +
      ". Generated by `npm run changelog` — edit the commit message, not this list.",
  );
  lines.push("");

  // One block per DAY, newest first, each with its own categories — the shape
  // game patch notes use. Someone asking "what changed on the 28th" gets one
  // heading, instead of a flat list they have to date-check line by line.
  //
  // `git log` already returns newest first and a Map keeps insertion order, so
  // the days come out right without sorting. Today's block grows as commits land;
  // tomorrow's first commit opens a new block above it. Nothing to maintain.
  const days = new Map();

  for (const entry of entries) {
    if (!days.has(entry.date)) days.set(entry.date, new Map());
    const buckets = days.get(entry.date);

    const { heading, scope, text, pr } = classify(entry.subject);
    if (!buckets.has(heading)) buckets.set(heading, []);

    const prefix = scope ? `**${scope}:** ` : "";
    const link =
      pr && slug ? ` ([#${pr}](https://github.com/${slug}/pull/${pr}))` : "";

    buckets.get(heading).push(`- ${prefix}${text}${link}`);
  }

  for (const [date, buckets] of days) {
    const total = [...buckets.values()].reduce((n, list) => n + list.length, 0);

    lines.push(`### ${date}`);
    lines.push("");
    lines.push(`_${total} change${total === 1 ? "" : "s"}_`);
    lines.push("");

    // One level below the date, so the date owns the block.
    for (const heading of HEADING_ORDER) {
      const items = buckets.get(heading);
      if (!items || items.length === 0) continue;
      lines.push(`#### ${heading}`);
      lines.push("");
      lines.push(...items);
      lines.push("");
    }
  }

  return lines.join("\n");
}

// Replaces an existing Unreleased block, or inserts one directly after the
// document's intro rule. Everything below is left byte-for-byte alone.
function splice(existing, section) {
  const start = existing.indexOf(MARKER);

  if (start !== -1) {
    // Up to the next top-level heading, or the end of the file.
    const rest = existing.slice(start + MARKER.length);
    const nextIndex = rest.search(/\n## /);
    const end =
      nextIndex === -1
        ? existing.length
        : start + MARKER.length + nextIndex + 1;

    return existing.slice(0, start) + section + "\n" + existing.slice(end);
  }

  const rule = existing.indexOf("\n---\n");

  if (rule !== -1) {
    const at = rule + "\n---\n".length;
    return existing.slice(0, at) + "\n" + section + "\n" + existing.slice(at);
  }

  // No intro rule: put it after the H1 rather than at the very top, so the
  // document still opens with its title.
  const afterTitle = existing.indexOf("\n\n");
  const at = afterTitle === -1 ? existing.length : afterTitle + 2;
  return existing.slice(0, at) + section + "\n" + existing.slice(at);
}

function main() {
  const args = process.argv.slice(2);
  const check = args.includes("--check");
  const print = args.includes("--print");

  const tag = lastReleaseTag();
  const entries = commitsSince(tag);
  const section = renderSection(entries, tag);

  if (print) {
    process.stdout.write(section + "\n");
    return;
  }

  const existing = fs.existsSync(CHANGELOG)
    ? fs.readFileSync(CHANGELOG, "utf8")
    : "# Changelog\n\n---\n";

  const next = splice(existing, section);

  if (next === existing) {
    console.log(
      `[changelog] Current: ${entries.length} unreleased commit${entries.length === 1 ? "" : "s"}${tag ? ` since ${tag}` : ""}.`,
    );
    return;
  }

  if (check) {
    console.error(
      "[changelog] CHANGELOG.md is stale. Run: npm run changelog -- and commit the result.",
    );
    process.exit(1);
  }

  fs.writeFileSync(CHANGELOG, next, "utf8");
  console.log(
    `[changelog] Rewrote the Unreleased section: ${entries.length} commit${entries.length === 1 ? "" : "s"}${tag ? ` since ${tag}` : ""}.`,
  );
}

try {
  main();
} catch (error) {
  console.error(`[changelog] ${error.message}`);
  process.exit(1);
}
