// Standalone test runner.
//
// This is its own application. It shares no code, no port, and no process with
// the repository's demo website (the thing being tested). Its whole job is:
//
//   1. let a person sign in with an account issued here, and
//   2. let them start a test run in GitHub Actions,
//
// while giving them no GitHub account, no repository access, and no visibility
// into the pipeline. The GitHub token lives only in this process and is never
// sent to the browser, echoed in a response, or written to a log.
//
// Deploy it wherever you like: bare `node server.js`, no dependencies, no build.

// Node's web server, files and paths.
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

// This app's settings, sign-in, the GitHub pipeline, and the reports.
const { config } = require("./src/config.js");
const auth = require("./src/auth.js");
const github = require("./src/github.js");
const reports = require("./src/reports.js");

// Where the page's files are, and the largest request body accepted (100 KB).
const PUBLIC_DIR = path.join(__dirname, "public");
const MAX_BODY_BYTES = 100 * 1024;

// The content type for each kind of file served.
const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

// The UI is self-contained by design, so the policy can be strict: no external
// origins at all. 'unsafe-inline' covers only the stylesheet, not scripts.
const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
].join("; ");

// The security headers every answer carries.
function securityHeaders() {
  return {
    "Content-Security-Policy": CSP,
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
  };
}

// Send a JSON answer, never cached, with a cookie when there is one.
function sendJson(response, statusCode, payload, setCookie) {
  const headers = {
    ...securityHeaders(),
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
  };

  if (setCookie) headers["Set-Cookie"] = setCookie;

  response.writeHead(statusCode, headers);
  response.end(JSON.stringify(payload));
}

// Errors carry .statusCode when they are the caller's fault, .status when they
// came back from GitHub. Anything else is ours and must not leak internals.
function sendError(response, error) {
  // Our own errors become a 500 with a plain message; a GitHub error becomes a
  // 502.
  const status =
    error.statusCode || (error.status >= 400 && error.status < 600 ? 502 : 500);
  const message =
    status >= 500 && !error.statusCode && !error.status
      ? "The test runner hit an unexpected error."
      : error.message;

  // Server errors go to the log.
  if (status >= 500) {
    console.error(`[runner] ${error.stack || error.message}`);
  }

  sendJson(response, status, { message });
}

// Read a request's JSON body: refuse one over 100 KB, and anything that isn't a
// JSON object.
function readBody(request) {
  return new Promise((resolve, reject) => {
    let raw = "";
    let aborted = false;

    // Collect the body as it arrives.
    request.on("data", (chunk) => {
      if (aborted) return;

      raw += chunk;

      // Refuse oversized bodies rather than buffering them: this endpoint is
      // reachable before authentication.
      if (raw.length > MAX_BODY_BYTES) {
        aborted = true;
        const error = new Error("Request body too large.");
        error.statusCode = 413;
        reject(error);
        request.destroy();
      }
    });

    // Once it has all arrived: empty means {}, otherwise it must be a JSON
    // object.
    request.on("end", () => {
      if (aborted) return;
      if (!raw) return resolve({});

      try {
        const parsed = JSON.parse(raw);

        if (parsed === null || typeof parsed !== "object") {
          throw new Error("not an object");
        }

        resolve(parsed);
      } catch {
        const error = new Error("Request body must be a JSON object.");
        error.statusCode = 400;
        reject(error);
      }
    });

    // A broken connection fails the read.
    request.on("error", reject);
  });
}

// Serves only the known UI files. An allowlist rather than path joining, so no
// traversal is possible even in principle. The three fonts are the same files
// the Playground Bank site bundles, copied in so the two look like one product
// without this app reaching any other origin for them.
const STATIC_FILES = new Map([
  ["/", "index.html"],
  ["/index.html", "index.html"],
  ["/app.js", "app.js"],
  ["/styles.css", "styles.css"],
  ["/favicon.ico", "favicon.ico"],
  ["/fonts/inter.woff2", "fonts/inter.woff2"],
  ["/fonts/space-grotesk.woff2", "fonts/space-grotesk.woff2"],
  ["/fonts/jetbrains-mono.woff2", "fonts/jetbrains-mono.woff2"],
]);

// Serve one of the page's files, with the right type.
function serveStatic(pathname, response) {
  const name = STATIC_FILES.get(pathname);

  // Not in the list: 404.
  if (!name) {
    response.writeHead(404, {
      ...securityHeaders(),
      "Content-Type": "text/plain; charset=utf-8",
    });
    response.end("Not found");
    return;
  }

  const filePath = path.join(PUBLIC_DIR, name);

  // In the list but missing on disk: 404 too.
  if (!fs.existsSync(filePath)) {
    response.writeHead(404, {
      ...securityHeaders(),
      "Content-Type": "text/plain; charset=utf-8",
    });
    response.end("Not found");
    return;
  }

  // Send it: fonts may be cached for a year, everything else never.
  response.writeHead(200, {
    ...securityHeaders(),
    // The UI is one small bundle and correctness beats caching here: a stale
    // app.js against a newer API is a confusing failure to debug. A font never
    // changes under its name, so it is the one thing a browser may keep.
    "Cache-Control": name.startsWith("fonts/")
      ? "public, max-age=31536000, immutable"
      : "no-store",
    "Content-Type":
      MIME_TYPES[path.extname(name)] || "application/octet-stream",
  });
  fs.createReadStream(filePath).pipe(response);
}

// Why dispatch is or is not available, in terms the UI can show verbatim.
function dispatchState() {
  // The settings, and the problems they already report.
  const current = config();
  const reasons = [...current.errors];

  // config() already reports misconfiguration in detail. Only add a generic
  // hint when it has not already covered that variable, so the UI never shows
  // the same problem twice in different words.
  const covers = (variable) =>
    reasons.some((reason) => reason.includes(variable));

  // No token: add a hint, unless the settings already named it.
  if (!current.canDispatch && !covers("TR_GITHUB_TOKEN")) {
    reasons.push(
      "No GitHub token. Set TR_GITHUB_TOKEN (fine-grained, actions:write on the repo) to start runs.",
    );
  }

  // No repository: the same.
  if (!current.repo && !covers("TR_REPO")) {
    reasons.push('No repository. Set TR_REPO to "owner/repo".');
  }

  // Whether runs can start, against which repository, branch and workflow, and
  // why not.
  return {
    configured: Boolean(current.canDispatch && current.repo),
    // Said on every screen that names the target, so a pretend pipeline is
    // never mistaken for the real one.
    stub: current.stub,
    repo: current.repo,
    ref: current.ref,
    workflowFile: current.workflowFile,
    reasons: [...new Set(reasons)],
  };
}

// Every /api/ call: sign-up and sign-in, the flows, runs, reports, and the
// admin's account tools.
async function handleApi(request, response, url) {
  const { pathname } = url;
  const method = request.method;

  // Health: is the runner up, and is it in stub mode.
  if (method === "GET" && pathname === "/api/health") {
    return sendJson(response, 200, {
      status: "ok",
      service: "test-runner",
      stub: config().stub,
    });
  }

  // Public: the UI calls this first to choose between sign-in and sign-up.
  if (method === "GET" && pathname === "/api/session") {
    return sendJson(response, 200, auth.sessionInfo(request));
  }

  // Sign up: a new account, signed in at once.
  if (method === "POST" && pathname === "/api/signup") {
    const body = await readBody(request);
    // signup/login take the request so auth can rate limit per client IP, and
    // are async because password derivation runs off-thread now.
    const result = await auth.signup(request, {
      username: body.username,
      password: body.password,
      inviteCode: body.inviteCode,
    });

    return sendJson(
      response,
      201,
      { username: result.username, role: result.role },
      result.cookie,
    );
  }

  // Sign in.
  if (method === "POST" && pathname === "/api/login") {
    const body = await readBody(request);
    const result = await auth.login(request, body.username, body.password);

    return sendJson(
      response,
      200,
      { username: result.username, role: result.role },
      result.cookie,
    );
  }

  // Sign out.
  if (method === "POST" && pathname === "/api/logout") {
    const result = auth.logout(request);
    return sendJson(response, 200, { authenticated: false }, result.cookie);
  }

  // Everything below requires a signed-in user. The flow list is included:
  // flow entries name internal spec paths, so it is not public.
  if (method === "GET" && pathname === "/api/flows") {
    auth.requireUser(request);

    // The environment list rides along with the catalog rather than living on
    // its own endpoint. The run panel already gates on this fetch, already
    // renders its failure, and already drives the reconcile pass over the
    // options form; a second endpoint would need its own polling, its own error
    // surface and its own cache story for a payload of a handful of strings.
    // Both are cached in github.js, so this stays one round trip.
    const [catalog, environments] = await Promise.all([
      github.getFlows(),
      github.getEnvironments(),
    ]);

    return sendJson(response, 200, {
      flows: catalog.flows,
      totals: catalog.totals,
      source: catalog.source,
      error: catalog.error || null,
      dispatch: dispatchState(),
      // Behind the same requireUser() gate as the flows: environment names and
      // internal base URLs describe the deployment topology as surely as spec
      // paths do.
      environments: {
        default: environments.default,
        entries: environments.entries,
        source: environments.source,
        error: environments.error || null,
      },
    });
  }

  // Start a run of a flow, with its options, in the user's name.
  if (method === "POST" && pathname === "/api/runs") {
    const user = auth.requireUser(request);
    const body = await readBody(request);

    const result = await github.startRun(
      body.flowId,
      {
        shards: body.shards,
        browser: body.browser,
        retries: body.retries,
        workers: body.workers,
        environment: body.environment,
        targetUrl: body.targetUrl,
        reason: body.reason,
      },
      user.username,
    );

    return sendJson(response, 202, result);
  }

  // The latest runs.
  if (method === "GET" && pathname === "/api/runs") {
    auth.requireUser(request);
    const limit = url.searchParams.get("limit");

    return sendJson(response, 200, await github.listRuns(limit));
  }

  // Everything the dashboard needs in one request, so the landing tab is a
  // single round trip rather than three.
  if (method === "GET" && pathname === "/api/dashboard") {
    auth.requireUser(request);

    // The run stats and the flow list, asked for together.
    const [stats, catalog] = await Promise.all([
      github.getStats(50),
      github.getFlows(),
    ]);

    // How many flows of each kind.
    const byKind = {};
    for (const flow of catalog.flows) {
      byKind[flow.kind] = (byKind[flow.kind] || 0) + 1;
    }

    return sendJson(response, 200, {
      stats,
      flows: { total: catalog.flows.length, byKind },
      dispatch: dispatchState(),
    });
  }

  // The Reports and Triage tabs: the last 1, 7 or 14 days of runs, read from
  // the run list and each run's results file (src/reports.js).
  if (method === "GET" && pathname === "/api/reports") {
    auth.requireUser(request);

    return sendJson(response, 200, await reports.getReport(url.searchParams));
  }

  // The same report as a file to keep: an HTML page grouped by failure
  // category, or a CSV with one row per failed or flaky test.
  if (method === "GET" && pathname === "/api/reports/download") {
    auth.requireUser(request);

    // CSV or HTML, then the report itself.
    const format = url.searchParams.get("format") === "csv" ? "csv" : "html";
    const report = await reports.getReport(url.searchParams);
    const body =
      format === "csv" ? reports.toCsv(report) : reports.toHtml(report);

    // Send it as a file to keep.
    response.writeHead(200, {
      ...securityHeaders(),
      "Cache-Control": "no-store",
      "Content-Type":
        format === "csv"
          ? "text/csv; charset=utf-8"
          : "text/html; charset=utf-8",
      "Content-Disposition": `attachment; filename="${reports.downloadName(report, format)}"`,
    });
    response.end(body);
    return;
  }

  // Sub-resources are matched before the generic run lookup below, otherwise
  // "/api/runs/123/logs" would be read as a run id of "123/logs".
  const runSubResource = pathname.match(
    /^\/api\/runs\/([^/]+)\/(cancel|logs|results)$/,
  );

  if (runSubResource) {
    const [, runId, action] = runSubResource;

    // Cancel a run, in the user's name.
    if (action === "cancel" && method === "POST") {
      const user = auth.requireUser(request);
      return sendJson(
        response,
        202,
        await github.cancelRun(runId, user.username),
      );
    }

    // A run's log.
    if (action === "logs" && method === "GET") {
      auth.requireUser(request);
      return sendJson(response, 200, await github.getRunLogs(runId));
    }

    // Which tests failed, from the Report job's results artifact. Never a
    // failure of the request when there is nothing to read: the answer says
    // so, with the reason, and the run page shows that instead.
    if (action === "results" && method === "GET") {
      auth.requireUser(request);
      return sendJson(response, 200, await github.getRunResults(runId));
    }

    // Any other method: 405.
    return sendJson(response, 405, { message: "Method not allowed." });
  }

  // One run.
  if (method === "GET" && pathname.startsWith("/api/runs/")) {
    auth.requireUser(request);
    const runId = pathname.slice("/api/runs/".length);

    return sendJson(response, 200, await github.getRun(runId));
  }

  // --- account administration -------------------------------------------
  // Every path below is admin-only. requireAdmin throws 401 when nobody is
  // signed in and 403 for a signed-in non-admin.

  if (method === "GET" && pathname === "/api/users") {
    auth.requireAdmin(request);
    const current = config();

    // Every account, and how sign-up works now.
    return sendJson(response, 200, {
      users: auth.adminListUsers(),
      signupMode: current.signupMode,
      inviteCodeSet: Boolean(current.inviteCode),
    });
  }

  // An account's own path, or its password path.
  const userResource = pathname.match(/^\/api\/users\/([^/]+)(\/password)?$/);

  // Admin only: reset a password, change a role, or delete an account.
  if (userResource) {
    const admin = auth.requireAdmin(request);
    const target = decodeURIComponent(userResource[1]);
    const isPassword = Boolean(userResource[2]);

    // Reset the account's password.
    if (isPassword && method === "POST") {
      const body = await readBody(request);
      return sendJson(
        response,
        200,
        await auth.adminResetPassword(
          request,
          admin.username,
          target,
          body.password,
        ),
      );
    }

    // Change its role.
    if (!isPassword && method === "PATCH") {
      const body = await readBody(request);
      return sendJson(
        response,
        200,
        auth.adminSetRole(admin.username, target, body.role),
      );
    }

    // Delete it.
    if (!isPassword && method === "DELETE") {
      return sendJson(
        response,
        200,
        auth.adminDeleteUser(admin.username, target),
      );
    }

    // Any other method: 405.
    return sendJson(response, 405, { message: "Method not allowed." });
  }

  // Anything else: 404.
  return sendJson(response, 404, { message: "No such endpoint." });
}

// The server: /api/ calls go to handleApi, everything else to the page's files;
// any error becomes an answer.
const server = http.createServer(async (request, response) => {
  let url;

  // A malformed address is a 400.
  try {
    url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  } catch {
    return sendJson(response, 400, { message: "Malformed request URL." });
  }

  try {
    if (url.pathname.startsWith("/api/")) {
      await handleApi(request, response, url);
      return;
    }

    serveStatic(url.pathname, response);
  } catch (error) {
    sendError(response, error);
  }
});

// A port in use, or the like, stops the start with a message.
server.on("error", (error) => {
  console.error(`[runner] failed to start: ${error.message}`);
  process.exitCode = 1;
});

// Start listening, and say in the log what this runner will do.
function start() {
  // The settings, and the address to listen on (only this machine unless
  // TR_HOST says otherwise).
  const current = config();
  const host = process.env.TR_HOST || "127.0.0.1";

  server.listen(current.port, host, () => {
    console.log(`[runner] test runner UI on http://${host}:${current.port}`);
    console.log(
      `[runner] signup mode: ${current.signupMode} | accounts: ${auth.sessionInfo({ headers: {} }).accounts}`,
    );

    // Whether runs can start.
    const dispatch = dispatchState();

    // Stub mode: say loudly that runs are pretend.
    if (current.stub) {
      console.warn(
        "[runner] GITHUB STUB MODE: every run here is pretend and reaches no pipeline. For tests and screenshots only.",
      );
    }

    // Where runs go, or why they can't.
    if (dispatch.configured) {
      console.log(
        `[runner] runs dispatch to ${dispatch.repo}@${dispatch.ref} via ${dispatch.workflowFile}`,
      );
    } else {
      for (const reason of dispatch.reasons) {
        console.warn(`[runner] dispatch unavailable: ${reason}`);
      }
    }
  });
}

// Close cleanly on Ctrl+C or a stop signal.
process.on("SIGINT", () => server.close(() => process.exit(0)));
process.on("SIGTERM", () => server.close(() => process.exit(0)));

// Start when run directly; a test can require the file without starting it.
if (require.main === module) {
  start();
}

// What the tests use.
module.exports = { server, start, dispatchState };
