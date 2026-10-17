#!/usr/bin/env node

"use strict";

// Creates and deletes Neon database branches, so a pull request can run the
// suite against a real Postgres copy of the live data instead of the in-process
// PGlite the tests normally use.
//
// A Neon branch is copy-on-write: it is made in seconds and stores only what
// differs from its parent, so a copy of the production branch costs almost
// nothing until the tests start writing to it.
//
//   node scripts/neon-branch.js create pr-62
//   node scripts/neon-branch.js delete pr-62
//   node scripts/neon-branch.js list
//
// Needs NEON_API_KEY. The key never appears in output; nor does the connection
// string, which is masked before it is handed to the workflow.

const API = "https://console.neon.tech/api/v2";

// A name, not a password - it is in md/neon-runbook.md.
const PROJECT_ID = process.env.NEON_PROJECT_ID || "flat-grass-65869466";

// The free plan allows 10 branches per project. Hitting that makes branch
// creation fail on a pull request that did nothing wrong, so the limit is
// checked before creating rather than discovered afterwards.
const BRANCH_LIMIT = 10;

const key = process.env.NEON_API_KEY;

if (!key) {
  console.error(
    "\nNEON_API_KEY is not set. On a pull request from a fork GitHub withholds\n" +
      "secrets on purpose, and the workflow skips this job rather than failing.\n" +
      "Locally, see md/neon-runbook.md for how the key is made.\n",
  );
  process.exit(1);
}

async function api(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
      ...(options.headers || {}),
    },
  });

  const text = await response.text();

  if (!response.ok) {
    // The body can echo back what was sent, so it is reported as-is only for
    // the status line; nothing here ever contains the key itself.
    throw new Error(
      `Neon API ${options.method || "GET"} ${path} failed: ${response.status} ${text.slice(0, 300)}`,
    );
  }

  return text ? JSON.parse(text) : {};
}

async function listBranches() {
  const { branches } = await api(`/projects/${PROJECT_ID}/branches`);
  return branches || [];
}

// Neon answers a create or delete before the work has finished. Acting on a
// branch that is still being made fails in ways that read like a bad key, so
// every operation is waited out.
async function waitForOperations(operations, label) {
  const pending = (operations || []).map((operation) => operation.id);

  for (const id of pending) {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const { operation } = await api(
        `/projects/${PROJECT_ID}/operations/${id}`,
      );

      if (operation.status === "finished") break;

      if (operation.status === "failed" || operation.status === "error") {
        throw new Error(
          `Neon ${label} failed: operation ${id} ${operation.status}`,
        );
      }

      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
}

async function removeBranch(name, { quiet = false } = {}) {
  const branch = (await listBranches()).find((b) => b.name === name);

  if (!branch) {
    if (!quiet) console.log(`No branch named ${name}; nothing to delete.`);
    return false;
  }

  if (branch.default || branch.primary) {
    throw new Error(
      `Refusing to delete ${name}: it is the project's default branch, which is what the live site runs on.`,
    );
  }

  const { operations } = await api(
    `/projects/${PROJECT_ID}/branches/${branch.id}`,
    { method: "DELETE" },
  );
  await waitForOperations(operations, "branch delete");
  console.log(`Deleted branch ${name} (${branch.id}).`);
  return true;
}

async function create(name) {
  // A re-run of the same pull request must get a clean copy, not whatever the
  // last run left behind.
  await removeBranch(name, { quiet: true });

  const branches = await listBranches();

  if (branches.length >= BRANCH_LIMIT) {
    throw new Error(
      `The project already has ${branches.length} branches and the free plan allows ${BRANCH_LIMIT}.\n` +
        `Left-over branches from earlier runs are the usual cause. They are:\n  ` +
        branches.map((b) => b.name).join("\n  ") +
        `\nDelete the ones that are not needed with: node scripts/neon-branch.js delete <name>`,
    );
  }

  const parent = branches.find((b) => b.default || b.primary);

  const result = await api(`/projects/${PROJECT_ID}/branches`, {
    method: "POST",
    body: JSON.stringify({
      branch: { name, parent_id: parent ? parent.id : undefined },
      endpoints: [{ type: "read_write" }],
    }),
  });

  await waitForOperations(result.operations, "branch create");

  const uri = (result.connection_uris || [])[0]?.connection_uri;

  if (!uri) {
    throw new Error(
      "Neon created the branch but returned no connection string. That happens when the parent has more than one role or database.",
    );
  }

  // ::add-mask:: is a GitHub Actions instruction and nothing else understands
  // it. Printing it anywhere else writes the connection string - password and
  // all - straight into the log, which is exactly what happened on 2026-10-17
  // the first time this ran locally. So it is only ever emitted inside
  // Actions, and the string is never printed by any other path.
  if (process.env.GITHUB_ACTIONS === "true") {
    console.log(`::add-mask::${uri}`);
  }
  console.log(
    `Created branch ${name} from ${parent ? parent.name : "the default branch"}.`,
  );

  if (process.env.GITHUB_OUTPUT) {
    fsAppend(process.env.GITHUB_OUTPUT, `database_url=${uri}\n`);
    fsAppend(process.env.GITHUB_OUTPUT, `branch_name=${name}\n`);
  } else {
    console.log(
      "Not running in GitHub Actions, so the connection string is not printed.",
    );
  }
}

function fsAppend(file, line) {
  require("node:fs").appendFileSync(file, line);
}

async function list() {
  const branches = await listBranches();
  console.log(`${branches.length} of ${BRANCH_LIMIT} branches used:`);
  for (const branch of branches) {
    const tag =
      branch.default || branch.primary ? "  (default - the live site)" : "";
    console.log(`  ${branch.name}${tag}`);
  }
  if (branches.length >= BRANCH_LIMIT) {
    console.log(
      "\nAt the limit. The next pull request will fail to create one.",
    );
  }
}

const [action, name] = process.argv.slice(2);

const actions = {
  create: () => {
    if (!name)
      throw new Error("Usage: node scripts/neon-branch.js create <name>");
    return create(name);
  },
  delete: () => {
    if (!name)
      throw new Error("Usage: node scripts/neon-branch.js delete <name>");
    return removeBranch(name);
  },
  list,
};

if (!actions[action]) {
  console.error(
    "Usage: node scripts/neon-branch.js <create|delete|list> [name]",
  );
  process.exit(1);
}

actions[action]().catch((error) => {
  console.error(`\n${error.message}\n`);
  process.exit(1);
});
