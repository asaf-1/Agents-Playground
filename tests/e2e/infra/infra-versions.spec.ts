// Playwright's test tools, with the [RESULT] block printed after every test.
import {
  expect,
  expected,
  fact,
  test,
} from "../../../framework/fixtures/resultBlock";
// The infra updater's own functions: version rules, file edits and alignment.
import {
  caretAllows,
  compareVersions,
  findDrift,
  getEnv,
  handMaintainedDrift,
  pickNewest,
  readPins,
  replaceVersion,
  satisfiesPessimistic,
  setEnv,
  setNodeVersion,
  shaFromChecksums,
} from "../../../scripts/infra-versions.js";

// The logic of scripts/infra-versions.js, which keeps the pinned infra tools
// current and in line with each other. Everything here is offline: the
// script's network half (reading each tool's official source) runs in
// `npm run infra:report` and `npm run infra:update`, never in this suite.

// A fixed "now" so the 7-day rule gives the same answer on every run.
const DAY = 86_400_000;
const NOW = Date.parse("2026-11-06T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW - n * DAY).toISOString();

test.describe("Infra versions: the rules", () => {
  // Versions compare as numbers (1.10 is above 1.9), and a release beats its release candidate.
  test("versions sort by number, and a release sorts above its pre-release", () => {
    expected(
      "1.10.0 > 1.9.9; v0.65.0 > 0.64.0; 1.17.0 > 1.17.0-rc2; 2.0.0 = 2.0.0",
    );
    expect(compareVersions("1.10.0", "1.9.9")).toBeGreaterThan(0);
    expect(compareVersions("v0.65.0", "0.64.0")).toBeGreaterThan(0);
    expect(compareVersions("1.17.0", "1.17.0-rc2")).toBeGreaterThan(0);
    expect(compareVersions("2.0.0", "2.0.0")).toBe(0);
  });

  // The newest pick skips releases younger than 7 days and every pre-release.
  test("a release counts only once it is 7 days old, and never as a pre-release", () => {
    expected(
      "newest is 1.17.1; newest 1.16.x is 1.16.7; with a 20-day wait, none",
    );
    // A 2-day-old release, a pre-release, and two settled releases.
    const releases = [
      { version: "1.17.2", date: daysAgo(2) }, // too new
      { version: "1.18.0-rc1", date: daysAgo(30) }, // a pre-release
      { version: "1.17.1", date: daysAgo(9) },
      { version: "1.16.7", date: daysAgo(15) },
    ];
    fact("releases", releases.length);
    expect(pickNewest(releases, { now: NOW })?.version).toBe("1.17.1");
    // Only 1.16.x allowed.
    expect(
      pickNewest(releases, {
        now: NOW,
        allow: (v: string) => v.startsWith("1.16."),
      })?.version,
    ).toBe("1.16.7");
    // A 20-day wait leaves nothing old enough.
    expect(pickNewest(releases, { now: NOW, days: 20 })).toBeNull();
  });

  // ^1.2.3 allows anything up to (not including) 2.0.0; ^0.5.8 only within 0.5.x.
  test("a caret range moves within its major, or within its minor for 0.x", () => {
    expected(
      "^1.2.3 allows 1.9.0, not 2.0.0, not itself, not lower, not a beta; ^0.5.8 allows 0.5.13, not 0.6.0",
    );
    expect(caretAllows("1.2.3", "1.9.0")).toBe(true);
    expect(caretAllows("1.2.3", "2.0.0")).toBe(false);
    expect(caretAllows("1.2.3", "1.2.3")).toBe(false);
    expect(caretAllows("1.2.3", "1.1.0")).toBe(false);
    expect(caretAllows("0.5.8", "0.5.13")).toBe(true);
    expect(caretAllows("0.5.8", "0.6.0")).toBe(false);
    expect(caretAllows("1.2.3", "1.3.0-beta.1")).toBe(false);
  });

  // ~> 1.16 means 1.16 or newer within 1.x; ~> 0.13.0 means 0.13.x only.
  test("Terraform's ~> reads the way Terraform reads it", () => {
    expected(
      "~> 1.16 takes 1.17.1, not 1.15.9 or 2.0.0; ~> 0.13.0 takes 0.13.4, not 0.14.0",
    );
    expect(satisfiesPessimistic("1.17.1", "~> 1.16")).toBe(true);
    expect(satisfiesPessimistic("1.15.9", "~> 1.16")).toBe(false);
    expect(satisfiesPessimistic("2.0.0", "~> 1.16")).toBe(false);
    expect(satisfiesPessimistic("0.13.4", "~> 0.13.0")).toBe(true);
    expect(satisfiesPessimistic("0.14.0", "~> 0.13.0")).toBe(false);
  });
});

test.describe("Infra versions: the file edits", () => {
  // A small workflow with Windows line endings, to edit.
  const workflow = [
    "env:",
    "      # SHA256 of trivy_0.74.0_Linux-64bit.tar.gz.",
    "      TRIVY_VERSION: 0.74.0",
    "      TRIVY_SHA256: aaaa",
    "      OTHER: 10.74.0",
    "steps:",
    "      - uses: actions/setup-node@v4",
    "        with:",
    "          node-version: 24",
    "      - run: echo node-version: 240",
    "",
  ].join("\r\n");

  // An env value can be read and changed without touching the line endings.
  test("an env value is read and replaced in place, line endings kept", () => {
    expected(
      "TRIVY_SHA256 reads aaaa, then bbbb; same number of lines; a missing name throws",
    );
    expect(getEnv(workflow, "TRIVY_SHA256")).toBe("aaaa");
    const out = setEnv(workflow, "TRIVY_SHA256", "bbbb");
    expect(getEnv(out, "TRIVY_SHA256")).toBe("bbbb");
    expect(out.split("\r\n")).toHaveLength(workflow.split("\r\n").length);
    expect(() => setEnv(workflow, "MISSING", "x")).toThrow(/MISSING/);
  });

  // A version changes in its value and in the comment that names it, but not
  // where it is part of a longer number.
  test("a version is replaced in its value and its comment, never inside a longer number", () => {
    expected("the comment and TRIVY_VERSION read 0.76.1; OTHER stays 10.74.0");
    const out = replaceVersion(workflow, "0.74.0", "0.76.1");
    expect(out).toContain("trivy_0.76.1_Linux-64bit.tar.gz");
    expect(getEnv(out, "TRIVY_VERSION")).toBe("0.76.1");
    expect(getEnv(out, "OTHER")).toBe("10.74.0");
  });

  // Only a real `node-version:` line is changed, not text that merely contains it.
  test("only a whole node-version line changes", () => {
    expected("node-version: 26, and 'echo node-version: 240' untouched");
    const out = setNodeVersion(workflow, 24, 26);
    expect(out).toContain("node-version: 26");
    expect(out).toContain("echo node-version: 240");
  });

  // The right file's checksum is picked from a list; a missing file throws.
  test("the SHA256 for the right file is read from a checksums list", () => {
    expected("tflint_linux_amd64.zip -> 2222; nope.zip throws");
    const list = [
      "1111  tflint_darwin_amd64.zip",
      "2222  tflint_linux_amd64.zip",
      "3333  tflint_linux_arm64.zip",
    ].join("\n");
    expect(shaFromChecksums(list, "tflint_linux_amd64.zip")).toBe("2222");
    expect(() => shaFromChecksums(list, "nope.zip")).toThrow(/nope\.zip/);
  });
});

// Alignment: every pinned copy of a version in line with the others.
test.describe("Infra versions: alignment", () => {
  // A made-up set of pins that all agree, to change one thing at a time.
  const aligned = () => ({
    playwright: {
      range: { test: "^1.65.0", pw: "^1.65.0" },
      lock: { test: "1.65.0", pw: "1.65.0", core: "1.65.0" },
      image: { tag: "1.65.0", flavor: "noble", digest: "sha256:abc" },
    },
    node: [
      { file: ".github/workflows/a.yml", major: 24, kind: "workflow" },
      {
        file: ".github/workflows/pr-validation.yml",
        major: 24,
        kind: "workflow",
      },
      { file: "Dockerfile", major: 24, kind: "docker" },
    ],
    terraform: {
      copies: [
        { file: "a.yml", version: "1.16.2" },
        { file: "b.yml", version: "1.16.2" },
      ],
      required: [{ file: "terraform/versions.tf", constraint: "~> 1.16" }],
    },
    kind: { version: "v0.33.0", sha: "x", provider: "0.13.0" },
    tflint: { version: "v0.64.0", sha: "x" },
    trivy: { version: "0.74.0", sha: "x" },
    zap: { version: "2.17.0", image: "ghcr.io/zaproxy/zaproxy@sha256:x" },
    npm: [],
    actions: [],
    ingress: null,
  });

  // Pins that agree find no drift.
  test("aligned pins pass", () => {
    expected("no drift");
    expect(findDrift(aligned())).toEqual([]);
  });

  // Two Terraform copies that disagree are reported.
  test("two Terraform copies that disagree are caught", () => {
    expected("drift naming 'TF_VERSION differs'");
    const pins = aligned();
    pins.terraform.copies[1].version = "1.17.1";
    expect(findDrift(pins).join("\n")).toMatch(/TF_VERSION differs/);
  });

  // A Playwright image older than the package is reported.
  test("a Playwright image that does not match the package is caught", () => {
    expected("drift naming 'Dockerfile.e2e runs v1.64.0'");
    const pins = aligned();
    pins.playwright.image.tag = "1.64.0";
    expect(findDrift(pins).join("\n")).toMatch(
      /Dockerfile\.e2e runs v1\.64\.0/,
    );
  });

  // Mixed Node versions are drift, except that the hand-kept PR workflow only
  // gets a warning.
  test("mixed Node versions are caught, but the hand-kept PR file only warns", () => {
    expected(
      "Dockerfile on 26 alone: drift 'Node: not one version'; everything but pr-validation.yml on 26: no drift, a warning 'pr-validation.yml runs Node 24, the rest Node 26'",
    );
    // The Dockerfile alone on 26.
    const mixed = aligned();
    mixed.node[2].major = 26;
    expect(findDrift(mixed).join("\n")).toMatch(/Node: not one version/);

    // Everything on 26 except the hand-kept PR workflow.
    const handOnly = aligned();
    handOnly.node[0].major = 26;
    handOnly.node[2].major = 26;
    expect(findDrift(handOnly)).toEqual([]);
    expect(handMaintainedDrift(handOnly).join("\n")).toMatch(
      /pr-validation\.yml runs Node 24, the rest Node 26/,
    );
  });

  // The guard on every PR: a change that moves one copy of a version and not
  // the others (as Dependabot's PR #82 did with kind) fails here.
  test("this repository's own pins agree with each other", () => {
    expected("no drift in this repository's real pins");
    expect(findDrift(readPins())).toEqual([]);
  });
});
