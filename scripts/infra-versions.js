// Keeps the pinned infra tools current, and in line with each other.
//
// Every version is read from the tool's own official source: the npm registry,
// nodejs.org, releases.hashicorp.com, the project's GitHub releases and its
// image registry. A release counts only once it is COOLDOWN_DAYS old, the same
// wait Dependabot uses, because a bad or tampered release is usually pulled
// within days. A version always moves with its checksum or digest, and
// partners move together: the Playwright package with its Docker image, the
// kind CLI with the kind inside the tehcyx/kind provider, and every copy of
// Node and of Terraform's version at once.
//
// Usage:
//   node scripts/infra-versions.js check [--offline]
//       Exit 1 when pinned copies disagree, or (online) a pinned checksum is
//       not the one the tool publishes.
//   node scripts/infra-versions.js report
//       What is out of date, plus the report-only list. Never fails.
//   node scripts/infra-versions.js update [--dry-run] [--summary-file <path>]
//       Apply the updates. --dry-run prints them and changes nothing.
//
// Never changed, only reported: .github/workflows/pr-validation.yml (kept by
// hand), @axe-core/playwright (pinned on purpose), npm major versions, GitHub
// Actions versions, the vendored ingress-nginx manifest, and the tools on this
// PC. Terraform providers stay with Dependabot; this script only checks that
// the kind CLI still matches the provider.

"use strict";

// Files, paths, and running commands.
const fs = require("node:fs");
const path = require("node:path");
const { execSync } = require("node:child_process");

// The repo's root folder.
const ROOT = path.resolve(__dirname, "..");
// How many days old a release must be before it counts.
const COOLDOWN_DAYS = 7;
const DAY_MS = 86_400_000;

// Every file this script reads or edits.
const FILES = {
  pkg: "package.json",
  lock: "package-lock.json",
  e2eDocker: "Dockerfile.e2e",
  appDocker: "Dockerfile",
  runnerDocker: "test-runner/Dockerfile",
  workflows: ".github/workflows",
  tfValidate: ".github/workflows/terraform-validate.yml",
  k8sCanary: ".github/workflows/k8s-canary.yml",
  infraScan: ".github/workflows/infra-scan.yml",
  securityScan: ".github/workflows/security-scan.yml",
  tfVersions: ["terraform/versions.tf", "terraform-github/versions.tf"],
  tfLock: "terraform/.terraform.lock.hcl",
  ingress: "ingress-nginx/VERSION.md",
  // Current-state docs that name the Playwright version.
  playwrightDocs: [
    "README.md",
    "docs/repo-guide.md",
    "obsidian-vault/09 Infrastructure and CI Map.md",
  ],
};

// Kept by hand; reported, never edited.
const HAND_MAINTAINED = [".github/workflows/pr-validation.yml"];

// Pinned on purpose, with the reason the report gives.
const PINNED_ON_PURPOSE = {
  "@axe-core/playwright":
    "pinned on purpose: a newer axe changes the accessibility tests' results",
};

// Moved by the Playwright step, together with its Docker image.
const PLAYWRIGHT_PACKAGES = ["@playwright/test", "playwright"];

// --- Versions ---------------------------------------------------------------

function parseVersion(value) {
  const m = String(value ?? "")
    .trim()
    .replace(/^v/, "")
    .match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/);
  if (!m) return null;
  return { major: +m[1], minor: +m[2], patch: +m[3], pre: m[4] || "" };
}

// Which of two versions is newer: negative, zero or positive.
function compareVersions(a, b) {
  // Parse both; text that is not a version compares as text.
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (!pa || !pb) return String(a).localeCompare(String(b));
  for (const key of ["major", "minor", "patch"]) {
    if (pa[key] !== pb[key]) return pa[key] - pb[key];
  }
  if (pa.pre === pb.pre) return 0;
  if (!pa.pre) return 1; // a release sorts above its pre-releases
  if (!pb.pre) return -1;
  return pa.pre.localeCompare(pb.pre);
}

// A plain release, not a pre-release.
function isStable(value) {
  const p = parseVersion(value);
  return Boolean(p) && !p.pre;
}

// The newest stable release that is at least `days` old at `now`, among those
// `allow` accepts. Releases are { version, date }.
function pickNewest(
  releases,
  { now = Date.now(), days = COOLDOWN_DAYS, allow = () => true } = {},
) {
  // Stable releases older than the wait that `allow` accepts, newest first.
  const cutoff = now - days * DAY_MS;
  return (
    releases
      .filter(
        (r) =>
          isStable(r.version) &&
          Date.parse(r.date) <= cutoff &&
          allow(r.version),
      )
      .sort((a, b) => compareVersions(b.version, a.version))[0] || null
  );
}

// What a caret range (^1.2.3, ^0.5.8) lets npm move to: the same major, or
// for 0.x the same minor.
function caretAllows(current, candidate) {
  const c = parseVersion(current);
  const n = parseVersion(candidate);
  if (!c || !n || n.pre) return false;
  if (compareVersions(candidate, current) <= 0) return false;
  if (c.major > 0) return n.major === c.major;
  return n.major === 0 && n.minor === c.minor;
}

// Terraform's `~>`: "~> 1.16" is >= 1.16 and < 2.0; "~> 0.13.0" is >= 0.13.0
// and < 0.14.0.
function satisfiesPessimistic(version, constraint) {
  // The constraint's numbers, and the version's.
  const m = String(constraint).match(/~>\s*(\d+)\.(\d+)(?:\.(\d+))?/);
  const v = parseVersion(version);
  if (!m || !v) return false;
  const [maj, min, pat] = [+m[1], +m[2], m[3] === undefined ? null : +m[3]];
  if (pat === null) {
    return v.major === maj && v.minor >= min;
  }
  return v.major === maj && v.minor === min && v.patch >= pat;
}

// --- Text edits -------------------------------------------------------------

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// `NAME: value` in a workflow's env block.
function getEnv(text, name) {
  const m = text.match(new RegExp(`^\\s*${name}:\\s*(\\S+)\\s*$`, "m"));
  return m ? m[1] : null;
}

// Set `NAME: value` in a workflow's env block; a missing name is an error.
function setEnv(text, name, value) {
  const re = new RegExp(`^(\\s*${name}:\\s*)(\\S+)(\\s*)$`, "m");
  if (!re.test(text)) throw new Error(`${name} is not set in this file`);
  return text.replace(re, (_, head, _old, tail) => `${head}${value}${tail}`);
}

// Every `node-version: N` in a workflow.
function nodeVersionsIn(text) {
  return [...text.matchAll(/node-version:\s*["']?(\d+)["']?/g)].map(
    (m) => +m[1],
  );
}

// Change every `node-version:` with the old number to the new one.
function setNodeVersion(text, from, to) {
  return text.replace(
    new RegExp(`(node-version:\\s*["']?)${from}(?=["']?\\s*$)`, "gm"),
    `$1${to}`,
  );
}

// A version as a whole number, not part of a longer one: 0.74.0 matches in
// "trivy_0.74.0_Linux" and "v0.74.0", never in "10.74.0" or "0.74.01".
function versionPattern(version, flags = "g") {
  return new RegExp(`(?<![\\d.])${escapeRegExp(version)}(?!\\d|\\.\\d)`, flags);
}

// Replace a version everywhere it stands on its own in a file: the values and
// the comments that name them.
function replaceVersion(text, from, to) {
  return text.replace(versionPattern(from), to);
}

// --- Reading the pins -------------------------------------------------------

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

// Write a file, from the repo root.
function write(rel, text) {
  fs.writeFileSync(path.join(ROOT, rel), text);
}

// Every workflow file, sorted.
function workflowFiles() {
  return fs
    .readdirSync(path.join(ROOT, FILES.workflows))
    .filter((f) => /\.ya?ml$/.test(f))
    .sort()
    .map((f) => `${FILES.workflows}/${f}`);
}

// Every pinned version, read from the files that hold it.
function readPins() {
  // package.json, its lock file, and a package's installed version.
  const pkg = JSON.parse(read(FILES.pkg));
  const lock = JSON.parse(read(FILES.lock));
  const installed = (name) => lock.packages?.[`node_modules/${name}`]?.version;

  // The Playwright image in Dockerfile.e2e: version, distro and digest.
  const e2e = read(FILES.e2eDocker).match(
    /^FROM mcr\.microsoft\.com\/playwright:v(\S+?)-(\w+)@(sha256:[0-9a-f]{64})/m,
  );

  // Every copy of Node's major version: the workflows, then the two
  // Dockerfiles.
  const nodeCopies = [];
  for (const file of workflowFiles()) {
    for (const major of nodeVersionsIn(read(file))) {
      nodeCopies.push({ file, major, kind: "workflow" });
    }
  }
  const appNode = read(FILES.appDocker).match(
    /^FROM node:(\d+)-bookworm-slim/m,
  );
  // The app's Dockerfile.
  if (appNode) {
    nodeCopies.push({
      file: FILES.appDocker,
      major: +appNode[1],
      kind: "docker",
    });
  }
  const runnerNode = read(FILES.runnerDocker).match(/^FROM node:(\d+)-alpine/m);
  // The runner's Dockerfile.
  if (runnerNode) {
    nodeCopies.push({
      file: FILES.runnerDocker,
      major: +runnerNode[1],
      kind: "docker",
    });
  }

  // The tehcyx/kind provider's version, from the lock file.
  const tfLock = read(FILES.tfLock);
  const provider = tfLock.match(
    /provider "registry\.terraform\.io\/tehcyx\/kind" \{\s*version\s*=\s*"([^"]+)"/,
  );

  // Every npm package with its range and installed version.
  const npm = [];
  for (const section of ["dependencies", "devDependencies"]) {
    for (const [name, range] of Object.entries(pkg[section] || {})) {
      npm.push({ name, section, range, installed: installed(name) });
    }
  }

  // Every GitHub Action used, by repo and major version, with the files that
  // use it.
  const actions = new Map();
  for (const file of workflowFiles()) {
    for (const m of read(file).matchAll(
      /uses:\s*([\w.-]+\/[\w.-]+)@v(\d+)\b/g,
    )) {
      const key = `${m[1]}@v${m[2]}`;
      const entry = actions.get(key) || { repo: m[1], major: +m[2], files: [] };
      if (!entry.files.includes(file)) entry.files.push(file);
      actions.set(key, entry);
    }
  }

  // The ingress-nginx version named in its notes file, when there is one.
  const ingress = fs.existsSync(path.join(ROOT, FILES.ingress))
    ? read(FILES.ingress).match(/controller-v(\d+\.\d+\.\d+)/)
    : null;

  // Every pin, by tool.
  return {
    playwright: {
      range: {
        test: pkg.devDependencies?.["@playwright/test"],
        pw: pkg.devDependencies?.playwright,
      },
      lock: {
        test: installed("@playwright/test"),
        pw: installed("playwright"),
        core: installed("playwright-core"),
      },
      image: e2e ? { tag: e2e[1], flavor: e2e[2], digest: e2e[3] } : null,
    },
    node: nodeCopies,
    terraform: {
      copies: [FILES.tfValidate, FILES.k8sCanary].map((file) => ({
        file,
        version: getEnv(read(file), "TF_VERSION"),
      })),
      required: FILES.tfVersions.map((file) => ({
        file,
        constraint: (read(file).match(/required_version\s*=\s*"([^"]+)"/) ||
          [])[1],
      })),
    },
    kind: {
      version: getEnv(read(FILES.k8sCanary), "KIND_VERSION"),
      sha: getEnv(read(FILES.k8sCanary), "KIND_SHA256"),
      provider: provider ? provider[1] : null,
    },
    tflint: {
      version: getEnv(read(FILES.tfValidate), "TFLINT_VERSION"),
      sha: getEnv(read(FILES.tfValidate), "TFLINT_SHA256"),
    },
    trivy: {
      version: getEnv(read(FILES.infraScan), "TRIVY_VERSION"),
      sha: getEnv(read(FILES.infraScan), "TRIVY_SHA256"),
    },
    zap: {
      version: getEnv(read(FILES.securityScan), "ZAP_VERSION"),
      image: getEnv(read(FILES.securityScan), "ZAP_IMAGE"),
    },
    npm,
    actions: [...actions.values()],
    ingress: ingress ? ingress[1] : null,
  };
}

// --- Alignment (no network) -------------------------------------------------

const strip = (range) => String(range ?? "").replace(/^[\^~]/, "");

// Pinned copies that disagree. Hand-maintained files are left out here and
// listed by handMaintainedDrift instead, so they warn without failing.
function findDrift(pins) {
  // What disagrees.
  const problems = [];

  // Terraform: every TF_VERSION copy must be the same.
  const tf = pins.terraform.copies;
  const tfVersions = [...new Set(tf.map((c) => c.version))];
  if (tfVersions.length > 1) {
    problems.push(
      `Terraform: TF_VERSION differs: ${tf.map((c) => `${c.version} in ${c.file}`).join(", ")}.`,
    );
  }
  // And each must be inside every required_version.
  for (const copy of tf) {
    for (const req of pins.terraform.required) {
      if (
        req.constraint &&
        !satisfiesPessimistic(copy.version, req.constraint)
      ) {
        problems.push(
          `Terraform: TF_VERSION ${copy.version} (${copy.file}) is outside required_version "${req.constraint}" in ${req.file}.`,
        );
      }
    }
  }

  // Playwright: one version in the lock file.
  const pw = pins.playwright;
  const lockVersions = [...new Set([pw.lock.test, pw.lock.pw, pw.lock.core])];
  if (lockVersions.length > 1) {
    problems.push(
      `Playwright: package-lock.json mixes versions (@playwright/test ${pw.lock.test}, playwright ${pw.lock.pw}, playwright-core ${pw.lock.core}).`,
    );
  }
  // The same range for both packages.
  if (strip(pw.range.test) !== strip(pw.range.pw)) {
    problems.push(
      `Playwright: package.json asks for @playwright/test ${pw.range.test} but playwright ${pw.range.pw}.`,
    );
  }
  // A digest-pinned image whose version matches the package.
  if (!pw.image) {
    problems.push(
      `Playwright: ${FILES.e2eDocker} is not a digest-pinned Playwright image.`,
    );
  } else if (pw.image.tag !== pw.lock.test) {
    problems.push(
      `Playwright: ${FILES.e2eDocker} runs v${pw.image.tag} but package-lock.json has ${pw.lock.test}; the browsers in the image must match the package.`,
    );
  }

  // Node: one major everywhere except the hand-kept files.
  const managed = pins.node.filter((c) => !HAND_MAINTAINED.includes(c.file));
  const majors = [...new Set(managed.map((c) => c.major))];
  if (majors.length > 1) {
    const where = majors
      .map(
        (m) =>
          `${m} in ${[...new Set(managed.filter((c) => c.major === m).map((c) => c.file))].join(", ")}`,
      )
      .join("; ");
    problems.push(`Node: not one version everywhere: ${where}.`);
  }

  // Every tool's version and checksum must be set.
  for (const [name, value] of [
    ["KIND_VERSION", pins.kind.version],
    ["KIND_SHA256", pins.kind.sha],
    ["TFLINT_VERSION", pins.tflint.version],
    ["TFLINT_SHA256", pins.tflint.sha],
    ["TRIVY_VERSION", pins.trivy.version],
    ["TRIVY_SHA256", pins.trivy.sha],
    ["ZAP_VERSION", pins.zap.version],
    ["ZAP_IMAGE", pins.zap.image],
  ]) {
    if (!value) problems.push(`${name} is missing from its workflow.`);
  }

  // Everything that disagrees.
  return problems;
}

// Hand-maintained files whose Node differs from the rest.
function handMaintainedDrift(pins) {
  // The Node major most files use, and the hand-kept files that differ from it,
  // each once.
  const managed = pins.node.filter((c) => !HAND_MAINTAINED.includes(c.file));
  const main = mostCommon(managed.map((c) => c.major));
  return pins.node
    .filter((c) => HAND_MAINTAINED.includes(c.file) && c.major !== main)
    .map(
      (c) =>
        `${c.file} runs Node ${c.major}, the rest Node ${main}: change it by hand.`,
    )
    .filter((line, i, all) => all.indexOf(line) === i);
}

// The value that appears most often.
function mostCommon(values) {
  const counts = new Map();
  for (const v of values) counts.set(v, (counts.get(v) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
}

// --- Official sources (network) ---------------------------------------------

function githubToken() {
  // A token from the environment, else from gh; with none it still works, more
  // slowly.
  if (process.env.GH_TOKEN) return process.env.GH_TOKEN;
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  try {
    return execSync("gh auth token", {
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8",
    }).trim();
  } catch {
    return ""; // unauthenticated still works, at 60 GitHub calls an hour
  }
}

// The token, read once.
let ghTokenCache;
// The headers for GitHub's API, with the token when there is one.
function githubHeaders() {
  if (ghTokenCache === undefined) ghTokenCache = githubToken();
  return {
    Accept: "application/vnd.github+json",
    "User-Agent": "agents-playground-infra-versions",
    ...(ghTokenCache ? { Authorization: `Bearer ${ghTokenCache}` } : {}),
  };
}

// Fetch a URL, trying three times with a growing pause; a 404 is returned, not
// retried.
async function fetchOk(url, options = {}) {
  // The last error, if every try fails.
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, { redirect: "follow", ...options });
      if (response.ok || response.status === 404) return response;
      lastError = new Error(`${response.status} from ${url}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((r) => setTimeout(r, attempt * 1000));
  }
  throw lastError;
}

// Fetch JSON; anything but OK is an error.
async function getJson(url, headers = {}) {
  const response = await fetchOk(url, { headers });
  if (!response.ok) throw new Error(`${response.status} from ${url}`);
  return response.json();
}

// Fetch text; anything but OK is an error.
async function getText(url) {
  const response = await fetchOk(url);
  if (!response.ok) throw new Error(`${response.status} from ${url}`);
  return response.text();
}

// A GitHub repo's releases, without drafts or pre-releases, each with its
// version and date.
async function githubReleases(repo) {
  const data = await getJson(
    `https://api.github.com/repos/${repo}/releases?per_page=100`,
    githubHeaders(),
  );
  return data
    .filter((r) => !r.draft && !r.prerelease)
    .map((r) => ({
      tag: r.tag_name,
      version: r.tag_name.replace(/^[^\d]*/, ""),
      date: r.published_at,
    }));
}

// A package's versions on npm with their dates, deprecated ones left out.
async function npmReleases(name) {
  const data = await getJson(
    `https://registry.npmjs.org/${name.replace("/", "%2F")}`,
    { Accept: "application/json" },
  );
  return Object.entries(data.time || {})
    .filter(
      ([version]) =>
        data.versions?.[version] && !data.versions[version].deprecated,
    )
    .map(([version, date]) => ({ version, date }));
}

// Each LTS major with the date its first LTS release came out.
async function nodeLtsMajors() {
  // Node's release list, and each LTS major found in it.
  const data = await getJson("https://nodejs.org/dist/index.json");
  const majors = new Map();
  // Each LTS release: keep its major's newest version and earliest date.
  for (const release of data) {
    if (!release.lts) continue;
    const major = parseVersion(release.version).major;
    const entry = majors.get(major) || {
      major,
      newest: release.version,
      since: release.date,
    };
    if (compareVersions(release.version, entry.newest) > 0)
      entry.newest = release.version;
    if (release.date < entry.since) entry.since = release.date;
    majors.set(major, entry);
  }
  return [...majors.values()];
}

// Terraform's releases from HashiCorp, without pre-releases, each with its
// date.
async function terraformReleases() {
  const data = await getJson(
    "https://api.releases.hashicorp.com/v1/releases/terraform?limit=20",
  );
  return data
    .filter((r) => !r.is_prerelease)
    .map((r) => ({ version: r.version, date: r.timestamp_created }));
}

// The kind library a tehcyx/kind release is built on, from its own go.mod.
async function providerKind(providerVersion) {
  // The provider's go.mod for that release, and the kind version in it.
  const goMod = await getText(
    `https://raw.githubusercontent.com/tehcyx/terraform-provider-kind/v${providerVersion}/go.mod`,
  );
  const m = goMod.match(/sigs\.k8s\.io\/kind\s+(v\d+\.\d+\.\d+)/);
  // None: an error.
  if (!m)
    throw new Error(
      `no sigs.k8s.io/kind in tehcyx/kind v${providerVersion} go.mod`,
    );
  return m[1];
}

// The kind CLI's published SHA256 for Linux.
async function kindSha(version) {
  const text = await getText(
    `https://github.com/kubernetes-sigs/kind/releases/download/${version}/kind-linux-amd64.sha256sum`,
  );
  return text.trim().split(/\s+/)[0];
}

// A file's SHA256 from a checksums file of "sha name" lines.
function shaFromChecksums(text, fileName) {
  // The line for that file.
  const line = text
    .split(/\r?\n/)
    .find(
      (l) =>
        l.trim().endsWith(` ${fileName}`) || l.trim().endsWith(`*${fileName}`),
    );
  if (!line) throw new Error(`${fileName} is not in the checksums file`);
  return line.trim().split(/\s+/)[0];
}

// TFLint's published SHA256 for its Linux zip.
async function tflintSha(version) {
  const text = await getText(
    `https://github.com/terraform-linters/tflint/releases/download/${version}/checksums.txt`,
  );
  return shaFromChecksums(text, "tflint_linux_amd64.zip");
}

// Trivy's published SHA256 for its Linux archive.
async function trivySha(version) {
  const text = await getText(
    `https://github.com/aquasecurity/trivy/releases/download/v${version}/trivy_${version}_checksums.txt`,
  );
  return shaFromChecksums(text, `trivy_${version}_Linux-64bit.tar.gz`);
}

// The manifest types asked for: a multi-platform index.
const MANIFEST_TYPES = [
  "application/vnd.oci.image.index.v1+json",
  "application/vnd.docker.distribution.manifest.list.v2+json",
].join(", ");

// The digest of a multi-platform image tag (the index, as both pins use).
async function registryDigest(registry, repo, tag, token) {
  // Ask the registry for the tag's manifest, headers only; the digest comes in
  // a header.
  const response = await fetchOk(
    `https://${registry}/v2/${repo}/manifests/${tag}`,
    {
      method: "HEAD",
      headers: {
        Accept: MANIFEST_TYPES,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    },
  );
  if (!response.ok) return null;
  return response.headers.get("docker-content-digest");
}

// A digest from GitHub's container registry, with the anonymous pull token it
// hands out.
async function ghcrDigest(repo, tag) {
  const { token } = await getJson(
    `https://ghcr.io/token?scope=repository:${repo}:pull`,
  );
  return registryDigest("ghcr.io", repo, tag, token);
}

// Whether Docker Hub has this tag of an official image.
async function dockerHubTagExists(repo, tag) {
  const response = await fetchOk(
    `https://hub.docker.com/v2/repositories/library/${repo}/tags/${tag}`,
  );
  return response.ok;
}

// Run fn on each item, at most `limit` at a time, keeping the results in order.
async function mapLimit(items, limit, fn) {
  // The results, and the next item to take.
  const results = new Array(items.length);
  let next = 0;
  // One worker: take the next item until none is left.
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  );
  return results;
}

// --- Online checks ----------------------------------------------------------

async function onlineChecks(pins) {
  // What is wrong. A check whose source cannot be read is listed too, and the
  // rest still run.
  const problems = [];
  const attempt = async (label, fn) => {
    try {
      await fn();
    } catch (error) {
      problems.push(
        `${label}: could not read the official source (${error.message}).`,
      );
    }
  };

  // kind: the CLI must match the kind inside the provider, and its checksum
  // must be the published one.
  await attempt("kind", async () => {
    if (!pins.kind.provider) return;
    const inside = await providerKind(pins.kind.provider);
    // The kind CLI matches the provider's.
    if (inside !== pins.kind.version) {
      problems.push(
        `kind: the canary's kind CLI is ${pins.kind.version}, but tehcyx/kind ${pins.kind.provider} is built on kind ${inside}.`,
      );
    }
    const official = await kindSha(pins.kind.version);
    // Its checksum is the published one.
    if (official !== pins.kind.sha) {
      problems.push(
        `kind: KIND_SHA256 is not the one kind publishes for ${pins.kind.version}.`,
      );
    }
  });
  await attempt("TFLint", async () => {
    // TFLint's checksum is the published one.
    if ((await tflintSha(pins.tflint.version)) !== pins.tflint.sha) {
      problems.push(
        `TFLint: TFLINT_SHA256 is not the one TFLint publishes for ${pins.tflint.version}.`,
      );
    }
  });
  await attempt("Trivy", async () => {
    // Trivy's checksum is the published one.
    if ((await trivySha(pins.trivy.version)) !== pins.trivy.sha) {
      problems.push(
        `Trivy: TRIVY_SHA256 is not the one Trivy publishes for ${pins.trivy.version}.`,
      );
    }
  });
  return problems;
}

// --- Planning ---------------------------------------------------------------

// A change: { tool, from, to, detail, edits: [{ file, apply(text) }], npm }.
async function planUpdates(pins, { now = Date.now() } = {}) {
  // The changes to make, what is already current, what is only reported, notes,
  // and errors.
  const changes = [];
  const current = []; // tools already on their newest eligible version
  const reportOnly = [];
  const notes = [];
  const errors = [];
  const cooldown = { now };

  // Plan one tool; a source that cannot be read becomes an error line, and the
  // rest go on.
  const step = async (label, fn) => {
    try {
      await fn();
    } catch (error) {
      errors.push(
        `${label}: could not read the official source (${error.message}).`,
      );
    }
  };

  // Playwright: the package, its Docker image and the docs that name it.
  await step("Playwright", async () => {
    // The installed version, and the newest release past the wait.
    const have = pins.playwright.lock.test;
    const pick = pickNewest(await npmReleases("@playwright/test"), {
      ...cooldown,
      allow: (v) => compareVersions(v, have) >= 0,
    });
    // Nothing newer: current.
    if (!pick || compareVersions(pick.version, have) <= 0) {
      current.push(`Playwright ${have}`);
      return;
    }
    const to = pick.version;
    const flavor = pins.playwright.image?.flavor || "noble";
    const digest = await registryDigest(
      "mcr.microsoft.com",
      "playwright",
      `v${to}-${flavor}`,
    );
    // Its Docker image is not published yet: both wait.
    if (!digest) {
      notes.push(
        `Playwright ${to} is out, but its Docker image v${to}-${flavor} is not published yet, so both wait.`,
      );
      return;
    }
    const mm = (v) => v.split(".").slice(0, 2).join(".");
    const edits = [
      {
        file: FILES.e2eDocker,
        apply: (t) =>
          t.replace(
            /^FROM mcr\.microsoft\.com\/playwright:v\S+?-\w+@sha256:[0-9a-f]{64}/m,
            `FROM mcr.microsoft.com/playwright:v${to}-${flavor}@${digest}`,
          ),
      },
      ...FILES.playwrightDocs.map((file) => ({
        file,
        apply: (t) =>
          t
            .replaceAll(`playwright:v${have}-`, `playwright:v${to}-`)
            .replaceAll(`Playwright ${have}`, `Playwright ${to}`)
            .replaceAll(`Playwright-${mm(have)}-`, `Playwright-${mm(to)}-`)
            .replace(
              new RegExp(`Playwright ${escapeRegExp(mm(have))}(?![\\d.])`, "g"),
              `Playwright ${mm(to)}`,
            ),
      })),
    ];
    changes.push({
      tool: "Playwright",
      from: have,
      to,
      detail: `the package and ${FILES.e2eDocker} (v${to}-${flavor}, pinned by digest) together`,
      edits,
      npm: { dev: PLAYWRIGHT_PACKAGES.map((p) => `${p}@${to}`) },
    });
  });

  // Node: one LTS major in every managed copy. Planned before the npm packages,
  // because @types/node follows it.
  let nodeTo = null;
  await step("Node", async () => {
    // The managed copies, their major, and the newest LTS major past the wait.
    const managed = pins.node.filter((c) => !HAND_MAINTAINED.includes(c.file));
    const have = mostCommon(managed.map((c) => c.major));
    const cutoff = now - COOLDOWN_DAYS * DAY_MS;
    const eligible = (await nodeLtsMajors())
      .filter((m) => Date.parse(m.since) <= cutoff)
      .sort((a, b) => b.major - a.major)[0];
    // Nothing newer: current.
    if (!eligible || eligible.major <= have) {
      current.push(`Node ${have} (LTS)`);
      return;
    }
    const to = eligible.major;
    const tags = {
      [FILES.appDocker]: `${to}-bookworm-slim`,
      [FILES.runnerDocker]: `${to}-alpine`,
    };
    // Both Docker images must exist first.
    for (const tag of Object.values(tags)) {
      if (!(await dockerHubTagExists("node", tag))) {
        notes.push(
          `Node ${to} is LTS, but the Docker image node:${tag} is not on Docker Hub yet, so Node waits.`,
        );
        return;
      }
    }
    nodeTo = to;
    const files = [...new Set(managed.map((c) => c.file))];
    changes.push({
      tool: "Node",
      from: String(have),
      to: String(to),
      detail: `LTS since ${eligible.since}; ${files.length} files`,
      edits: files.map((file) => ({
        file,
        apply: (t) =>
          file === FILES.appDocker
            ? t.replace(
                /^FROM node:\d+-bookworm-slim/m,
                `FROM node:${tags[file]}`,
              )
            : file === FILES.runnerDocker
              ? t.replace(/^FROM node:\d+-alpine/m, `FROM node:${tags[file]}`)
              : setNodeVersion(t, have, to),
      })),
    });
  });

  // npm packages: minor and patch within each caret range; majors reported.
  // @types/node is the exception: it moves up to the major Node moves to.
  await step("npm packages", async () => {
    // Every installed package except Playwright's, which moves above.
    const candidates = pins.npm.filter(
      (p) => !PLAYWRIGHT_PACKAGES.includes(p.name) && p.installed,
    );
    // The packages pinned on purpose are only reported.
    for (const p of pins.npm.filter((x) => PINNED_ON_PURPOSE[x.name])) {
      reportOnly.push(
        `${p.name} ${p.installed}: ${PINNED_ON_PURPOSE[p.name]}.`,
      );
    }
    const results = await mapLimit(
      candidates.filter((p) => !PINNED_ON_PURPOSE[p.name]),
      6,
      async (p) => {
        // A package's newest minor or patch, and its newest major.
        try {
          // Its releases; @types/node may move to Node's new major.
          const releases = await npmReleases(p.name);
          const typesMajor =
            p.name === "@types/node" &&
            nodeTo &&
            nodeTo > parseVersion(p.installed)?.major
              ? nodeTo
              : null;
          const minor = pickNewest(releases, {
            ...cooldown,
            allow: typesMajor
              ? (v) => parseVersion(v)?.major === typesMajor
              : (v) => caretAllows(p.installed, v),
          });
          if (typesMajor && minor) return { p, minor, major: null };
          const major = pickNewest(releases, {
            ...cooldown,
            allow: (v) =>
              parseVersion(v)?.major > parseVersion(p.installed)?.major,
          });
          return { p, minor, major };
        } catch (error) {
          return { p, error };
        }
      },
    );
    const dev = [];
    const prod = [];
    const moved = [];
    // Sort the results into updates, majors to report, and errors.
    for (const { p, minor, major, error } of results) {
      // An error is listed, and the rest go on.
      if (error) {
        errors.push(`npm ${p.name}: ${error.message}`);
        continue;
      }
      // A minor or patch: install it.
      if (minor) {
        (p.section === "dependencies" ? prod : dev).push(
          `${p.name}@${minor.version}`,
        );
        moved.push({ name: p.name, from: p.installed, to: minor.version });
      }
      // A major: report only.
      if (major) {
        reportOnly.push(
          `npm ${p.name}: major ${major.version} is out (on ${p.installed}); a major can break the app, so it is left to a person.`,
        );
      }
    }
    // One npm change for every package that moved, or none.
    if (moved.length) {
      changes.push(npmChange(moved, { dev, prod }));
    } else {
      current.push("npm packages (minor and patch)");
    }
  });

  // Terraform CLI: both TF_VERSION copies, within required_version.
  await step("Terraform", async () => {
    // The pinned version, and the newest release past the wait that fits every
    // required_version.
    const have = pins.terraform.copies[0].version;
    const pick = pickNewest(await terraformReleases(), {
      ...cooldown,
      allow: (v) =>
        pins.terraform.required.every(
          (r) => !r.constraint || satisfiesPessimistic(v, r.constraint),
        ),
    });
    // Nothing newer: current.
    if (!pick || compareVersions(pick.version, have) <= 0) {
      current.push(`Terraform ${have}`);
      return;
    }
    changes.push({
      tool: "Terraform",
      from: have,
      to: pick.version,
      detail:
        "TF_VERSION in both workflows; checked against HashiCorp's SHA256SUMS when it runs",
      edits: pins.terraform.copies.map((c) => ({
        file: c.file,
        apply: (t) => setEnv(t, "TF_VERSION", pick.version),
      })),
    });
  });

  // kind CLI: follows the kind inside the provider, with kind's own checksum.
  await step("kind", async () => {
    // No provider found: nothing to follow.
    if (!pins.kind.provider) return;
    const inside = await providerKind(pins.kind.provider);
    // Already the same kind: current.
    if (inside === pins.kind.version) {
      current.push(
        `kind ${pins.kind.version} (matches tehcyx/kind ${pins.kind.provider})`,
      );
      return;
    }
    const sha = await kindSha(inside);
    changes.push({
      tool: "kind CLI",
      from: pins.kind.version,
      to: inside,
      detail: `to match tehcyx/kind ${pins.kind.provider}; KIND_SHA256 from kind's .sha256sum`,
      edits: [
        {
          file: FILES.k8sCanary,
          apply: (t) =>
            setEnv(setEnv(t, "KIND_VERSION", inside), "KIND_SHA256", sha),
        },
      ],
    });
  });

  // TFLint and Trivy: the version and its SHA256 together.
  for (const tool of [
    {
      name: "TFLint",
      repo: "terraform-linters/tflint",
      file: FILES.tfValidate,
      versionVar: "TFLINT_VERSION",
      shaVar: "TFLINT_SHA256",
      have: pins.tflint.version,
      sha: tflintSha,
      withV: true,
    },
    {
      name: "Trivy",
      repo: "aquasecurity/trivy",
      file: FILES.infraScan,
      versionVar: "TRIVY_VERSION",
      shaVar: "TRIVY_SHA256",
      have: pins.trivy.version,
      sha: trivySha,
      withV: false,
    },
  ]) {
    // Plan each one.
    await step(tool.name, async () => {
      // The newest release past the wait.
      const pick = pickNewest(await githubReleases(tool.repo), cooldown);
      // Nothing newer: current.
      if (!pick || compareVersions(pick.version, tool.have) <= 0) {
        current.push(`${tool.name} ${tool.have}`);
        return;
      }
      const to = tool.withV ? `v${pick.version}` : pick.version;
      const sha = await tool.sha(to);
      const bare = tool.have.replace(/^v/, "");
      changes.push({
        tool: tool.name,
        from: tool.have,
        to,
        detail: `${tool.shaVar} from its published checksums`,
        edits: [
          {
            file: tool.file,
            apply: (t) =>
              setEnv(replaceVersion(t, bare, pick.version), tool.shaVar, sha),
          },
        ],
      });
    });
  }

  // ZAP: the version and the image digest together. A re-published tag of the
  // same version is only a note: the digest pin is there so a re-push cannot
  // swap the image.
  await step("ZAP", async () => {
    // The pinned version, and the newest release past the wait.
    const have = pins.zap.version;
    const releases = await githubReleases("zaproxy/zaproxy");
    const pick = pickNewest(releases, cooldown);
    // Nothing newer: current, with a note when the tag was published again.
    if (!pick || compareVersions(pick.version, have) <= 0) {
      // Current; then compare the tag's digest with the pin.
      current.push(`ZAP ${have}`);
      const tagDigest = await ghcrDigest("zaproxy/zaproxy", have);
      // A different digest: the tag was re-published.
      if (tagDigest && !pins.zap.image.endsWith(tagDigest)) {
        notes.push(
          `ZAP ${have}: the tag was re-published since it was pinned; the pin keeps the original build, as intended.`,
        );
      }
      return;
    }
    const digest = await ghcrDigest("zaproxy/zaproxy", pick.version);
    // No image for it yet: ZAP waits.
    if (!digest) {
      notes.push(
        `ZAP ${pick.version} is out, but ghcr.io has no image for it yet, so ZAP waits.`,
      );
      return;
    }
    const oldDate = (
      releases.find((r) => r.version === have)?.date || ""
    ).slice(0, 10);
    changes.push({
      tool: "ZAP",
      from: have,
      to: pick.version,
      detail: "ZAP_IMAGE digest read from ghcr.io for the new tag",
      edits: [
        {
          file: FILES.securityScan,
          apply: (t) => {
            // The version everywhere in the file, then the release date beside
            // it.
            let out = replaceVersion(t, have, pick.version);
            // The date, when the old one is named.
            if (oldDate) {
              out = out.replace(
                `(released ${oldDate})`,
                `(released ${pick.date.slice(0, 10)})`,
              );
            }
            return setEnv(
              out,
              "ZAP_IMAGE",
              `ghcr.io/zaproxy/zaproxy@${digest}`,
            );
          },
        },
      ],
    });
  });

  // Report only: GitHub Actions, ingress-nginx, the tools on this PC.
  await step("GitHub Actions", async () => {
    // Each Action used: report a newer major.
    for (const action of pins.actions) {
      const pick = pickNewest(await githubReleases(action.repo), cooldown);
      const newest = pick && parseVersion(pick.version)?.major;
      // A newer major is out.
      if (newest > action.major) {
        reportOnly.push(
          `GitHub Action ${action.repo}@v${action.major}: v${newest} is out (${action.files.length} workflow${action.files.length === 1 ? "" : "s"}).`,
        );
      }
    }
  });
  await step("ingress-nginx", async () => {
    // No vendored copy: nothing to check.
    if (!pins.ingress) return;
    const releases = (await githubReleases("kubernetes/ingress-nginx")).filter(
      (r) => r.tag.startsWith("controller-v"),
    );
    const pick = pickNewest(releases, cooldown);
    // A newer controller is out.
    if (pick && compareVersions(pick.version, pins.ingress) > 0) {
      reportOnly.push(
        `ingress-nginx controller-v${pins.ingress}: controller-v${pick.version} is out; ${FILES.ingress} says how to re-vendor it.`,
      );
    }
  });

  // Hand-kept files that would differ from the rest after these changes.
  reportOnly.push(...handMaintainedDrift(applyPlanToPins(pins, changes)));

  // This PC's own Terraform and kind, when they differ from CI.
  for (const local of localTools(pins, changes)) reportOnly.push(local);

  // Everything planned.
  return { changes, current, reportOnly, notes, errors };
}

// The pins as they would read after the changes, for the hand-maintained check.
function applyPlanToPins(pins, changes) {
  // Only a Node change moves anything here.
  const node = changes.find((c) => c.tool === "Node");
  if (!node) return pins;
  return {
    ...pins,
    node: pins.node.map((c) =>
      HAND_MAINTAINED.includes(c.file) ? c : { ...c, major: +node.to },
    ),
  };
}

// Terraform and kind on this PC, compared with what CI pins.
function localTools(pins, changes) {
  // Nothing to say in CI; otherwise the versions CI will use.
  const lines = [];
  if (process.env.GITHUB_ACTIONS) return lines;
  const tfTarget =
    changes.find((c) => c.tool === "Terraform")?.to ||
    pins.terraform.copies[0].version;
  const kindTarget =
    changes.find((c) => c.tool === "kind CLI")?.to || pins.kind.version;
  // Terraform here, when it is installed.
  try {
    // Its version.
    const tf = JSON.parse(
      execSync("terraform version -json", {
        stdio: ["ignore", "pipe", "ignore"],
        encoding: "utf8",
      }),
    );
    // Different from CI: say so.
    if (tf.terraform_version !== tfTarget) {
      lines.push(
        `This PC: Terraform ${tf.terraform_version}; CI uses ${tfTarget}. Update it here to match.`,
      );
    }
  } catch {
    /* not installed here */
  }
  // kind here, when it is installed.
  try {
    // Its version.
    const kind = execSync("kind version", {
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8",
    }).match(/v\d+\.\d+\.\d+/)?.[0];
    // Different from CI: say so.
    if (kind && kind !== kindTarget) {
      lines.push(
        `This PC: kind ${kind}; CI uses ${kindTarget}. Update it here to match.`,
      );
    }
  } catch {
    /* not installed here */
  }
  return lines;
}

// The npm change: `moves` is [{ name, from, to }], the npm specs per section.
function npmChange(moves, npm) {
  // One change listing every package's move.
  return {
    tool: "npm packages",
    from: `${moves.length} package${moves.length === 1 ? "" : "s"}`,
    to: "newest minor or patch",
    detail: moves.map((m) => `${m.name} ${m.from} → ${m.to}`).join(", "),
    moves,
    edits: [],
    npm,
  };
}

// --- Applying ---------------------------------------------------------------

const NPM_FLAGS = "--no-audit --no-fund";

// A spec's package name, without its @version.
const specName = (spec) => spec.slice(0, spec.lastIndexOf("@"));

// Runs npm; returns null on success, or what npm printed when it failed.
function npmRun(args) {
  // Run it with its output captured.
  try {
    execSync(`npm ${args}`, {
      cwd: ROOT,
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf8",
    });
    return null;
  } catch (error) {
    return `${error.stdout || ""}${error.stderr || ""}`;
  }
}

// Why npm refused a package, in one line.
function peerReason(output) {
  const m = output.match(/(peer(?:Optional)?) (\S+?)@"([^"]+)" from (\S+)/);
  if (!m) return "npm refused it (a peer dependency conflict)";
  const kind = m[1] === "peerOptional" ? "an optional peer" : "a peer";
  return `it needs ${m[2]} ${m[3]} (${kind}), which this repository does not have`;
}

// npm install for one group. A package npm refuses for a peer conflict is
// held back and the rest go ahead, so one stubborn package never blocks the
// others. Any other npm failure stops the update.
function npmInstallGroup(saveFlag, specs, heldBack) {
  // What is still to install.
  let rest = [...specs];
  // Install them all; take out the one npm refuses, and try again.
  while (rest.length) {
    // Install; success ends it, and a failure that is not a peer conflict stops
    // the update.
    const failure = npmRun(
      `install ${NPM_FLAGS} ${saveFlag} ${rest.join(" ")}`,
    );
    if (!failure) return;
    if (!/ERESOLVE/.test(failure)) {
      throw new Error(`npm install failed:\n${failure.slice(-2000)}`);
    }
    const named = [
      ...failure.matchAll(/(?:While resolving:|from) (@?[^@\s"]+)@/g),
    ].map((m) => m[1]);
    const culprit = rest.find((spec) => named.includes(specName(spec)));
    // npm named none of ours: try each one on its own.
    if (!culprit) {
      // npm did not name one of ours: try each on its own.
      for (const spec of rest) {
        // This one alone.
        const one = npmRun(`install ${NPM_FLAGS} ${saveFlag} ${spec}`);
        // Refused: hold it back, with npm's reason.
        if (one) {
          heldBack.push({
            spec,
            reason: /ERESOLVE/.test(one)
              ? peerReason(one)
              : "npm install failed",
          });
        }
      }
      return;
    }
    heldBack.push({ spec: culprit, reason: peerReason(failure) });
    rest = rest.filter((spec) => spec !== culprit);
  }
}

// Writes the file edits, then the npm installs. Playwright goes on its own and
// must succeed, because its Docker image has already moved with it. Returns
// the npm packages held back.
function applyChanges(changes) {
  // Every file edit, written only when it changes something.
  for (const change of changes) {
    // Each edit of each change.
    for (const edit of change.edits) {
      const before = read(edit.file);
      const after = edit.apply(before);
      if (after !== before) write(edit.file, after);
    }
  }
  const heldBack = [];
  const playwright = changes.find((c) => c.tool === "Playwright");
  // Playwright first, on its own; a refusal stops the update.
  if (playwright) {
    // Install both Playwright packages.
    const failure = npmRun(
      `install ${NPM_FLAGS} --save-dev ${playwright.npm.dev.join(" ")}`,
    );
    // Refused: stop, since its image has already moved.
    if (failure) {
      throw new Error(
        `npm refused Playwright ${playwright.to}, so the update stops (its image already moved):\n${failure.slice(-2000)}`,
      );
    }
  }
  const others = changes.filter((c) => c.tool !== "Playwright");
  const prod = others.flatMap((c) => c.npm?.prod || []);
  const dev = others.flatMap((c) => c.npm?.dev || []);
  if (prod.length) npmInstallGroup("--save-prod", prod, heldBack);
  if (dev.length) npmInstallGroup("--save-dev", dev, heldBack);
  return heldBack;
}

// Prettier's partner is the repository's own formatting. A new Prettier can
// lay files out differently (3.9 puts a short union type on one line), and the
// Format check then fails on files nobody touched, as on PR #85. So when
// Prettier moves, every file is re-formatted with the new version in the same
// change. Returns the files it re-formatted.
function reformatForPrettier(changes, heldBack) {
  // Whether Prettier itself moved (and was not held back).
  const specs = changes.flatMap((c) => [
    ...(c.npm?.dev || []),
    ...(c.npm?.prod || []),
  ]);
  const moved =
    specs.some((s) => specName(s) === "prettier") &&
    !heldBack.some((h) => specName(h.spec) === "prettier");
  if (!moved) return [];
  let listed = "";
  // Ask the new Prettier which files it would lay out differently.
  try {
    execSync("npx prettier --list-different .", {
      cwd: ROOT,
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf8",
    });
  } catch (error) {
    // Exit 1 means some files differ; 2 means Prettier itself failed.
    if (error.status !== 1) {
      throw new Error(
        `the new Prettier could not read the repository:\n${error.stderr || error.message}`,
      );
    }
    listed = error.stdout || "";
  }
  const files = listed
    .split(/\r?\n/)
    .map((f) => f.trim())
    .filter(Boolean);
  // Re-format those files.
  if (files.length) {
    execSync("npx prettier --write .", {
      cwd: ROOT,
      stdio: ["ignore", "pipe", "pipe"],
    });
  }
  return files;
}

// Drops held-back packages from the plan and lists them for a person.
function recordHeldBack(plan, heldBack) {
  // Nothing held back: nothing to drop.
  if (!heldBack.length) return;
  const held = new Set(heldBack.map((h) => specName(h.spec)));
  const index = plan.changes.findIndex((c) => c.tool === "npm packages");
  // Take the held-back packages out of the npm change, or drop the change when
  // none is left.
  if (index >= 0) {
    const change = plan.changes[index];
    const moves = change.moves.filter((m) => !held.has(m.name));
    if (moves.length) plan.changes[index] = npmChange(moves, change.npm);
    else plan.changes.splice(index, 1);
  }
  for (const h of heldBack) {
    plan.reportOnly.push(`npm ${h.spec} held back: ${h.reason}.`);
  }
}

// Tracked Markdown files that still name an old version, for a person to read.
function mentionsToReview(changes) {
  // Every tracked Markdown file except the changelog.
  let files = [];
  // None listed: nothing to check.
  try {
    files = execSync("git ls-files *.md", { cwd: ROOT, encoding: "utf8" })
      .split(/\r?\n/)
      .filter((f) => f && f !== "CHANGELOG.md");
  } catch {
    return [];
  }
  const found = [];
  // For each change, search for its old version.
  for (const change of changes) {
    // Only real versions, or Node's major.
    if (!parseVersion(change.from) && !/^\d+$/.test(change.from)) continue;
    const needle =
      change.tool === "Node"
        ? new RegExp(`\\bNode ${change.from}\\b|node:${change.from}\\b`)
        : versionPattern(change.from.replace(/^v/, ""), "");
    // Each line that names it.
    for (const file of files) {
      const lines = read(file).split(/\r?\n/);
      lines.forEach((line, i) => {
        if (needle.test(line))
          found.push(`${change.tool} ${change.from}: ${file}:${i + 1}`);
      });
    }
  }
  return found;
}

// --- Output -----------------------------------------------------------------

function renderReport(plan, { drift = [], online = [], mentions = [] } = {}) {
  // The heading, with today's date and the wait.
  const today = new Date().toISOString().slice(0, 10);
  const out = [`## Infra versions (${today})`, ""];
  out.push(
    `Read from each tool's own source. A release counts once it is ${COOLDOWN_DAYS} days old.`,
    "",
  );

  // The updates.
  out.push("### Updates ready", "");
  // One line each, or "Nothing".
  if (plan.changes.length) {
    for (const c of plan.changes)
      out.push(`- **${c.tool}**: ${c.from} → ${c.to} (${c.detail})`);
  } else {
    out.push(
      "- Nothing: every tool is on its newest version that is old enough.",
    );
  }

  // What is already current.
  out.push("", "### Already current", "");
  for (const line of plan.current) out.push(`- ${line}`);

  // Whether every pinned copy and checksum agrees.
  out.push("", "### In line with each other", "");
  const problems = [...drift, ...online];
  if (problems.length) for (const p of problems) out.push(`- ${p}`);
  else out.push("- Yes: every pinned copy and checksum agrees.");

  // What only a person changes.
  if (plan.reportOnly.length) {
    out.push("", "### For a person (never changed automatically)", "");
    for (const line of plan.reportOnly) out.push(`- ${line}`);
  }
  // Notes.
  if (plan.notes.length) {
    out.push("", "### Notes", "");
    for (const line of plan.notes) out.push(`- ${line}`);
  }
  // Docs that still name an old version.
  if (mentions.length) {
    out.push("", "### Docs that still name an old version", "");
    for (const line of mentions) out.push(`- ${line}`);
  }
  // Sources that did not answer.
  if (plan.errors.length) {
    out.push("", "### Sources that did not answer", "");
    for (const line of plan.errors) out.push(`- ${line}`);
  }
  return `${out.join("\n")}\n`;
}

// Add the report to the job summary, under GitHub Actions.
function writeStepSummary(text) {
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, text);
  }
}

// --- Commands ---------------------------------------------------------------

async function main(argv) {
  // The command, and its flags and options.
  const [command, ...rest] = argv;
  const flag = (name) => rest.includes(name);
  const option = (name) => {
    const i = rest.indexOf(name);
    return i >= 0 ? rest[i + 1] : undefined;
  };

  // check: every copy and checksum must agree; fails when one does not.
  if (command === "check") {
    // Read the pins, find what disagrees, and (unless --offline) check the
    // checksums against their sources.
    const pins = readPins();
    const problems = findDrift(pins);
    const warnings = handMaintainedDrift(pins);
    if (!flag("--offline")) problems.push(...(await onlineChecks(pins)));
    for (const w of warnings) console.log(`warning: ${w}`);
    // Anything out of line fails.
    if (problems.length) {
      for (const p of problems) console.error(`out of line: ${p}`);
      process.exitCode = 1;
      return;
    }
    console.log("[infra] Every pinned copy and checksum agrees.");
    return;
  }

  // report and update: plan the updates against each tool's own source.
  if (command === "report" || command === "update") {
    // Read the pins, plan, and check them.
    const pins = readPins();
    const plan = await planUpdates(pins);
    const drift = findDrift(pins);
    const online = await onlineChecks(pins);

    // report, or update --dry-run: print the plan and change nothing.
    if (command === "report" || flag("--dry-run")) {
      const text = renderReport(plan, { drift, online });
      console.log(text);
      writeStepSummary(text);
      return;
    }

    // update: apply the plan, drop what npm refused, and re-format when
    // Prettier moved.
    const heldBack = applyChanges(plan.changes);
    recordHeldBack(plan, heldBack);
    const reformatted = reformatForPrettier(plan.changes, heldBack);
    // Say which files were re-formatted.
    if (reformatted.length) {
      plan.notes.push(
        `Prettier moved, so ${reformatted.length} file${reformatted.length === 1 ? " was" : "s were"} re-formatted with the new version (layout only): ${reformatted.join(", ")}.`,
      );
    }
    const after = findDrift(readPins());
    const mentions = mentionsToReview(plan.changes);
    const text = renderReport(plan, { drift: after, mentions });
    console.log(text);
    writeStepSummary(text);
    const summaryFile = option("--summary-file");
    if (summaryFile) fs.writeFileSync(summaryFile, text);
    if (after.length) process.exitCode = 1;
    return;
  }

  // An unknown command: show how to run it.
  console.error(
    "Usage: node scripts/infra-versions.js <check [--offline] | report | update [--dry-run] [--summary-file <path>]>",
  );
  process.exitCode = 1;
}

// Run only when started directly; an error prints its message and fails.
if (require.main === module) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(`\n${error.message}\n`);
    process.exit(1);
  });
}

// What the infra tests use.
module.exports = {
  COOLDOWN_DAYS,
  HAND_MAINTAINED,
  PINNED_ON_PURPOSE,
  caretAllows,
  compareVersions,
  findDrift,
  getEnv,
  handMaintainedDrift,
  nodeVersionsIn,
  parseVersion,
  pickNewest,
  readPins,
  replaceVersion,
  satisfiesPessimistic,
  setEnv,
  setNodeVersion,
  shaFromChecksums,
};
