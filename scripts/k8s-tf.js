#!/usr/bin/env node

// Strict mode for the whole file.
"use strict";

// The Terraform path to the local kind cluster: npm run k8s:tf:up, k8s:tf:down,
// and k8s:tf:full (up, the whole suite, then down).
//
// Terraform (terraform/) owns the cluster, the image load and the manifests.
// Building the image stays out here, because Terraform can only learn an image's
// identity after the build, and it needs that identity at plan time to decide
// whether anything changed.
//
// So the tag is taken from the built image's content ID. Docker's build cache
// makes an unchanged working tree produce the same ID, hence the same tag, and
// `apply` reports no changes. A code change produces a new ID, a new tag, a
// changed Deployment spec and a real rollout - no `rollout restart` needed, which
// is the workaround npm run k8s:deploy has to use with its fixed :local tag.

// Files, the temp folder, paths, and running commands.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
// Finding the binary, with the winget fallback, lives in terraform-bin.js so
// scripts/github-tf.js uses the same one.
const { findTerraform, onPath } = require("./terraform-bin");

// Every Terraform command runs inside terraform/.
const TF = `${findTerraform()} -chdir=terraform`;
// The app image's name.
const IMAGE = "agents-playground";

// The kind provider writes the cluster's admin kubeconfig here on apply and
// leaves it behind on destroy. It is gitignored, but credentials for a cluster
// that no longer exists have no reason to stay on disk.
const KUBECONFIG_FILE = path.join(
  __dirname,
  "..",
  "terraform",
  "agents-playground-config",
);

// A failed step throws rather than calling process.exit, because process.exit
// skips `finally` - and full() depends on its teardown running after any failure.
class StepError extends Error {
  // The message, plus the exit code.
  constructor(message, exitCode) {
    super(message);
    this.exitCode = exitCode;
  }
}

// One command string with shell: true, for the reasons scripts/k8s-test.js
// records: Node refuses to spawn a Windows .cmd shim without a shell, and an args
// array alongside shell: true raises DEP0190. Every command is built from
// constants here plus a tag checked against a hex pattern below.
function run(command) {
  // Show the command first.
  console.log(`\n> ${command}\n`);

  // Run it, printing its output as it goes.
  const result = spawnSync(command, { stdio: "inherit", shell: true });

  // It could not start: fail with the reason.
  if (result.error) {
    throw new StepError(
      `Failed to run: ${command}\n${result.error.message}`,
      1,
    );
  }

  // It failed: fail with its exit code.
  if (result.status !== 0) {
    throw new StepError(
      `Failed (exit ${result.status}): ${command}`,
      result.status === null ? 1 : result.status,
    );
  }
}

// Run a command quietly and return what it printed; a failure throws.
function read(command) {
  const result = spawnSync(command, { shell: true, encoding: "utf8" });

  // It failed or could not start: fail with its error text.
  if (result.error || result.status !== 0) {
    throw new StepError(`Failed to run: ${command}\n${result.stderr || ""}`, 1);
  }

  // What it printed.
  return result.stdout.trim();
}

// Every up after a code change builds a new tag, and Docker never deletes an
// image by itself, so without this each run would leave another ~700 MB image
// behind. Nothing on the host needs the old ones: `kind load` gave the node its
// own copy of the image it runs. A failed removal only warns, so it never turns
// a successful apply or destroy into a failure.
function removeImages(keep) {
  // The tags of this app's images, minus the ones to keep. Only valid tag names
  // pass, because they go into a command.
  const tags = read(`docker images ${IMAGE} --format "{{.Tag}}"`)
    .split(/\r?\n/)
    .filter((t) => /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$/.test(t))
    .filter((t) => !keep.includes(t));

  // Nothing to remove.
  if (tags.length === 0) {
    return;
  }

  // Remove them all in one command, shown first.
  const command = `docker rmi ${tags.map((t) => `${IMAGE}:${t}`).join(" ")}`;
  console.log(`\n> ${command}\n`);

  // Run it.
  const result = spawnSync(command, { stdio: "inherit", shell: true });

  // A failed removal only warns.
  if (result.error || result.status !== 0) {
    console.warn(
      `\nCould not remove old ${IMAGE} images. List them with: docker images ${IMAGE}\n`,
    );
  }
}

// Build the app image, tag it by its content, and apply Terraform with that
// tag.
function up() {
  // --provenance/--sbom off, as in k8s-canary.yml: buildx otherwise emits an OCI
  // index that some kind versions decline to load.
  run(`docker build --provenance=false --sbom=false -t ${IMAGE}:local .`);

  // The image's content ID, cut to a 12-character tag.
  const id = read(`docker image inspect ${IMAGE}:local --format "{{.Id}}"`);
  const tag = id.replace(/^sha256:/, "").slice(0, 12);

  // Anything but 12 hex characters is refused, because the tag goes into
  // commands.
  if (!/^[0-9a-f]{12}$/.test(tag)) {
    throw new StepError(`Unexpected image ID from docker: ${id}`, 1);
  }

  // Tag the image, then let Terraform create or update the cluster with it.
  run(`docker tag ${IMAGE}:local ${IMAGE}:${tag}`);
  run(`${TF} init -input=false`);
  run(`${TF} apply -input=false -auto-approve -var image_tag=${tag}`);

  // Keep only the image the cluster now runs (the same image as :local).
  removeImages([tag, "local"]);
}

// Not `terraform destroy`: its plan prints every attribute it removes, and
// tehcyx/kind does not mark the cluster's credentials sensitive, so the admin
// private key and kubeconfig would be printed on every down - and, once CI uses
// this, into public workflow logs. Instead the destroy is planned with its output
// captured, only the one-line summary is shown, and the saved plan is applied,
// which prints progress lines but never the diff. The plan file holds the same
// credentials, so it lives in the temp folder and is always deleted.
//
// up needs no such care: a new cluster's credentials only exist after apply, so
// its plan shows them as "(known after apply)".
function destroyQuietly() {
  // The plan file, in the temp folder, named for this process.
  const planFile = path.join(
    os.tmpdir(),
    `agents-playground-destroy-${process.pid}.tfplan`,
  );

  // The plan file is deleted at the end, even after an error.
  try {
    // Plan the destroy with its output captured, and keep only the summary
    // line.
    const plan = read(
      `${TF} plan -destroy -input=false -no-color -out="${planFile}"`,
    );
    const summary = plan
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => /^(Plan:|No changes\.)/.test(line));

    // Show only that line.
    console.log(`\n${summary || "Destroy planned."}\n`);

    // Nothing to destroy: stop here.
    if (summary && summary.startsWith("No changes.")) {
      return;
    }

    // Apply the saved plan, which prints progress but never the diff.
    run(`${TF} apply -input=false "${planFile}"`);
  } finally {
    fs.rmSync(planFile, { force: true });
  }
}

// Tear the cluster down, then remove its images and its kubeconfig.
function down() {
  // init first so down also works from a fresh clone, where .terraform/ is
  // missing but a cluster from an earlier session may still be running.
  run(`${TF} init -input=false`);
  destroyQuietly();

  // Delete what the run made: the cluster (above), its app images and its
  // kubeconfig. Keep the cache - the kindest/node image and terraform/.terraform
  // are identical on every run, so deleting them would only make the next up
  // download about 1.4 GB again.
  removeImages([]);
  fs.rmSync(KUBECONFIG_FILE, { force: true });
}

// npm run k8s:tf:full: up, the whole Playwright suite, then down. Teardown runs
// however the first two end - a failed test, or an up that broke halfway - so
// nothing is ever left running, and the command still fails if anything did.
function full() {
  // The first error, if any.
  let failure = null;

  // Build and test; an error is kept for later.
  try {
    up();
    run("npm run k8s:test:full");
  } catch (error) {
    failure = error;
  }

  // Tear down whatever happened; a failed teardown says how to finish it.
  try {
    down();
  } catch (error) {
    console.error(
      "\nTeardown failed, so the cluster may still be running. Run: npm run k8s:tf:down\n",
    );
    failure = failure || error;
  }

  // Fail with the first error, after the teardown.
  if (failure) {
    throw failure;
  }
}

// npm run k8s:tf:check: the Terraform half of a pre-push check, so a formatting
// slip, a lock file left behind by a version bump, or a guard that no longer
// holds is caught here rather than on the PR. It is the same sequence
// terraform-validate.yml runs, minus the lock-platform check, which asks the
// registry for checksums and belongs on the runner.
//
// Nothing here creates a cluster or reads state: -backend=false, and the tests
// in terraform/tests/ run against mocked providers.
function check() {
  // Formatting, a set-up with no state, validation, and the guard tests.
  run(`${TF} fmt -recursive -check -diff`);
  run(`${TF} init -backend=false -input=false -lockfile=readonly`);
  run(`${TF} validate`);
  run(`${TF} test`);

  // TFLint is installed on the runner and rarely on a laptop. Skipping it here
  // costs only its style rules, and the PR check still runs them.
  if (onPath("tflint")) {
    run("tflint --chdir=terraform --format=compact");
  } else {
    console.log(
      "\nTFLint is not on PATH, so it was skipped. The PR check runs it.\n",
    );
  }
}

// The four commands.
const actions = { up, down, full, check };
// The one named on the command line.
const action = actions[process.argv[2]];

// An unknown command: show how to run it and stop.
if (!action) {
  console.error("Usage: node scripts/k8s-tf.js <up|down|full|check>");
  process.exit(1);
}

// Run it; a failed step prints its message and stops with its exit code.
try {
  action();
} catch (error) {
  console.error(`\n${error.message}\n`);
  process.exit(error.exitCode || 1);
}
