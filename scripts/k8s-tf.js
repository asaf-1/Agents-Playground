#!/usr/bin/env node

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

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

// winget installs Terraform under %LOCALAPPDATA% and adds it to the user PATH,
// but only processes started afterwards see that PATH. A VS Code window that was
// already open keeps the old one, and every terminal it opens then fails with
// "'terraform' is not recognized". Falling back to the winget folder makes the
// script work without restarting the editor.
function findTerraform() {
  const name = process.platform === "win32" ? "terraform.exe" : "terraform";
  const onPath = (process.env.PATH || "")
    .split(path.delimiter)
    .some((dir) => dir && fs.existsSync(path.join(dir, name)));

  if (onPath) {
    return "terraform";
  }

  if (process.platform === "win32" && process.env.LOCALAPPDATA) {
    const packages = path.join(
      process.env.LOCALAPPDATA,
      "Microsoft",
      "WinGet",
      "Packages",
    );
    const folder =
      fs.existsSync(packages) &&
      fs
        .readdirSync(packages)
        .find((d) => d.startsWith("Hashicorp.Terraform_"));
    const exe = folder && path.join(packages, folder, name);

    if (exe && fs.existsSync(exe)) {
      return `"${exe}"`;
    }
  }

  console.error(
    "\nTerraform was not found. Install it with:\n  winget install Hashicorp.Terraform\n",
  );
  process.exit(1);
}

const TF = `${findTerraform()} -chdir=terraform`;
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

function read(command) {
  const result = spawnSync(command, { shell: true, encoding: "utf8" });

  if (result.error || result.status !== 0) {
    throw new StepError(`Failed to run: ${command}\n${result.stderr || ""}`, 1);
  }

  return result.stdout.trim();
}

// Every up after a code change builds a new tag, and Docker never deletes an
// image by itself, so without this each run would leave another ~700 MB image
// behind. Nothing on the host needs the old ones: `kind load` gave the node its
// own copy of the image it runs. A failed removal only warns, so it never turns
// a successful apply or destroy into a failure.
function removeImages(keep) {
  const tags = read(`docker images ${IMAGE} --format "{{.Tag}}"`)
    .split(/\r?\n/)
    .filter((t) => /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$/.test(t))
    .filter((t) => !keep.includes(t));

  if (tags.length === 0) {
    return;
  }

  const command = `docker rmi ${tags.map((t) => `${IMAGE}:${t}`).join(" ")}`;
  console.log(`\n> ${command}\n`);

  const result = spawnSync(command, { stdio: "inherit", shell: true });

  if (result.error || result.status !== 0) {
    console.warn(
      `\nCould not remove old ${IMAGE} images. List them with: docker images ${IMAGE}\n`,
    );
  }
}

function up() {
  // --provenance/--sbom off, as in k8s-canary.yml: buildx otherwise emits an OCI
  // index that some kind versions decline to load.
  run(`docker build --provenance=false --sbom=false -t ${IMAGE}:local .`);

  const id = read(`docker image inspect ${IMAGE}:local --format "{{.Id}}"`);
  const tag = id.replace(/^sha256:/, "").slice(0, 12);

  if (!/^[0-9a-f]{12}$/.test(tag)) {
    throw new StepError(`Unexpected image ID from docker: ${id}`, 1);
  }

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
  const planFile = path.join(
    os.tmpdir(),
    `agents-playground-destroy-${process.pid}.tfplan`,
  );

  try {
    const plan = read(
      `${TF} plan -destroy -input=false -no-color -out="${planFile}"`,
    );
    const summary = plan
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => /^(Plan:|No changes\.)/.test(line));

    console.log(`\n${summary || "Destroy planned."}\n`);

    if (summary && summary.startsWith("No changes.")) {
      return;
    }

    run(`${TF} apply -input=false "${planFile}"`);
  } finally {
    fs.rmSync(planFile, { force: true });
  }
}

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
  let failure = null;

  try {
    up();
    run("npm run k8s:test:full");
  } catch (error) {
    failure = error;
  }

  try {
    down();
  } catch (error) {
    console.error(
      "\nTeardown failed, so the cluster may still be running. Run: npm run k8s:tf:down\n",
    );
    failure = failure || error;
  }

  if (failure) {
    throw failure;
  }
}

const actions = { up, down, full };
const action = actions[process.argv[2]];

if (!action) {
  console.error("Usage: node scripts/k8s-tf.js <up|down|full>");
  process.exit(1);
}

try {
  action();
} catch (error) {
  console.error(`\n${error.message}\n`);
  process.exit(error.exitCode || 1);
}
