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

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const { config } = require("./src/config.js");
const auth = require("./src/auth.js");
const github = require("./src/github.js");

const PUBLIC_DIR = path.join(__dirname, "public");
const MAX_BODY_BYTES = 100 * 1024;

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

// The UI is self-contained by design, so the policy can be strict: no external
// origins at all. 'unsafe-inline' covers only the stylesheet, not scripts.
const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
].join("; ");

function securityHeaders() {
  return {
    "Content-Security-Policy": CSP,
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
  };
}

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
  const status =
    error.statusCode || (error.status >= 400 && error.status < 600 ? 502 : 500);
  const message =
    status >= 500 && !error.statusCode && !error.status
      ? "The test runner hit an unexpected error."
      : error.message;

  if (status >= 500) {
    console.error(`[runner] ${error.stack || error.message}`);
  }

  sendJson(response, status, { message });
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let raw = "";
    let aborted = false;

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

    request.on("error", reject);
  });
}

// Serves only the three known UI files. An allowlist rather than path joining,
// so no traversal is possible even in principle.
const STATIC_FILES = new Map([
  ["/", "index.html"],
  ["/index.html", "index.html"],
  ["/app.js", "app.js"],
  ["/styles.css", "styles.css"],
  ["/favicon.ico", "favicon.ico"],
]);

function serveStatic(pathname, response) {
  const name = STATIC_FILES.get(pathname);

  if (!name) {
    response.writeHead(404, {
      ...securityHeaders(),
      "Content-Type": "text/plain; charset=utf-8",
    });
    response.end("Not found");
    return;
  }

  const filePath = path.join(PUBLIC_DIR, name);

  if (!fs.existsSync(filePath)) {
    response.writeHead(404, {
      ...securityHeaders(),
      "Content-Type": "text/plain; charset=utf-8",
    });
    response.end("Not found");
    return;
  }

  response.writeHead(200, {
    ...securityHeaders(),
    // The UI is one small bundle and correctness beats caching here: a stale
    // app.js against a newer API is a confusing failure to debug.
    "Cache-Control": "no-store",
    "Content-Type":
      MIME_TYPES[path.extname(name)] || "application/octet-stream",
  });
  fs.createReadStream(filePath).pipe(response);
}

// Why dispatch is or is not available, in terms the UI can show verbatim.
function dispatchState() {
  const current = config();
  const reasons = [...current.errors];

  // config() already reports misconfiguration in detail. Only add a generic
  // hint when it has not already covered that variable, so the UI never shows
  // the same problem twice in different words.
  const covers = (variable) =>
    reasons.some((reason) => reason.includes(variable));

  if (!current.hasToken && !covers("TR_GITHUB_TOKEN")) {
    reasons.push(
      "No GitHub token. Set TR_GITHUB_TOKEN (fine-grained, actions:write on the repo) to start runs.",
    );
  }

  if (!current.repo && !covers("TR_REPO")) {
    reasons.push('No repository. Set TR_REPO to "owner/repo".');
  }

  return {
    configured: Boolean(current.hasToken && current.repo),
    repo: current.repo,
    ref: current.ref,
    workflowFile: current.workflowFile,
    reasons: [...new Set(reasons)],
  };
}

async function handleApi(request, response, url) {
  const { pathname } = url;
  const method = request.method;

  if (method === "GET" && pathname === "/api/health") {
    return sendJson(response, 200, { status: "ok", service: "test-runner" });
  }

  // Public: the UI calls this first to choose between sign-in and sign-up.
  if (method === "GET" && pathname === "/api/session") {
    return sendJson(response, 200, auth.sessionInfo(request));
  }

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

  if (method === "POST" && pathname === "/api/logout") {
    const result = auth.logout(request);
    return sendJson(response, 200, { authenticated: false }, result.cookie);
  }

  // Everything below requires a signed-in user. The flow list is included:
  // flow entries name internal spec paths, so it is not public.
  if (method === "GET" && pathname === "/api/flows") {
    auth.requireUser(request);
    const catalog = await github.getFlows();

    return sendJson(response, 200, {
      flows: catalog.flows,
      totals: catalog.totals,
      source: catalog.source,
      error: catalog.error || null,
      dispatch: dispatchState(),
    });
  }

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
        targetUrl: body.targetUrl,
        reason: body.reason,
      },
      user.username,
    );

    return sendJson(response, 202, result);
  }

  if (method === "GET" && pathname === "/api/runs") {
    auth.requireUser(request);
    const limit = url.searchParams.get("limit");

    return sendJson(response, 200, await github.listRuns(limit));
  }

  // Everything the dashboard needs in one request, so the landing tab is a
  // single round trip rather than three.
  if (method === "GET" && pathname === "/api/dashboard") {
    auth.requireUser(request);

    const [stats, catalog] = await Promise.all([
      github.getStats(50),
      github.getFlows(),
    ]);

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

  // Sub-resources are matched before the generic run lookup below, otherwise
  // "/api/runs/123/logs" would be read as a run id of "123/logs".
  const runSubResource = pathname.match(
    /^\/api\/runs\/([^/]+)\/(cancel|logs)$/,
  );

  if (runSubResource) {
    const [, runId, action] = runSubResource;

    if (action === "cancel" && method === "POST") {
      const user = auth.requireUser(request);
      return sendJson(
        response,
        202,
        await github.cancelRun(runId, user.username),
      );
    }

    if (action === "logs" && method === "GET") {
      auth.requireUser(request);
      return sendJson(response, 200, await github.getRunLogs(runId));
    }

    return sendJson(response, 405, { message: "Method not allowed." });
  }

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

    return sendJson(response, 200, {
      users: auth.adminListUsers(),
      signupMode: current.signupMode,
      inviteCodeSet: Boolean(current.inviteCode),
    });
  }

  const userResource = pathname.match(/^\/api\/users\/([^/]+)(\/password)?$/);

  if (userResource) {
    const admin = auth.requireAdmin(request);
    const target = decodeURIComponent(userResource[1]);
    const isPassword = Boolean(userResource[2]);

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

    if (!isPassword && method === "PATCH") {
      const body = await readBody(request);
      return sendJson(
        response,
        200,
        auth.adminSetRole(admin.username, target, body.role),
      );
    }

    if (!isPassword && method === "DELETE") {
      return sendJson(
        response,
        200,
        auth.adminDeleteUser(admin.username, target),
      );
    }

    return sendJson(response, 405, { message: "Method not allowed." });
  }

  return sendJson(response, 404, { message: "No such endpoint." });
}

const server = http.createServer(async (request, response) => {
  let url;

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

server.on("error", (error) => {
  console.error(`[runner] failed to start: ${error.message}`);
  process.exitCode = 1;
});

function start() {
  const current = config();
  const host = process.env.TR_HOST || "127.0.0.1";

  server.listen(current.port, host, () => {
    console.log(`[runner] test runner UI on http://${host}:${current.port}`);
    console.log(
      `[runner] signup mode: ${current.signupMode} | accounts: ${auth.sessionInfo({ headers: {} }).accounts}`,
    );

    const dispatch = dispatchState();

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

process.on("SIGINT", () => server.close(() => process.exit(0)));
process.on("SIGTERM", () => server.close(() => process.exit(0)));

if (require.main === module) {
  start();
}

module.exports = { server, start, dispatchState };
