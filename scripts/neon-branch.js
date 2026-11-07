#!/usr/bin/env node

// Strict mode for the whole file.
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

// Neon's API address.
const API = "https://console.neon.tech/api/v2";

// A name, not a password - it is in md/runbooks/neon-runbook.md.
const PROJECT_ID = process.env.NEON_PROJECT_ID || "flat-grass-65869466";

// The free plan allows 10 branches per project. Hitting that makes branch
// creation fail on a pull request that did nothing wrong, so the limit is
// checked before creating rather than discovered afterwards.
const BRANCH_LIMIT = 10;

// The Neon API key, from the environment only.
const key = process.env.NEON_API_KEY;

// No key: say why that can happen, and stop.
if (!key) {
  console.error(
    "\nNEON_API_KEY is not set. On a pull request from a fork GitHub withholds\n" +
      "secrets on purpose, and the workflow skips this job rather than failing.\n" +
      "Locally, see md/runbooks/neon-runbook.md for how the key is made.\n",
  );
  process.exit(1);
}

// Call Neon's API with the key and return its JSON answer; a failed call
// throws.
async function api(path, options = {}) {
  // Send the request with the key in its header.
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
      ...(options.headers || {}),
    },
  });

  // The answer's text.
  const text = await response.text();

  if (!response.ok) {
    // The body can echo back what was sent, so it is reported as-is only for
    // the status line; nothing here ever contains the key itself.
    throw new Error(
      `Neon API ${options.method || "GET"} ${path} failed: ${response.status} ${text.slice(0, 300)}`,
    );
  }

  // The answer as JSON, or an empty object when there is none.
  return text ? JSON.parse(text) : {};
}

// Every branch in the project.
async function listBranches() {
  const { branches } = await api(`/projects/${PROJECT_ID}/branches`);
  return branches || [];
}

// Neon answers a create or delete before the work has finished. Acting on a
// branch that is still being made fails in ways that read like a bad key, so
// every operation is waited out.
async function waitForOperations(operations, label) {
  // The ids of the operations to wait for.
  const pending = (operations || []).map((operation) => operation.id);

  // Wait for each one in turn.
  for (const id of pending) {
    // Ask every two seconds, up to 60 times.
    for (let attempt = 0; attempt < 60; attempt += 1) {
      // Its status now.
      const { operation } = await api(
        `/projects/${PROJECT_ID}/operations/${id}`,
      );

      // Finished: on to the next one.
      if (operation.status === "finished") break;

      // Failed: stop with an error.
      if (operation.status === "failed" || operation.status === "error") {
        throw new Error(
          `Neon ${label} failed: operation ${id} ${operation.status}`,
        );
      }

      // Still going: wait two seconds.
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
}

// Delete a branch by name. The default branch, which the live site runs on, is
// refused.
async function removeBranch(name, { quiet = false } = {}) {
  // The branch with that name.
  const branch = (await listBranches()).find((b) => b.name === name);

  // None: nothing to delete.
  if (!branch) {
    if (!quiet) console.log(`No branch named ${name}; nothing to delete.`);
    return false;
  }

  // Never the default branch.
  if (branch.default || branch.primary) {
    throw new Error(
      `Refusing to delete ${name}: it is the project's default branch, which is what the live site runs on.`,
    );
  }

  // Delete it, and wait until Neon has finished.
  const { operations } = await api(
    `/projects/${PROJECT_ID}/branches/${branch.id}`,
    { method: "DELETE" },
  );
  await waitForOperations(operations, "branch delete");
  console.log(`Deleted branch ${name} (${branch.id}).`);
  return true;
}

// Make a fresh copy of the default branch under this name, and hand its
// connection string to the workflow.
async function create(name) {
  // A re-run of the same pull request must get a clean copy, not whatever the
  // last run left behind.
  await removeBranch(name, { quiet: true });

  // The branches there are now.
  const branches = await listBranches();

  // At the free plan's limit: fail with the list of branches to clear.
  if (branches.length >= BRANCH_LIMIT) {
    throw new Error(
      `The project already has ${branches.length} branches and the free plan allows ${BRANCH_LIMIT}.\n` +
        `Left-over branches from earlier runs are the usual cause. They are:\n  ` +
        branches.map((b) => b.name).join("\n  ") +
        `\nDelete the ones that are not needed with: node scripts/neon-branch.js delete <name>`,
    );
  }

  // The default branch, which the copy is made from.
  const parent = branches.find((b) => b.default || b.primary);

  // Create the branch with a read-write endpoint.
  const result = await api(`/projects/${PROJECT_ID}/branches`, {
    method: "POST",
    body: JSON.stringify({
      branch: { name, parent_id: parent ? parent.id : undefined },
      endpoints: [{ type: "read_write" }],
    }),
  });

  // Wait until it is ready.
  await waitForOperations(result.operations, "branch create");

  // Its connection string.
  const uri = (result.connection_uris || [])[0]?.connection_uri;

  // None came back: fail with the likely cause.
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

  // In Actions, hand the connection string and the branch name to the next
  // steps; it is never printed.
  if (process.env.GITHUB_OUTPUT) {
    fsAppend(process.env.GITHUB_OUTPUT, `database_url=${uri}\n`);
    fsAppend(process.env.GITHUB_OUTPUT, `branch_name=${name}\n`);
  } else {
    console.log(
      "Not running in GitHub Actions, so the connection string is not printed.",
    );
  }
}

// Add a line to a file.
function fsAppend(file, line) {
  require("node:fs").appendFileSync(file, line);
}

// Print the branches and how much of the limit they use.
async function list() {
  // The branches, with the count.
  const branches = await listBranches();
  console.log(`${branches.length} of ${BRANCH_LIMIT} branches used:`);
  // One line per branch; the default one is marked.
  for (const branch of branches) {
    const tag =
      branch.default || branch.primary ? "  (default - the live site)" : "";
    console.log(`  ${branch.name}${tag}`);
  }
  // At the limit: warn that the next pull request will fail.
  if (branches.length >= BRANCH_LIMIT) {
    console.log(
      "\nAt the limit. The next pull request will fail to create one.",
    );
  }
}

// The command and the branch name from the command line.
const [action, name] = process.argv.slice(2);

// The three commands; create and delete need a name.
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

// An unknown command: show how to run it and stop.
if (!actions[action]) {
  console.error(
    "Usage: node scripts/neon-branch.js <create|delete|list> [name]",
  );
  process.exit(1);
}

// Run it; an error prints its message and fails.
actions[action]().catch((error) => {
  console.error(`\n${error.message}\n`);
  process.exit(1);
});
