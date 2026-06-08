#!/usr/bin/env node
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      continue;
    }
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    index += 1;
  }
  return args;
}

function runGh(args, options = {}) {
  try {
    return execFileSync("gh", args, {
      cwd: options.cwd || process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    }).trim();
  } catch (error) {
    const details = error.stderr ? String(error.stderr).trim() : error.message;
    throw new Error(`gh ${args.join(" ")} failed${details ? `: ${details}` : ""}`);
  }
}

function ghJson(args, fallback = []) {
  const output = runGh(args);
  if (!output) {
    return fallback;
  }
  return JSON.parse(output);
}

function inferRepo() {
  const nameWithOwner = runGh(["repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner"]);
  const [owner, repo] = nameWithOwner.split("/");
  if (!owner || !repo) {
    throw new Error(`Could not parse repository from gh output: ${nameWithOwner}`);
  }
  return { owner, repo };
}

function inferPullRequest() {
  try {
    const current = runGh(["pr", "view", "--json", "number", "--jq", ".number"]);
    if (current) {
      return current;
    }
  } catch (_) {
    // Fall back to the most recently updated PR.
  }

  const latest = runGh(["pr", "list", "--state", "all", "--limit", "1", "--json", "number", "--jq", ".[0].number"]);
  if (!latest) {
    throw new Error("No pull request was supplied and gh could not infer one.");
  }
  return latest;
}

function isClaudeEntry(entry) {
  const login = String(entry.user?.login || entry.author?.login || "").toLowerCase();
  const body = String(entry.body || "");
  return login.includes("claude") || /\bclaude\b/i.test(body) || /pre-merge review/i.test(body);
}

function entryDate(entry) {
  return entry.submitted_at || entry.created_at || entry.updated_at || "";
}

function renderEntry(entry, label) {
  const author = entry.user?.login || entry.author?.login || "unknown";
  const date = entryDate(entry) || "unknown date";
  const url = entry.html_url || entry.url || "";
  const state = entry.state ? ` (${entry.state})` : "";
  const file = entry.path ? `\n- File: \`${entry.path}\`${entry.line ? `:${entry.line}` : ""}` : "";
  return [
    `### ${label}${state}`,
    "",
    `- Author: ${author}`,
    `- Date: ${date}`,
    url ? `- URL: ${url}` : "- URL: unavailable",
    file,
    "",
    entry.body || "_No body supplied._",
    ""
  ].filter(Boolean).join("\n");
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log([
      "Usage:",
      "  npm run review:claude:pull -- --pr <number>",
      "  npm run review:claude:pull -- --pr <number> --all",
      "  npm run review:claude:pull -- --owner <owner> --repo <repo> --pr <number>",
      "",
      "Writes a Markdown handoff note under obsidian-vault/Inbox/Agents/ by default."
    ].join("\n"));
    return;
  }

  const repoInfo = args.owner && args.repo ? { owner: args.owner, repo: args.repo } : inferRepo();
  const pullRequest = String(args.pr || inferPullRequest());
  const includeAll = Boolean(args.all);
  const repoPath = `${repoInfo.owner}/${repoInfo.repo}`;

  const issueComments = ghJson([
    "api",
    `repos/${repoPath}/issues/${pullRequest}/comments`,
    "-f",
    "per_page=100"
  ]);
  const reviews = ghJson([
    "api",
    `repos/${repoPath}/pulls/${pullRequest}/reviews`,
    "-f",
    "per_page=100"
  ]);
  const reviewComments = ghJson([
    "api",
    `repos/${repoPath}/pulls/${pullRequest}/comments`,
    "-f",
    "per_page=100"
  ]);

  const selectedIssueComments = includeAll ? issueComments : issueComments.filter(isClaudeEntry);
  const selectedReviews = includeAll ? reviews : reviews.filter(isClaudeEntry);
  const selectedReviewComments = includeAll ? reviewComments : reviewComments.filter(isClaudeEntry);

  const now = new Date();
  const dateStamp = now.toISOString().slice(0, 10);
  const defaultOut = path.join(
    process.cwd(),
    "obsidian-vault",
    "Inbox",
    "Agents",
    `${dateStamp}-claude-review-pr-${pullRequest}.md`
  );
  const outputPath = path.resolve(args.out || defaultOut);

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
    ""
  ];

  if (selectedIssueComments.length === 0 && selectedReviews.length === 0 && selectedReviewComments.length === 0) {
    sections.push(
      "## No Claude Entries Found",
      "",
      "No Claude-looking review entries were found. Confirm that Claude reviewed this PR and that `gh` can see comments from the Claude GitHub App.",
      "Run again with `--all` to capture every PR comment/review for debugging.",
      ""
    );
  }

  if (selectedIssueComments.length > 0) {
    sections.push("## PR Conversation Comments", "");
    selectedIssueComments.forEach((entry, index) => sections.push(renderEntry(entry, `Conversation Comment ${index + 1}`)));
  }

  if (selectedReviews.length > 0) {
    sections.push("## PR Reviews", "");
    selectedReviews.forEach((entry, index) => sections.push(renderEntry(entry, `Review ${index + 1}`)));
  }

  if (selectedReviewComments.length > 0) {
    sections.push("## Inline Review Comments", "");
    selectedReviewComments.forEach((entry, index) => sections.push(renderEntry(entry, `Inline Comment ${index + 1}`)));
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${sections.join("\n").trim()}\n`, "utf8");
  console.log(`Claude review handoff written: ${path.relative(process.cwd(), outputPath)}`);
}

main();