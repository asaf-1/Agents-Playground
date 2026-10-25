#!/usr/bin/env node

"use strict";

// GitHub settings as code: npm run github:tf:check, github:tf:plan and
// github:tf:apply drive terraform-github/, the folder that holds this
// repository's settings on GitHub - the ruleset on main, the labels, the
// description and topics, and which merge buttons exist.
//
// Unlike scripts/k8s-tf.js, nothing here builds anything on this machine, and
// there is no teardown: a destroy would delete the repository, which is why
// main.tf carries prevent_destroy and this script has no `down`.
//
// The state lives in HCP Terraform (workspace agents-playground-github, local
// execution mode), so plan and apply need the login `terraform login` writes
// and the GitHub token from TF_VAR_github_token. check needs neither: it is the
// same sequence terraform-validate.yml runs, with -backend=false and a mocked
// provider.

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { findTerraform, onPath } = require("./terraform-bin");

const DIR = "terraform-github";
const TF = `${findTerraform()} -chdir=${DIR}`;

class StepError extends Error {
  constructor(message, exitCode) {
    super(message);
    this.exitCode = exitCode;
  }
}

// One command string with shell: true, as scripts/k8s-tf.js explains: Node
// refuses to spawn a Windows .cmd shim without a shell. Every command is built
// from constants in this file; nothing from the environment or the command
// line is interpolated into one.
function run(command) {
  console.log(`\n> ${command}\n`);

  const result = spawnSync(command, { stdio: "inherit", shell: true });

  if (result.error) {
    throw new StepError(
      `Failed to run: ${command}\n${result.error.message}`,
      1,
    );
  }

  if (result.status !== 0) {
    throw new StepError(
      `Failed (exit ${result.status}): ${command}`,
      result.status === null ? 1 : result.status,
    );
  }
}

// The token is read by Terraform itself from TF_VAR_github_token. This only
// checks it is there, so a missing one fails with a sentence instead of a 401
// from GitHub halfway through a plan. The value is never printed.
function requireToken() {
  if (!process.env.TF_VAR_github_token) {
    throw new StepError(
      "TF_VAR_github_token is not set. Create a fine-grained GitHub token for this one repository (Administration and Issues, read and write), store it as a user environment variable named TF_VAR_github_token, and open a new terminal.",
      1,
    );
  }
}

// `terraform login` writes the HCP Terraform token here. Without it, init
// cannot reach the workspace that holds the state.
function requireHcpLogin() {
  const file =
    process.platform === "win32"
      ? path.join(
          process.env.APPDATA || os.homedir(),
          "terraform.d",
          "credentials.tfrc.json",
        )
      : path.join(os.homedir(), ".terraform.d", "credentials.tfrc.json");

  if (!fs.existsSync(file)) {
    throw new StepError(
      "No HCP Terraform login found. Run `terraform login` once: the state for terraform-github/ lives in HCP Terraform, organization Asaf-Platform.",
      1,
    );
  }
}

// npm run github:tf:check: the half of the PR check that needs no token and no
// state, so it runs on a laptop before a push and on the runner after one.
function check() {
  run(`${TF} fmt -check -diff`);
  run(`${TF} init -backend=false -input=false -lockfile=readonly`);
  run(`${TF} validate`);
  run(`${TF} test`);

  // TFLint is installed on the runner and rarely on a laptop. Skipping it here
  // costs only its style rules, and the PR check still runs them.
  if (onPath("tflint")) {
    run(`tflint --chdir=${DIR} --format=compact`);
  } else {
    console.log(
      "\nTFLint is not on PATH, so it was skipped. The PR check runs it.\n",
    );
  }
}

// npm run github:tf:plan: what Terraform would change on GitHub. The first ever
// plan reads "to import" for every resource and 0 to add, change or destroy;
// after that it reads "No changes" until the file is edited. Read it before
// every apply: a plan that destroys anything here is wrong.
function plan() {
  requireToken();
  requireHcpLogin();
  run(`${TF} init -input=false -lockfile=readonly`);
  run(`${TF} plan -input=false`);
}

// npm run github:tf:apply: plans again, shows the plan, and asks for "yes" in
// the terminal before touching GitHub. Deliberately not -auto-approve.
function apply() {
  requireToken();
  requireHcpLogin();
  run(`${TF} init -input=false -lockfile=readonly`);
  run(`${TF} apply`);
}

const actions = { check, plan, apply };
const action = actions[process.argv[2]];

if (!action) {
  console.error("Usage: node scripts/github-tf.js <check|plan|apply>");
  process.exit(1);
}

try {
  action();
} catch (error) {
  console.error(`\n${error.message}\n`);
  process.exit(error.exitCode || 1);
}
