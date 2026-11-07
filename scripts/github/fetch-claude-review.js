#!/usr/bin/env node
// Runs gh, writes files and builds paths.
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

// Reads --name value pairs from the command line; a flag with no value is true.
function parseArgs(argv) {
  // The flags found so far.
  const args = {};
  // Go through each word, skipping anything that is not a --flag.
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      continue;
    }
    const key = token.slice(2);
    const next = argv[index + 1];
    // No value after it: the flag is simply on. Otherwise the next word is its
    // value.
    if (!next || next.startsWith("--")) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    index += 1;
  }
  return args;
}

// Run gh with these words and return what it prints.
function runGh(args, options = {}) {
  // A failure throws with gh's own error text.
  try {
    return execFileSync("gh", args, {
      cwd: options.cwd || process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (error) {
    const details = error.stderr ? String(error.stderr).trim() : error.message;
    throw new Error(
      `gh ${args.join(" ")} failed${details ? `: ${details}` : ""}`,
    );
  }
}

// Run gh and read its output as JSON; nothing printed gives the fallback.
function ghJson(args, fallback = []) {
  const output = runGh(args);
  if (!output) {
    return fallback;
  }
  return JSON.parse(output);
}

// The repository's owner and name, as gh sees the current folder.
function inferRepo() {
  // Ask gh, then split owner/name.
  const nameWithOwner = runGh([
    "repo",
    "view",
    "--json",
    "nameWithOwner",
    "--jq",
    ".nameWithOwner",
  ]);
  const [owner, repo] = nameWithOwner.split("/");
  // Fail when the answer is not owner/name.
  if (!owner || !repo) {
    throw new Error(
      `Could not parse repository from gh output: ${nameWithOwner}`,
    );
  }
  return { owner, repo };
}

// The PR to read when none was given: this branch's PR, else the latest one.
function inferPullRequest() {
  // This branch's PR, when it has one.
  try {
    const current = runGh([
      "pr",
      "view",
      "--json",
      "number",
      "--jq",
      ".number",
    ]);
    if (current) {
      return current;
    }
  } catch (_) {
    // Fall back to the most recently updated PR.
  }

  // Otherwise the most recently updated PR; none at all is an error.
  const latest = runGh([
    "pr",
    "list",
    "--state",
    "all",
    "--limit",
    "1",
    "--json",
    "number",
    "--jq",
    ".[0].number",
  ]);
  if (!latest) {
    throw new Error("No pull request was supplied and gh could not infer one.");
  }
  return latest;
}

// Whether a comment or review came from Claude: by its author or its text.
function isClaudeEntry(entry) {
  const login = String(
    entry.user?.login || entry.author?.login || "",
  ).toLowerCase();
  const body = String(entry.body || "");
  return (
    login.includes("claude") ||
    /\bclaude\b/i.test(body) ||
    /pre-merge review/i.test(body)
  );
}

// When it was posted.
function entryDate(entry) {
  return entry.submitted_at || entry.created_at || entry.updated_at || "";
}

// One comment or review as Markdown: who, when, where, and its text.
function renderEntry(entry, label) {
  // Author, date, address, review state, and the file and line when it has one.
  const author = entry.user?.login || entry.author?.login || "unknown";
  const date = entryDate(entry) || "unknown date";
  const url = entry.html_url || entry.url || "";
  const state = entry.state ? ` (${entry.state})` : "";
  const file = entry.path
    ? `\n- File: \`${entry.path}\`${entry.line ? `:${entry.line}` : ""}`
    : "";
  return [
    `### ${label}${state}`,
    "",
    `- Author: ${author}`,
    `- Date: ${date}`,
    url ? `- URL: ${url}` : "- URL: unavailable",
    file,
    "",
    entry.body || "_No body supplied._",
    "",
  ]
    .filter(Boolean)
    .join("\n");
}

// Write a Markdown note in the Obsidian inbox with Claude's review of a PR.
function main() {
  // Read the flags.
  const args = parseArgs(process.argv.slice(2));
  // --help: show how to run it and stop.
  if (args.help) {
    console.log(
      [
        "Usage:",
        "  npm run review:claude:pull -- --pr <number>",
        "  npm run review:claude:pull -- --pr <number> --all",
        "  npm run review:claude:pull -- --owner <owner> --repo <repo> --pr <number>",
        "",
        "Writes a Markdown handoff note under obsidian-vault/Inbox/Agents/ by default.",
      ].join("\n"),
    );
    return;
  }

  // Which repository and PR, and whether to keep every comment (--all).
  const repoInfo =
    args.owner && args.repo
      ? { owner: args.owner, repo: args.repo }
      : inferRepo();
  const pullRequest = String(args.pr || inferPullRequest());
  const includeAll = Boolean(args.all);
  const repoPath = `${repoInfo.owner}/${repoInfo.repo}`;

  // The PR's conversation comments, reviews and inline comments, from GitHub's
  // API.
  const issueComments = ghJson([
    "api",
    `repos/${repoPath}/issues/${pullRequest}/comments`,
    "-f",
    "per_page=100",
  ]);
  const reviews = ghJson([
    "api",
    `repos/${repoPath}/pulls/${pullRequest}/reviews`,
    "-f",
    "per_page=100",
  ]);
  const reviewComments = ghJson([
    "api",
    `repos/${repoPath}/pulls/${pullRequest}/comments`,
    "-f",
    "per_page=100",
  ]);

  // Keep only Claude's, unless --all.
  const selectedIssueComments = includeAll
    ? issueComments
    : issueComments.filter(isClaudeEntry);
  const selectedReviews = includeAll ? reviews : reviews.filter(isClaudeEntry);
  const selectedReviewComments = includeAll
    ? reviewComments
    : reviewComments.filter(isClaudeEntry);

  // The note goes to obsidian-vault/Inbox/Agents/, dated, unless --out says
  // where.
  const now = new Date();
  const dateStamp = now.toISOString().slice(0, 10);
  const defaultOut = path.join(
    process.cwd(),
    "obsidian-vault",
    "Inbox",
    "Agents",
    `${dateStamp}-claude-review-pr-${pullRequest}.md`,
  );
  const outputPath = path.resolve(args.out || defaultOut);

  // The note's header, source and counts.
  const sections = [
    "---",
    "type: handoff",
    "source: github-claude-review",
    `repo: ${repoPath}`,
    `pull_request: ${pullRequest}`,
    `created: ${now.toISOString()}`,
    "---",
    "",
    `# Claude Review Pull: PR #${pullRequest}`,
    "",
    "## Source",
    "",
    `- Repository: ${repoPath}`,
    `- Pull request: https://github.com/${repoPath}/pull/${pullRequest}`,
    `- Include all comments: ${includeAll ? "yes" : "no, Claude-looking entries only"}`,
    "",
    "## Summary",
    "",
    `- Issue comments captured: ${selectedIssueComments.length}`,
    `- PR reviews captured: ${selectedReviews.length}`,
    `- Inline review comments captured: ${selectedReviewComments.length}`,
    "",
  ];

  // Nothing from Claude: say so, and how to check.
  if (
    selectedIssueComments.length === 0 &&
    selectedReviews.length === 0 &&
    selectedReviewComments.length === 0
  ) {
    sections.push(
      "## No Claude Entries Found",
      "",
      "No Claude-looking review entries were found. Confirm that Claude reviewed this PR and that `gh` can see comments from the Claude GitHub App.",
      "Run again with `--all` to capture every PR comment/review for debugging.",
      "",
    );
  }

  // The conversation comments.
  if (selectedIssueComments.length > 0) {
    sections.push("## PR Conversation Comments", "");
    selectedIssueComments.forEach((entry, index) =>
      sections.push(renderEntry(entry, `Conversation Comment ${index + 1}`)),
    );
  }

  // The reviews.
  if (selectedReviews.length > 0) {
    sections.push("## PR Reviews", "");
    selectedReviews.forEach((entry, index) =>
      sections.push(renderEntry(entry, `Review ${index + 1}`)),
    );
  }

  // The inline comments.
  if (selectedReviewComments.length > 0) {
    sections.push("## Inline Review Comments", "");
    selectedReviewComments.forEach((entry, index) =>
      sections.push(renderEntry(entry, `Inline Comment ${index + 1}`)),
    );
  }

  // Write the note and say where it is.
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${sections.join("\n").trim()}\n`, "utf8");
  console.log(
    `Claude review handoff written: ${path.relative(process.cwd(), outputPath)}`,
  );
}

// Run it.
main();
