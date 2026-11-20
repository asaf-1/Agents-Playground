// Records the README's pictures and GIFs: `npm run media:record`.
//
// Playwright walks each story and takes one screenshot per step; then
// make-gifs.py (Python 3 with Pillow) puts a caption on every frame, joins the
// frames into a GIF, and keeps one 1600px PNG per story for slides. Nothing is
// drawn by hand, so the pictures can be made again from a clean clone and stay
// current with the screens.
//
// It starts its own servers and talks to nothing else:
//   - the site (server.js) on 127.0.0.1:4180, with its database in memory. Any
//     DATABASE_URL in the environment is removed for this process, so a
//     recording can never write to Neon;
//   - the test runner on 127.0.0.1:4181 with GitHub replaced by its stub, so
//     the runs in the pictures are pretend and no pipeline is started.
// The tracing story also needs Jaeger on 127.0.0.1:16686, started beforehand
// with `npm run trace:up`; the site then runs with tracing on. Its last frame
// runs one test through `npm run test:traced`, which needs port 4173 free.
// The load-tests story runs a real `npm run k6:stress`, which needs k6 on the
// PC and port 4174 free, and starts its own fresh bank there (in memory).
//
// Frames go to .artifacts/media/<story>/ (gitignored); the finished files go
// to docs/assets/.
//
//   npm run media:record              every story
//   npm run media:record -- runner    one story by name
//   npm run media:record -- --frames  frames only, skip the GIFs

// Files, paths, and starting programs.
const fs = require("node:fs");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");

// The repo's root folder.
const ROOT = path.resolve(__dirname, "..", "..");
// Where the frames go, and where the finished files go.
const FRAMES = path.join(ROOT, ".artifacts", "media");
const ASSETS = path.join(ROOT, "docs", "assets");
// The ports the site and the runner use here, and their addresses.
const SITE_PORT = 4180;
const RUNNER_PORT = 4181;
const SITE = `http://127.0.0.1:${SITE_PORT}`;
const RUNNER = `http://127.0.0.1:${RUNNER_PORT}`;
// The browser window's size.
const VIEWPORT = { width: 1600, height: 1000 };
// The password every recorded bank account signs up with.
const PASSWORD = "practice123";

// Wait the given number of milliseconds.
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Start a server with Node and wait for its health check: the bank's ready
// check for the site, the runner's own /api/health for the runner. Returns
// the process and a promise that it is up.
function startServer(label, args, cwd, env, url, healthPath) {
  // Start it, keeping its output for the error message.
  const child = spawn(process.execPath, args, {
    cwd,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  child.stdout.on("data", (chunk) => (log += chunk));
  child.stderr.on("data", (chunk) => (log += chunk));

  // Ask the health check every tenth of a second, for up to 30 seconds; a
  // server that quits ends the wait.
  const ready = (async () => {
    for (let attempt = 0; attempt < 300; attempt += 1) {
      try {
        const response = await fetch(`${url}${healthPath}`);
        if (response.ok) return;
      } catch {
        // not up yet
      }
      if (child.exitCode !== null) break;
      await sleep(100);
    }
    throw new Error(`${label} did not start:\n${log.slice(-2000)}`);
  })();

  // The process, and the promise that it is up.
  return { child, ready };
}

// One story: a name, the server it needs, and its steps. Each step does
// something, then the frame is taken with its caption. `key` marks the frame
// kept as the story's 1600px PNG.
class Story {
  // Its name, its page, its frames folder (emptied first), and its frames.
  constructor(name, page) {
    this.name = name;
    this.page = page;
    this.dir = path.join(FRAMES, name);
    this.frames = [];
    fs.rmSync(this.dir, { recursive: true, force: true });
    fs.mkdirSync(this.dir, { recursive: true });
  }

  // Wait, take the screenshot, and note the frame with its caption.
  async frame(caption, options = {}) {
    // Let fonts, transitions and live prices settle.
    await sleep(options.settle ?? 500);
    const file = `${String(this.frames.length + 1).padStart(2, "0")}.png`;
    await this.page.screenshot({ path: path.join(this.dir, file) });
    this.frames.push({
      file,
      caption,
      key: options.key || null,
      hold: options.hold || 1,
    });
    console.log(`  [${this.name}] ${file} ${caption}`);
  }

  // Write frames.json for make-gifs.py.
  save() {
    fs.writeFileSync(
      path.join(this.dir, "frames.json"),
      `${JSON.stringify({ story: this.name, frames: this.frames }, null, 2)}\n`,
    );
  }
}

// ---------------------------------------------------------------------------
// Site helpers
// ---------------------------------------------------------------------------

async function signUp(page, name) {
  // Sign up a fresh bank account through the API; returns its email.
  const email = `media-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.test`;
  const response = await page.request.post(`${SITE}/api/bank/register`, {
    data: { fullName: name, email, password: PASSWORD, acceptTerms: true },
  });
  // Anything but 201 Created is an error.
  if (response.status() !== 201) {
    throw new Error(
      `sign-up failed: ${response.status()} ${await response.text()}`,
    );
  }
  return email;
}

// ---------------------------------------------------------------------------
// Stories
// ---------------------------------------------------------------------------

async function bankTour(page) {
  // The bank tour: home, markets, a coin, the accounts, and the transfer page.
  const story = new Story("bank-tour", page);

  // The home page.
  await page.goto(`${SITE}/app`);
  await page.getByTestId("app-home").waitFor();
  await story.frame(
    "Playground Bank: a practice bank with a crypto exchange, and bugs planted on purpose",
    {
      key: "bank-home",
    },
  );

  // The markets.
  await page.goto(`${SITE}/app/markets`);
  await page.getByTestId("market-list").waitFor();
  await story.frame(
    "Eight coins with live practice prices that belong to each visitor alone",
    { settle: 1500 },
  );

  // One coin's page.
  await page.goto(`${SITE}/app/markets/BTC`);
  await page.getByTestId("coin-price").waitFor();
  await story.frame("Each coin has its own page and chart", {
    settle: 1500,
    key: "bank-coin",
  });

  // Sign up, and show the accounts.
  await signUp(page, "Maya Media");
  await page.goto(`${SITE}/app/bank`);
  await page.getByTestId("bank-total").waitFor();
  await story.frame(
    "Sign up and the bank opens real accounts in Postgres, funded with your own amounts",
    {
      key: "bank-accounts",
    },
  );

  // The transfer page.
  await page.goto(`${SITE}/app/bank/transfer`);
  await page.getByTestId("app-main").waitFor();
  await story.frame(
    "Send money, pay bills, ask for a loan: every door also has an API",
  );

  // Write the story's frames.json.
  story.save();
}

// Practice mode: the faults list, the switch, one fault caught, and its answer.
async function practiceMode(page) {
  const story = new Story("practice-mode", page);

  // Sign up, and open Your progress, the checklist of faults.
  await signUp(page, "Practice Media");
  await page.goto(`${SITE}/app/practice/progress`);
  await page.getByTestId("practice-tracker").waitFor();
  await story.frame(
    "Your progress lists every planted fault on one line each, ticked as you find them",
  );

  // Turn the faults on.
  await page.getByTestId("practice-switch").click();
  await page.waitForLoadState("load");
  await page.locator('[data-testid="practice-state"].is-on').waitFor();
  await story.frame("One switch turns every fault on, for you alone");

  // The rounding fault shows on about every second amount, so the amount is
  // found first, through the same quote the page asks for: with practice on,
  // a faulty quote's schedule ends with money still owing.
  const terms = [12, 24, 36, 60];
  let picked = null;

  // Try amounts and terms until a quote's schedule ends with money owing.
  for (let i = 0; i < 40 && !picked; i += 1) {
    const amountCents = 1_234_567 + i * 100_003;
    const termMonths = terms[i % terms.length];
    const quote = await (
      await page.request.get(
        SITE +
          "/api/bank/loans/quote?amountCents=" +
          amountCents +
          "&termMonths=" +
          termMonths,
      )
    ).json();
    const rows = Array.isArray(quote.schedule) ? quote.schedule : [];
    const left = rows.length ? rows[rows.length - 1].balanceCents : 0;
    if (left > 0) picked = { amountCents, termMonths };
  }
  if (!picked) throw new Error("no loan amount showed the rounding fault");

  // Ask for that loan on the page.
  await page.goto(`${SITE}/app/bank/loans`);
  await page.getByTestId("loan-form").waitFor();
  await page
    .getByTestId("loan-amount")
    .fill((picked.amountCents / 100).toFixed(2));
  await page.getByTestId("loan-term").selectOption(String(picked.termMonths));
  await page.getByTestId("loan-quote").waitFor();
  await story.frame("Ask for a loan quote, as a customer would", {
    settle: 1200,
  });

  // Open the schedule, and outline its last row.
  await page.getByTestId("quote-toggle-schedule").click();
  const last = page.locator(
    `[data-testid="quote-schedule-balance-${picked.termMonths}"]`,
  );
  await last.scrollIntoViewIfNeeded();
  await last.evaluate((node) => {
    node.closest("tr").style.outline = "2px solid #fb7185";
  });
  await story.frame(
    "The last payment leaves money owing: the schedule never pays the loan off",
    {
      key: "practice-caught",
      hold: 2,
    },
  );

  // Open the fault's line on Your progress, and reveal the answer.
  await page.goto(`${SITE}/app/practice/progress`);
  await page.getByTestId("bug-open-bankLoanRounding").scrollIntoViewIfNeeded();
  await page.getByTestId("bug-open-bankLoanRounding").click();
  await page.getByTestId("bug-reveal-bankLoanRounding").click();
  await page.getByTestId("bug-answer-bankLoanRounding").waitFor();
  await story.frame(
    "Check yourself: reveal the answer. Most faults are REPORT; one is HEAL",
    { hold: 2 },
  );

  // Off again, so the next story starts clean.
  await page.getByTestId("practice-switch").click();
  await page.waitForLoadState("load");

  // Write the story's frames.json.
  story.save();
}

// Cards: get one, then pay a shop with it.
async function cards(page) {
  // The story.
  const story = new Story("bank-cards", page);

  // Sign up, and open the cards page.
  await signUp(page, "Cards Media");
  await page.goto(`${SITE}/app/bank/cards`);
  await page.getByTestId("cards-issue").waitFor();
  await story.frame("Cards: one virtual debit card per account");

  // Get a card, and read its id.
  await page.locator('[data-testid^="card-get-"]').first().click();
  const card = page.locator('[data-testid^="card-"][data-status]').first();
  await card.waitFor();
  const id = (await card.getAttribute("data-testid")).replace("card-", "");
  await story.frame(
    "A card arrives with a daily limit drawn from the account's own balance",
  );

  // Open its details and type an amount.
  await page.getByTestId(`card-details-${id}`).click();
  await page.getByTestId(`spend-form-${id}`).waitFor();
  await page.getByTestId(`spend-amount-${id}`).fill("24.50");
  await story.frame("Pay a shop with it");

  // Pay, and show the result.
  await page.getByTestId(`spend-submit-${id}`).click();
  await page.getByTestId(`spend-result-${id}`).waitFor();
  await page.getByTestId(`spend-result-${id}`).scrollIntoViewIfNeeded();
  await page.mouse.wheel(0, 260);
  await story.frame(
    "Approved, and the purchase lands in the account's history",
    {
      key: "bank-cards",
      hold: 2,
    },
  );

  // Write the story's frames.json.
  story.save();
}

// Developer keys: make one, see it once, then see it kept short.
async function developerKeys(page) {
  // The story.
  const story = new Story("developer-keys", page);

  // Sign up, and name a key.
  await signUp(page, "Keys Media");
  await page.goto(`${SITE}/app/developer`);
  await page.getByTestId("key-form").waitFor();
  await page.getByTestId("key-name").fill("Postman on my laptop");
  await story.frame(
    "The Developer page: make an API key with a name and a scope",
  );

  // Make it.
  await page.getByTestId("key-create").click();
  await page.getByTestId("key-fresh").waitFor();
  await story.frame("The key is shown once, with a curl line that uses it", {
    key: "developer-keys",
    hold: 2,
  });

  // Close it: only its first characters stay in the list.
  await page.getByTestId("key-token-done").click();
  await page.getByTestId("keys-list").waitFor();
  await story.frame(
    "After that the site keeps only its first characters, and it can be revoked",
  );

  // Write the story's frames.json.
  story.save();
}

// The test runner: sign in, the dashboard, the picker, a run, a failure, and
// the history.
async function runner(page) {
  // The story.
  const story = new Story("runner", page);

  // The stub's own label is hidden in the pictures; the README says they were
  // recorded with the stub.
  await page
    .addStyleTag({ content: ".stub-flag { display: none !important; }" })
    .catch(() => {});
  page.on("load", () => {
    page
      .addStyleTag({ content: ".stub-flag { display: none !important; }" })
      .catch(() => {});
  });

  // The sign-in screen, filled in.
  await page.goto(RUNNER);
  await page.getByTestId("auth-screen").waitFor();
  await page.addStyleTag({
    content: ".stub-flag { display: none !important; }",
  });
  await page.getByTestId("signin-username").fill("maya");
  await page.getByTestId("signin-password").fill("maya-runner-pass-1");
  await story.frame(
    "A colleague signs in. No GitHub account, no repository access",
  );

  // Sign in: the dashboard.
  await page.getByTestId("signin-submit").click();
  await page.getByTestId("quick-row").first().waitFor();
  await page.getByTestId("tile-total").filter({ hasNotText: "—" }).waitFor();
  await story.frame(
    "The usual suites are one click away, with how each went last time",
    {
      key: "test-runner-dashboard",
    },
  );

  // The Run tab.
  await page.getByTestId("tab-run").click();
  await page.getByTestId("flow-row").first().waitFor();
  await story.frame(
    "Pick a level: suites, pages of the site, or single checks",
    {
      key: "runner-picker",
    },
  );

  // Search the single checks.
  await page.getByTestId("picker-level-spec").click();
  await page.getByTestId("flow-filter").fill("cards");
  await story.frame("Search finds every page about a feature, in plain words");

  // Pick a suite, and fill in the reason.
  await page.getByTestId("flow-filter").fill("");
  await page.getByTestId("picker-level-group").click();
  await page
    .locator('[data-testid="flow-run"][data-flow-id="group-sanity"]')
    .click();
  await page.getByTestId("run-confirm").waitFor();
  await page.getByTestId("run-confirm-reason").fill("before the release");
  await story.frame(
    "One question first: what runs, where, and about how long",
    {
      key: "runner-confirm",
    },
  );

  // Start it, and show it running.
  await page.getByTestId("run-confirm-start").click();
  await page.getByTestId("panel-run-view").waitFor();
  await page.getByTestId("rail-step").first().waitFor();
  await page
    .locator('[data-testid="rail-step"][data-stage="tests"][data-state="run"]')
    .waitFor({ timeout: 20_000 });
  await story.frame("The run, live: Plan, then the tests, then the report", {
    settle: 300,
  });

  // Wait for the failure.
  await page
    .getByTestId("run-view-failure")
    .first()
    .waitFor({ timeout: 30_000 });
  await story.frame("When something fails, it names the test and says why", {
    key: "runner-run-page",
    hold: 2,
  });

  // Back to the history.
  await page.getByTestId("run-view-back").click();
  await page.getByTestId("history-row").first().waitFor();
  await story.frame("Every run, with who started it and how it went", {
    hold: 2,
  });

  // Write the story's frames.json.
  story.save();
}

// The Reports and Triage tabs over the stub's two weeks of seeded runs.
async function runnerReports(page) {
  // The story, and a way to hide the stub's label on every page.
  const story = new Story("runner-reports", page);
  const hideStub = () =>
    page
      .addStyleTag({ content: ".stub-flag { display: none !important; }" })
      .catch(() => {});

  // Hide it on each page load, and open the runner.
  page.on("load", hideStub);
  await page.goto(RUNNER);
  await hideStub();

  // Sign in.
  await page.getByTestId("auth-screen").waitFor();
  await page.getByTestId("signin-username").fill("maya");
  await page.getByTestId("signin-password").fill("maya-runner-pass-1");
  await page.getByTestId("signin-submit").click();
  await page.getByTestId("runner-screen").waitFor();

  // The Reports tab.
  await page.getByTestId("tab-reports").click();
  await page.getByTestId("report-runs").filter({ hasNotText: "—" }).waitFor();
  await story.frame("Reports: two weeks of runs, as pass rates and charts", {
    key: "runner-reports",
    settle: 300,
  });

  // The pass-rate chart.
  await page.getByTestId("chart-pass-rate").scrollIntoViewIfNeeded();
  await story.frame("Every run's pass rate and size, drawn in plain SVG");

  // Back to the top, filtered to one flow.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByTestId("reports-flow").selectOption("group-regression");
  await page.getByTestId("report-runs").filter({ hasNotText: "—" }).waitFor();
  await story.frame("Filter by flow, person, period or outcome", {
    settle: 400,
  });

  // The Triage tab, for every flow.
  await page.getByTestId("tab-triage").click();
  await page
    .getByTestId("reports-flow")
    .selectOption("")
    .catch(() => {});
  await page.getByTestId("triage-flow").selectOption("");
  await page.getByTestId("triage-test").first().waitFor();
  await story.frame("Triage: what fails most, what is flaky, and why", {
    settle: 400,
  });

  // Open the first failure.
  const first = page.getByTestId("triage-test").first();
  await first.locator("summary").click();
  await first.getByTestId("triage-similar").waitFor();
  await story.frame(
    "Each failure: its kind, where to look, and similar known problems",
    { key: "runner-triage", hold: 2 },
  );

  // The failures grouped by error.
  await page.getByTestId("triage-groups").scrollIntoViewIfNeeded();
  await story.frame(
    "The same error, grouped; the whole page downloads as HTML or CSV",
    {
      hold: 2,
    },
  );

  // Write the story's frames.json.
  story.save();
}

// ---------------------------------------------------------------------------
// Tracing helpers
// ---------------------------------------------------------------------------

// Jaeger on this PC (`npm run trace:up`): the viewer, and its API.
const JAEGER = "http://127.0.0.1:16686";

// Whether Jaeger is up: its list of services answers.
async function jaegerIsUp() {
  try {
    return (await fetch(`${JAEGER}/api/v3/services`)).ok;
  } catch {
    return false;
  }
}

// The id of the trace whose request span carries this bank request id. Spans
// reach Jaeger in batches, so it asks every half second for up to 15 seconds.
async function traceFor(operation, requestId) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    // The traces for that route in the last ten minutes.
    const now = Date.now();
    const query = new URLSearchParams({
      "query.service_name": "playground-bank",
      "query.operation_name": operation,
      "query.start_time_min": new Date(now - 600_000).toISOString(),
      "query.start_time_max": new Date(now + 60_000).toISOString(),
    });
    const answer = await fetch(`${JAEGER}/api/v3/traces?${query}`);
    if (answer.ok) {
      // Every span in the answer, and the one with this request id.
      const body = await answer.json();
      const spans = (body.result?.resourceSpans ?? []).flatMap((resource) =>
        (resource.scopeSpans ?? []).flatMap((scope) => scope.spans ?? []),
      );
      const found = spans.find((span) =>
        (span.attributes ?? []).some(
          (a) =>
            a.key === "bank.request_id" && a.value?.stringValue === requestId,
        ),
      );
      if (found) return found.traceId;
    }
    await sleep(500);
  }
  throw new Error(`no trace for ${operation} with request id ${requestId}`);
}

// A bank customer for the API only: a separate cookie jar, signed up and
// signed in. Returns the request context.
async function apiCustomer(name) {
  const { request } = require("playwright");
  const api = await request.newContext({ baseURL: SITE });
  const email = `media-${name.toLowerCase()}-${Date.now()}@example.test`;
  const signUp = await api.post("/api/bank/register", {
    data: {
      fullName: `${name} Media`,
      email,
      password: PASSWORD,
      acceptTerms: true,
    },
  });
  const signIn = await api.post("/api/bank/login", {
    data: { email, password: PASSWORD },
  });
  // Anything but 201 and 200 is an error.
  if (signUp.status() !== 201 || signIn.status() !== 200) {
    throw new Error(
      `${name} could not sign up and in: ${signUp.status()}, ${signIn.status()}`,
    );
  }
  return { api, signInId: signIn.headers()["x-request-id"] };
}

// One trace in Jaeger, with its UPDATE bank_payees span and that span's
// attributes opened, so the query text shows.
async function openPayeeQuery(page, traceId) {
  await page.goto(`${JAEGER}/trace/${traceId}`);
  await page.getByRole("switch", { name: /UPDATE bank_payees/ }).click();
  await page.getByRole("switch", { name: /^Attributes:/ }).click();
}

async function tracing(page) {
  // Tracing: the trace list, one request's queries, and a planted bug that
  // the trace explains. The site was started with tracing on (see main).
  const story = new Story("tracing", page);

  // Alice saves a payee; Bob, a second customer, will try to delete it.
  const alice = await apiCustomer("Alice");
  const bob = await apiCustomer("Bob");
  const saved = await alice.api.post("/api/bank/payees", {
    data: { name: "Alice Landlord", reference: "ACC-12345" },
  });
  const payeeId = (await saved.json()).payee.id;

  // Practice mode off: the bank refuses (404, no such payee for Bob).
  const refused = await bob.api.delete(`/api/bank/payees/${payeeId}`, {
    data: {},
  });
  // Practice mode on, for Bob's session only, then the same delete (200).
  await bob.api.post("/api/practice", { data: { on: true } });
  const allowed = await bob.api.delete(`/api/bank/payees/${payeeId}`, {
    data: {},
  });
  if (refused.status() !== 404 || allowed.status() !== 200) {
    throw new Error(
      `the payee delete answered ${refused.status()} then ${allowed.status()}, not 404 then 200`,
    );
  }

  // The three traces: Bob's sign-in, and the two deletes.
  const signInTrace = await traceFor("POST /api/bank/login", bob.signInId);
  const refusedTrace = await traceFor(
    "DELETE /api/bank/payees/:id",
    refused.headers()["x-request-id"],
  );
  const allowedTrace = await traceFor(
    "DELETE /api/bank/payees/:id",
    allowed.headers()["x-request-id"],
  );

  // The trace list.
  await page.goto(
    `${JAEGER}/search?service=playground-bank&lookback=5m&limit=20`,
  );
  await page.getByRole("heading", { name: /\d+ traces?/ }).waitFor();
  await story.frame(
    "Tracing on: every request the bank answers lands in Jaeger, on your PC",
    { settle: 800 },
  );

  // One request and its queries.
  await page.goto(`${JAEGER}/trace/${signInTrace}`);
  await page
    .getByRole("switch", { name: /SELECT bank_users/ })
    .first()
    .waitFor();
  await story.frame(
    "One sign-in: the request on top, and every database query it ran, each timed",
    { settle: 800 },
  );

  // The delete with practice mode off: the query checks the owner.
  await openPayeeQuery(page, refusedTrace);
  await story.frame(
    "Bob deletes Alice's payee and gets 404: the query checks the owner (user_id = $2)",
    { settle: 800, hold: 2 },
  );

  // The same delete with practice mode on: the owner check is gone.
  await openPayeeQuery(page, allowedTrace);
  await story.frame(
    "Practice mode on: 200, and the trace shows why. The owner check is gone",
    { settle: 800, hold: 2, key: "tracing-payee-trace" },
  );

  // The same bug from its own test: `npm run test:traced` runs the planted
  // payee test, whose steps and the bank's spans share one trace. It starts
  // the suite's own site on 4173, without DATABASE_URL so it can never touch
  // Neon, and prints the link to the test's trace in its [RESULT] block.
  const env = { ...process.env, FORCE_COLOR: "0" };
  delete env.DATABASE_URL;
  const run = spawnSync(
    process.execPath,
    [
      path.join(ROOT, "scripts", "tracing", "test-traced.js"),
      "tests/e2e/app/bank-money-bugs.spec.ts",
      "-g",
      "bankPayeeIdor",
    ],
    { cwd: ROOT, env, encoding: "utf8" },
  );
  const testTrace = /\/trace\/([0-9a-f]{32})/.exec(run.stdout ?? "")?.[1];
  if (run.status !== 0 || !testTrace) {
    throw new Error(
      `the traced test run failed:\n${`${run.stdout}${run.stderr}`.slice(-2000)}`,
    );
  }
  await page.goto(`${JAEGER}/trace/${testTrace}`);
  await page
    .getByRole("switch", { name: /POST \/api\/bank\/register/ })
    .first()
    .waitFor();
  await story.frame(
    "From the test itself: its steps (blue) and the bank's spans (orange) on one timeline",
    { settle: 800, hold: 2 },
  );

  // Close the two customers' cookie jars, and write the story's frames.json.
  await alice.api.dispose();
  await bob.api.dispose();
  story.save();
}

// A text made safe to put inside HTML.
function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// A terminal window holding real output, for the load-tests story. A line of
// null is a gap where lines were left out; a line starting "$ " is the
// command typed.
function terminalHtml(title, lines) {
  // Each line coloured by what it is: the command, a pass, the [RESULT]
  // frame, a gap, or plain output.
  const rows = lines.map((line) => {
    if (line === null) return `<div class="gap">…</div>`;
    let kind = "";
    if (line.startsWith("$ ")) kind = "prompt";
    else if (/✓|PASSED|: adds up|: balanced|none below zero/.test(line))
      kind = "pass";
    else if (/\[RESULT\]|^=+$/.test(line)) kind = "frame";
    return `<div class="${kind}">${escapeHtml(line) || "&nbsp;"}</div>`;
  });
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    html, body { margin: 0; height: 100%; background: #0b0e14; }
    body { display: flex; padding: 28px; box-sizing: border-box; }
    .window { flex: 1; border: 1px solid #232a35; border-radius: 12px;
      background: #11151c; overflow: hidden; display: flex; flex-direction: column; }
    .bar { display: flex; align-items: center; gap: 8px; padding: 12px 16px;
      border-bottom: 1px solid #232a35; color: #8b949e;
      font: 15px "Segoe UI", system-ui, sans-serif; }
    .dot { width: 12px; height: 12px; border-radius: 50%; background: #30363d; }
    .bar span { margin-left: 10px; }
    pre { margin: 0; padding: 20px 28px; color: #c9d1d9; white-space: pre;
      font: 20px/1.4 "Cascadia Mono", Consolas, "DejaVu Sans Mono", monospace; }
    .prompt { color: #7ee787; }
    .pass { color: #56d364; }
    .frame { color: #79c0ff; }
    .gap { color: #6e7681; }
  </style></head><body><div class="window">
    <div class="bar"><i class="dot"></i><i class="dot"></i><i class="dot"></i><span>${escapeHtml(title)}</span></div>
    <pre>${rows.join("")}</pre>
  </div></body></html>`;
}

// Load tests: the six k6 stages in the test runner, then a real stress run on
// this PC. The run is real: `npm run k6:stress` starts its own fresh bank on
// 127.0.0.1:4174 (PGlite in memory, never Neon), and the terminal frames show
// its own output, cut but never written by hand.
async function loadTests(page) {
  // The story.
  const story = new Story("load-tests", page);

  // The stub's own label is hidden, as in the runner story.
  const hideStub = () =>
    page
      .addStyleTag({ content: ".stub-flag { display: none !important; }" })
      .catch(() => {});
  page.on("load", hideStub);

  // Sign in, open the Run tab at the suites, and show the Performance (k6)
  // heading with its six load tests.
  await page.goto(RUNNER);
  await page.getByTestId("auth-screen").waitFor();
  await hideStub();
  await page.getByTestId("signin-username").fill("maya");
  await page.getByTestId("signin-password").fill("maya-runner-pass-1");
  await page.getByTestId("signin-submit").click();
  await page.getByTestId("quick-row").first().waitFor();
  await page.getByTestId("tab-run").click();
  await page.getByTestId("picker-level-group").click();
  const performance = page
    .getByTestId("flow-list")
    .locator('[data-testid="suite-section"][data-category="performance"]');
  await performance.waitFor();
  await performance.evaluate((section) =>
    section.scrollIntoView({ block: "center" }),
  );
  await story.frame(
    "The test runner's suites: six k6 load tests under Performance (k6)",
  );

  // Pick the Load test: one question first.
  await page
    .locator('[data-testid="flow-run"][data-flow-id="group-perf-load"]')
    .click();
  await page.getByTestId("run-confirm").waitFor();
  await page.getByTestId("run-confirm-reason").fill("before the release");
  await story.frame(
    "It runs on a GitHub machine against a fresh bank started there, never a deployed site",
  );
  await page.getByTestId("run-confirm-cancel").click();

  // The real run on this PC. Its database is in memory: DATABASE_URL is
  // removed here, and run.js removes it again.
  const env = { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" };
  delete env.DATABASE_URL;
  console.log("  [load-tests] running npm run k6:stress (about a minute)");
  const run = spawnSync("npm run k6:stress", {
    cwd: ROOT,
    env,
    encoding: "utf8",
    shell: true,
  });
  // The whole output is kept beside the frames, to check them against.
  fs.writeFileSync(path.join(story.dir, "k6-output.txt"), run.stdout ?? "");
  if (run.status !== 0) {
    throw new Error(
      `npm run k6:stress failed (${run.status}):\n${`${run.stdout}${run.stderr}`.slice(-2000)}`,
    );
  }
  const out = run.stdout.replace(/\r/g, "").split("\n");

  // Where each part of the output starts: k6's scenarios, the first progress
  // block past half way, the last progress block, and the [RESULT] block.
  // The first line matching from a place on, and the last one before a place.
  const find = (test, from = 0) => {
    const at = out.findIndex((line, index) => index >= from && test(line));
    if (at < 0) throw new Error(`the k6 output has no line matching ${test}`);
    return at;
  };
  const lastBefore = (test, before) => {
    for (let index = before - 1; index >= 0; index -= 1) {
      if (test(out[index])) return index;
    }
    throw new Error(`the k6 output has no line matching ${test}`);
  };
  const progressStart = (line) => line.startsWith("running (");
  const blank = (line) => line.trim() === "";
  const banner = find((line) => line.includes("Grafana"));
  const scenarios = find((line) => line.includes("scenarios:"));
  const scenarioEnd = find(blank, scenarios);
  // A scenario's progress line ("checkouts [ 51% ] 6 VUs ..."), not setup's.
  const half = find((line) => {
    const percent = /\[\s*(\d+)% \] .*VUs/.exec(line);
    return Boolean(percent) && Number(percent[1]) >= 50;
  }, scenarioEnd);
  const halfBlock = lastBefore(progressStart, half);
  const result = find((line) => line.includes("[RESULT]"));
  const resultEnd = find((line) => /^=+$/.test(line), result + 1);
  const lastBlock = lastBefore(progressStart, result);
  const blockEnd = (start) => find(blank, start);

  // Frame: the command, the fresh bank, k6 and its scenarios.
  const command = "$ npm run k6:stress";
  const head = out.slice(0, banner).filter((line) => !blank(line));
  await page.goto("about:blank");
  await page.setContent(
    terminalHtml("npm run k6:stress", [
      command,
      ...head,
      "",
      ...out.slice(banner, scenarioEnd),
    ]),
  );
  await story.frame(
    "Or on this PC: npm run k6:stress starts its own fresh bank, then k6",
  );

  // Frame: the run past half way.
  await page.setContent(
    terminalHtml("npm run k6:stress", [
      command,
      ...head,
      null,
      ...out.slice(scenarios, scenarioEnd),
      null,
      ...out.slice(halfBlock, blockEnd(halfBlock)),
    ]),
  );
  await story.frame(
    "k6's virtual users shop, sign in and move money at the same time",
  );

  // Frame: the end and the [RESULT] block.
  await page.setContent(
    terminalHtml("npm run k6:stress", [
      command,
      null,
      ...out.slice(lastBlock, blockEnd(lastBlock)),
      "",
      ...out.slice(result, resultEnd + 1),
    ]),
  );
  await story.frame(
    "The [RESULT] block: speed against its limit, refusals by code, and the money still adds up",
    { hold: 3, key: "load-tests-result" },
  );

  // Write the story's frames.json.
  story.save();
}

// Every story, the server it needs, and what records it.
const STORIES = {
  runner: { server: "runner", run: runner },
  "runner-reports": { server: "runner", run: runnerReports },
  // Needs k6 on the PC and port 4174 free; runs a real stress test (a minute).
  "load-tests": { server: "runner", run: loadTests },
  "bank-tour": { server: "site", run: bankTour },
  "practice-mode": { server: "site", run: practiceMode },
  "bank-cards": { server: "site", run: cards },
  "developer-keys": { server: "site", run: developerKeys },
  // Needs Jaeger up (`npm run trace:up`); the site then starts with tracing on.
  tracing: { server: "site", run: tracing },
};

// ---------------------------------------------------------------------------

function findPython() {
  // The first of python3, python or py that has Pillow; null when none does.
  for (const candidate of ["python3", "python", "py"]) {
    // Try importing Pillow with it.
    const probe = spawnSync(
      candidate,
      ["-c", "import PIL; print(PIL.__version__)"],
      {
        encoding: "utf8",
      },
    );
    if (probe.status === 0) return candidate;
  }
  return null;
}

// Record each story asked for, then turn the frames into GIFs and PNGs.
async function main() {
  // --frames, and the story names asked for (all of them by default).
  const args = process.argv.slice(2);
  const framesOnly = args.includes("--frames");
  const wanted = args.filter((arg) => !arg.startsWith("--"));
  const names = wanted.length ? wanted : Object.keys(STORIES);

  // Every name must be a story.
  for (const name of names) {
    if (!STORIES[name]) {
      throw new Error(
        `Unknown story "${name}". Stories: ${Object.keys(STORIES).join(", ")}`,
      );
    }
  }

  // Python with Pillow is needed unless --frames.
  const python = framesOnly ? null : findPython();
  if (!framesOnly && !python) {
    throw new Error(
      "make-gifs.py needs Python 3 with Pillow: pip install pillow",
    );
  }

  // Which servers the stories need.
  const needSite = names.some((name) => STORIES[name].server === "site");
  const needRunner = names.some((name) => STORIES[name].server === "runner");
  const servers = [];

  // The site needs its front end built: build it when it is missing.
  if (
    needSite &&
    !fs.existsSync(path.join(ROOT, "public", "app", "index.html"))
  ) {
    // Run npm run build.
    console.log("[media] building /app first");
    const build = spawnSync(
      process.platform === "win32" ? "npm.cmd" : "npm",
      ["run", "build"],
      {
        cwd: ROOT,
        stdio: "inherit",
        shell: process.platform === "win32",
      },
    );
    if (build.status !== 0) throw new Error("npm run build failed");
  }

  // The tracing story needs Jaeger: say how to start it, rather than record
  // empty frames.
  const needJaeger = names.includes("tracing");
  if (needJaeger && !(await jaegerIsUp())) {
    throw new Error(
      `the tracing story needs Jaeger on ${JAEGER}: start Docker Desktop, then npm run trace:up`,
    );
  }

  // The site: in memory (DATABASE_URL removed), with a short sign-in hold.
  if (needSite) {
    // Its settings. With the tracing story, tracing is on too, sending to
    // Jaeger every 200 ms.
    const env = { ...process.env, BANK_LOGIN_HOLD_SECONDS: "4" };
    delete env.DATABASE_URL;
    if (needJaeger) {
      env.OTEL_EXPORTER_OTLP_ENDPOINT = "http://127.0.0.1:4318";
      env.OTEL_SERVICE_NAME = "playground-bank";
      env.OTEL_BSP_SCHEDULE_DELAY = "200";
    }
    servers.push(
      startServer(
        "the site",
        ["server.js", String(SITE_PORT)],
        ROOT,
        env,
        SITE,
        "/api/bank/health/ready",
      ),
    );
  }

  // The runner: GitHub replaced by its stub, a fresh users file, and one
  // account.
  if (needRunner) {
    // A fresh users file.
    const usersFile = path.join(FRAMES, "runner-users.json");
    fs.mkdirSync(FRAMES, { recursive: true });
    fs.rmSync(usersFile, { force: true });
    const env = {
      ...process.env,
      TR_GITHUB_STUB: "1",
      TR_STUB_STEP_MS: "2500",
      // The run the README shows failing, so it can show what a failure
      // looks like without a marker in its reason.
      TR_STUB_FAIL: "group-sanity",
      TR_GITHUB_TOKEN: "",
      TR_REPO: "asaf-1/Agents-Playground",
      TR_PORT: String(RUNNER_PORT),
      TR_HOST: "127.0.0.1",
      TR_SIGNUP_MODE: "open",
      TR_USERS_FILE: usersFile,
    };
    const started = startServer(
      "the runner",
      ["server.js"],
      path.join(ROOT, "test-runner"),
      env,
      RUNNER,
      "/api/health",
    );
    servers.push(started);
    await started.ready;
    const signup = await fetch(`${RUNNER}/api/signup`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        username: "maya",
        password: "maya-runner-pass-1",
      }),
    });
    if (signup.status !== 201)
      throw new Error(`runner sign-up failed: ${signup.status}`);
  }

  // Playwright's Chromium.
  const { chromium } = require("playwright");
  let browser;

  // The browser and the servers are stopped at the end, even after an error.
  try {
    // Wait for the servers, then open the browser (Chrome on Windows).
    await Promise.all(servers.map((server) => server.ready));
    browser = await chromium.launch({
      channel: process.platform === "win32" ? "chrome" : undefined,
    });

    // Record each story in a fresh dark window.
    for (const name of names) {
      // Say which one.
      console.log(`[media] ${name}`);
      const context = await browser.newContext({
        viewport: VIEWPORT,
        colorScheme: "dark",
        reducedMotion: "reduce",
      });
      const page = await context.newPage();
      await STORIES[name].run(page);
      await context.close();
    }
  } finally {
    if (browser) await browser.close();
    for (const server of servers) server.child.kill();
  }

  // --frames: stop here.
  if (framesOnly) return;

  // Turn the frames into the GIFs and PNGs.
  const made = spawnSync(
    python,
    [path.join(__dirname, "make-gifs.py"), FRAMES, ASSETS, ...names],
    { cwd: ROOT, stdio: "inherit" },
  );
  if (made.status !== 0) throw new Error("make-gifs.py failed");
}

// Run it; an error prints its message and fails.
main().catch((error) => {
  console.error(`[media] ${error.message}`);
  process.exit(1);
});
