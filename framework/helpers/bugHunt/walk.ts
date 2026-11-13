// The bug hunt's walk, with no AI: start at /app, follow every link inside the
// app, and on each page watch for what goes wrong (a 5xx answer, an uncaught
// error, a console error, a crash, an empty page, a dead link, a slow answer).
// The customer walks also press the buttons on their own account. Each thing
// seen on opening a page is checked once more by opening it again, and a
// server error on a GET by asking again: seen twice earns "high" confidence.

// Node's file and path tools, and Playwright's page and answer types.
import fs from "node:fs";
import path from "node:path";
import type { Page, Response } from "@playwright/test";
// Signals, findings and the slow-answer limit.
import {
  SLOW_MS,
  fingerprint,
  maskSecrets,
  mergeFindings,
  routePattern,
  toFinding,
  type Finding,
  type Pass,
  type Signal,
} from "./findings";

// What one walk needs: who it is, whether it presses buttons, where to save
// its screenshots, and how many pages it may open.
export type WalkOptions = {
  pass: Pass;
  base: string;
  pressButtons: boolean;
  screenshotDir: string;
  maxPages?: number;
  // Where to start; by default /app and every route that needs no id. The
  // probe (tests/bug-hunt/hunt-probe.spec.ts) starts at one page.
  starts?: string[];
};

// What one walk found, for the score at the end.
export type WalkResult = {
  pass: Pass;
  pages: string[];
  pressed: number;
  signals: number;
  findings: Finding[];
};

// The console noise a browser adds for every answer that is not 2xx: the
// answer itself is watched instead, so these are dropped.
const LOAD_NOISE = /^Failed to load resource/;
// React Router's warning for an address with no route: a dead link.
const NO_ROUTE = /No routes matched location/;
// Buttons a walk never presses: they would end its session, delete or lock
// something, switch practice mode, or make the server fail or stall on
// purpose (the Orders page's "flaky" and "slow" modes, demos of a recovering
// network; the first hunt pressed "flaky" and reported its deliberate 503).
const NEVER_PRESS =
  /log ?out|sign ?out|delete|remove|revoke|close (my )?account|freeze|lock|cancel|reset|practice|flaky|\bslow\b/i;
// At most this many buttons pressed on one page, and pages of one pattern
// opened (two coins, two products, not all of them).
const MAX_BUTTONS = 10;
const MAX_PER_PATTERN = 2;

// Watches one page and keeps what it sees, labelled with the page and the
// action at that moment.
export class PageWatch {
  signals: Signal[] = [];
  private where = { page: "", action: "" };
  // While a step is repeated, what it sees goes here instead.
  private sink: Signal[] | null = null;

  constructor(
    private readonly page: Page,
    private readonly origin: string,
  ) {
    // Answers: 5xx from the site, and slow ones.
    page.on("response", (response) => this.onResponse(response));
    // Console errors, and the router's "no route" warning.
    page.on("console", (message) => {
      const text = message.text();
      if (message.type() === "error" && !LOAD_NOISE.test(text)) {
        this.add({ kind: "console-error", message: text });
      }
      if (message.type() === "warning" && NO_ROUTE.test(text)) {
        this.add({ kind: "dead-link", message: text });
      }
    });
    // Uncaught errors, with the first line of the stack.
    page.on("pageerror", (error) => {
      const at = (error.stack ?? "").split("\n")[1]?.trim() ?? "";
      this.add({ kind: "page-error", message: `${error.message} ${at}` });
    });
    // Requests that got no answer (a page leaving cancels its own: not noise).
    page.on("requestfailed", (request) => {
      const failure = request.failure()?.errorText ?? "";
      if (/ERR_ABORTED|NS_BINDING_ABORTED/.test(failure)) return;
      if (!request.url().startsWith(this.origin)) return;
      this.add({
        kind: "request-failed",
        method: request.method(),
        path: new URL(request.url()).pathname,
        message: failure,
      });
    });
    page.on("crash", () => this.add({ kind: "page-crash" }));
  }

  // Where the walk is now, and what it is doing.
  at(page: string, action: string): void {
    this.where = { page, action };
  }

  // Runs a step and returns what it saw, without adding it to the walk's list.
  async capture(step: () => Promise<void>): Promise<Signal[]> {
    const seen: Signal[] = [];
    this.sink = seen;
    try {
      await step();
    } finally {
      this.sink = null;
    }
    return seen;
  }

  // Adds a signal seen by the walk itself (an /api link it fetched).
  record(signal: Omit<Signal, "page" | "action">): void {
    this.add(signal);
  }

  // One signal, labelled with the page and action.
  private add(signal: Omit<Signal, "page" | "action">): void {
    const labelled = { ...signal, ...this.where } as Signal;
    (this.sink ?? this.signals).push(labelled);
  }

  // A 5xx answer from the site is a signal; so is one slower than SLOW_MS.
  private onResponse(response: Response): void {
    const url = response.url();
    if (!url.startsWith(this.origin)) return;
    const request = response.request();
    const base = {
      method: request.method(),
      path: new URL(url).pathname,
      status: response.status(),
      requestId: response.headers()["x-request-id"],
    };
    if (response.status() >= 500) this.add({ kind: "server-error", ...base });
    // How long until the answer began: when this event fires the body may
    // still be arriving, so responseEnd is -1 here (the probe caught that);
    // the server's own slowness shows in the time to the first byte.
    const timing = request.timing();
    const ms = Math.round(Math.max(timing.responseStart, timing.responseEnd));
    if (ms > SLOW_MS) this.add({ kind: "slow", ...base, ms });
  }
}

// Waits for a page to settle: its requests done (or five seconds), then a beat
// for the last render.
async function settle(page: Page): Promise<void> {
  await page
    .waitForLoadState("networkidle", { timeout: 5_000 })
    .catch(() => {});
  await page.waitForTimeout(300);
}

// The app's own links on the page (inside /app), and its download links
// (inside /api), each with the text a person would click.
async function linksOn(page: Page): Promise<{ href: string; text: string }[]> {
  return page.$$eval("a[href]", (anchors) =>
    anchors.map((a) => ({
      href: a.getAttribute("href") ?? "",
      text: (a.textContent ?? "").trim().slice(0, 60),
    })),
  );
}

// Whether the app's main area rendered nothing.
async function mainIsEmpty(page: Page): Promise<boolean> {
  const main = page.getByTestId("app-main");
  if ((await main.count()) === 0) return false;
  const text = (await main.innerText().catch(() => "")).trim();
  return text.length === 0;
}

// The walk.
export async function walkSite(
  page: Page,
  options: WalkOptions,
): Promise<WalkResult> {
  const origin = new URL(options.base).origin;
  const watch = new PageWatch(page, origin);
  const maxPages = options.maxPages ?? 80;
  // The pages still to open (with the page whose link led there), the
  // addresses already queued, and how many of each pattern were opened.
  // The walk starts at /app and at every page in the app's route table that
  // needs no id, so a page with no link to it (Notifications opens from the
  // bell) is still opened. Pages with an id are found through links.
  const routes = appRoutes();
  const knownRoutes = new Set(routes);
  const starts = options.starts ?? [
    "/app",
    ...routes.filter((r) => !r.includes(":")),
  ];
  const queue = [...new Set(starts)].map((p) => ({ path: p, from: "" }));
  const queued = new Set(queue.map((q) => q.path));
  const perPattern = new Map<string, number>();
  const opened: string[] = [];
  const shot = new Set<string>();
  let pressed = 0;

  // A screenshot for each new fingerprint, the first time it is seen. The
  // walk's name leads the file name, since the walks run side by side.
  const walkName = options.pass.replace(/[^a-z]+/gi, "-").toLowerCase();
  const screenshotNew = async (from: number) => {
    for (const signal of watch.signals.slice(from)) {
      const print = fingerprint(signal);
      if (shot.has(print)) continue;
      shot.add(print);
      const file = `${walkName}-${shot.size.toString().padStart(3, "0")}-${signal.kind}.png`;
      await page
        .screenshot({ path: path.join(options.screenshotDir, file) })
        .catch(() => {});
      signal.screenshot = `screenshots/${file}`;
    }
  };

  while (queue.length > 0 && opened.length < maxPages) {
    const { path: address, from } = queue.shift()!;
    const pattern = routePattern(address);
    if ((perPattern.get(pattern) ?? 0) >= MAX_PER_PATTERN) continue;
    perPattern.set(pattern, (perPattern.get(pattern) ?? 0) + 1);

    // Open the page and let it settle.
    const before = watch.signals.length;
    watch.at(address, "open the page");
    await page.goto(address, { waitUntil: "domcontentloaded" }).catch(() => {});
    await settle(page);
    opened.push(address);

    // An empty main area: a dead link when the router said no route matched
    // (that signal is already in) or the address is not in the app's route
    // table (a production build may not print the router's warning), an empty
    // page otherwise.
    const noRoute = watch.signals
      .slice(before)
      .some((s) => s.kind === "dead-link");
    if (noRoute) {
      for (const s of watch.signals.slice(before))
        if (s.kind === "dead-link") s.from = from;
    } else if (await mainIsEmpty(page)) {
      watch.record(
        knownRoutes.has(routePattern(address))
          ? { kind: "blank-page" }
          : { kind: "dead-link", from },
      );
    }

    // Repeat what was seen on opening: open the page again, and ask again for
    // any GET that answered 5xx. What comes back again is "reproduced".
    const fresh = watch.signals.slice(before);
    if (fresh.length > 0) {
      const again = await watch.capture(async () => {
        await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
        await settle(page);
        if (
          fresh.some((s) => s.kind === "blank-page") &&
          (await mainIsEmpty(page))
        )
          watch.record({ kind: "blank-page" });
      });
      for (const signal of fresh) {
        signal.reproduced = again.some(
          (s) => fingerprint(s) === fingerprint(signal),
        );
        if (
          signal.kind === "server-error" &&
          signal.method === "GET" &&
          !signal.reproduced
        ) {
          const retry = await page.request
            .get(`${origin}${signal.path}`)
            .catch(() => null);
          signal.reproduced = Boolean(retry && retry.status() >= 500);
        }
      }
      await screenshotNew(before);
    }

    // The links: the app's own pages go in the queue; download links (/api)
    // are fetched once, and a 5xx answer is a signal.
    for (const link of await linksOn(page)) {
      const href = link.href.startsWith("http")
        ? link.href.startsWith(origin)
          ? link.href.slice(origin.length)
          : ""
        : link.href;
      const clean = href.split("#")[0];
      if (clean.startsWith("/app") && !queued.has(clean)) {
        queued.add(clean);
        queue.push({ path: clean, from: address });
      } else if (clean.startsWith("/api/") && !queued.has(clean)) {
        queued.add(clean);
        watch.at(address, `follow the link "${link.text}"`);
        const answer = await page.request
          .get(`${origin}${clean}`)
          .catch(() => null);
        if (answer && answer.status() >= 500) {
          watch.record({
            kind: "server-error",
            method: "GET",
            path: clean.split("?")[0],
            status: answer.status(),
            requestId: answer.headers()["x-request-id"],
            reproduced: true,
          });
        }
      }
    }

    // The customer walks press the page's buttons, on their own account.
    if (options.pressButtons) {
      pressed += await pressButtons(page, watch, address);
      await screenshotNew(before);
    }
  }

  // Every signal as a finding of this walk, merged by fingerprint.
  const findings = mergeFindings(
    watch.signals.map((signal) => toFinding(signal, options.pass)),
  );
  return {
    pass: options.pass,
    pages: opened,
    pressed,
    signals: watch.signals.length,
    findings,
  };
}

// Presses up to MAX_BUTTONS of the page's buttons, one at a time, and comes
// back to the page after each: Escape closes a dialog, and a press that moved
// to another page is followed by opening this one again.
async function pressButtons(
  page: Page,
  watch: PageWatch,
  address: string,
): Promise<number> {
  const main = page.getByTestId("app-main");
  if ((await main.count()) === 0) return 0;
  // The names of the visible, enabled buttons, without the never-press ones.
  const names = await main
    .locator("button:visible:enabled")
    .evaluateAll((buttons) =>
      buttons.map((b) =>
        (b.getAttribute("aria-label") || b.textContent || "").trim(),
      ),
    );
  const pressable = [...new Set(names)]
    .filter((name) => name && !NEVER_PRESS.test(name))
    .slice(0, MAX_BUTTONS);

  let count = 0;
  for (const name of pressable) {
    watch.at(address, `press "${maskSecrets(name).slice(0, 40)}"`);
    const button = main.getByRole("button", { name, exact: true }).first();
    const clicked = await button
      .click({ timeout: 2_000 })
      .then(() => true)
      .catch(() => false);
    if (!clicked) continue;
    count += 1;
    await settle(page);
    // Back to where the walk was.
    await page.keyboard.press("Escape").catch(() => {});
    if (new URL(page.url()).pathname !== address.split("?")[0]) {
      await page
        .goto(address, { waitUntil: "domcontentloaded" })
        .catch(() => {});
      await settle(page);
    }
  }
  return count;
}

// The app's pages, from its own route table (web/src/App.tsx), as patterns:
// /app/bank, /app/bank/accounts/:id. Read like a sitemap, so the walk starts
// everywhere and the report can say which pages no walk reached.
export function appRoutes(): string[] {
  const source = fs.readFileSync(
    path.resolve(__dirname, "..", "..", "..", "web", "src", "App.tsx"),
    "utf8",
  );
  const routes = [...source.matchAll(/path="([^"]+)"/g)].map((m) =>
    `/app${m[1] === "/" ? "" : m[1]}`.replace(/\/:\w+/g, "/:id"),
  );
  return [...new Set(routes)];
}

// The folder this run writes to: BUG_HUNT_DIR, set by
// playwright.bughunt.config.ts, made if it is missing.
export function runFolder(): string {
  const dir = process.env.BUG_HUNT_DIR;
  if (!dir) throw new Error("BUG_HUNT_DIR is not set: run npm run bug-hunt");
  fs.mkdirSync(path.join(dir, "screenshots"), { recursive: true });
  return dir;
}
