const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = Number(process.argv[2] || process.env.PORT || 4173);
const PUBLIC_DIR = path.join(__dirname, "public");

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml"
};

const seededOrders = [
  {
    id: "ORD-1001",
    customer: "Northwind QA",
    status: "Queued",
    total: "$1,420.00",
    region: "US-East"
  },
  {
    id: "ORD-1002",
    customer: "Harbor Runtime Labs",
    status: "Processing",
    total: "$980.00",
    region: "EU-West"
  },
  {
    id: "ORD-1003",
    customer: "Cedar Validation Group",
    status: "Ready",
    total: "$2,305.00",
    region: "APAC"
  }
];

const productCatalog = {
  "sku-123": {
    id: "sku-123",
    name: "Agentic QA Console",
    subtitle: "Dynamic product output backed by the local validation API.",
    price: 1299.45,
    currency: "USD",
    status: "Ready to validate",
    notes: [
      {
        label: "Pricing integrity",
        detail: "Price is rendered from runtime API data."
      },
      {
        label: "Layout quality",
        detail: "Layout stays readable on both desktop and mobile."
      },
      {
        label: "Validation confidence",
        detail: "The validation agent can parse this value without hardcoded assertions."
      }
    ]
  }
};

const seededUsers = [
  { id: "USR-001", name: "Alice Northwind", role: "Admin", status: "Active", email: "alice@demo.local" },
  { id: "USR-002", name: "Bob Harbor", role: "Editor", status: "Active", email: "bob@demo.local" },
  { id: "USR-003", name: "Carol Cedar", role: "Viewer", status: "Inactive", email: "carol@demo.local" }
];

// Auth (Phase 1). One email per seeded user; a single shared demo password keeps the
// /login form easy to drive. Carol is Inactive on purpose (login -> 401 inactive).
const SEEDED_CREDENTIALS = {
  "alice@demo.local": { userId: "USR-001", password: "demo1234", role: "Admin", name: "Alice Northwind", status: "Active" },
  "bob@demo.local": { userId: "USR-002", password: "demo1234", role: "Editor", name: "Bob Harbor", status: "Active" },
  "carol@demo.local": { userId: "USR-003", password: "demo1234", role: "Viewer", name: "Carol Cedar", status: "Inactive" }
};

// RBAC (Phase 3). Role capabilities; anonymous (no session) is read-only.
const ROLE_PERMISSIONS = {
  Admin: { canRead: true, canCreate: true, canEdit: true, canDelete: true },
  Editor: { canRead: true, canCreate: false, canEdit: true, canDelete: false },
  Viewer: { canRead: true, canCreate: false, canEdit: false, canDelete: false }
};
const ANONYMOUS_PERMISSIONS = { canRead: true, canCreate: false, canEdit: false, canDelete: false };

// Audit log served by GET /api/admin/audit (was an inline array in admin.html before the rewrite).
const SEEDED_AUDIT = [
  { ts: "2026-04-17T10:04:00Z", actor: "alice@demo", action: "Added user Bob Harbor" },
  { ts: "2026-04-17T11:22:00Z", actor: "bob@demo", action: "Disabled user Carol Cedar" },
  { ts: "2026-04-18T07:45:00Z", actor: "alice@demo", action: "Rotated API key for integrations" }
];

// Drift flag store (per-runKey). Defaults == today's non-drifted behavior, so nothing
// fires by accident.
const FLAG_DEFAULTS = {
  authRequired: false,
  sessionExpired: false,
  loginSubmitLabel: "Sign In",
  rbacEnforce: false,
  adminGate: "open",
  rbacBug: "off"
};
const FLAG_CATALOG = {
  authRequired: { values: [true, false] },
  sessionExpired: { values: [true, false] },
  loginSubmitLabel: { values: ["Sign In", "Authenticate"] },
  rbacEnforce: { values: [true, false] },
  adminGate: { values: ["open", "locked"] },
  rbacBug: { values: ["off", "editor-delete"] }
};

const runtimeState = {
  createdUsers: [],
  managedUsers: [],
  flakyOrderFailuresByRunKey: new Set(),
  orderRequestCount: 0,
  sessions: new Map(),
  flagsByRunKey: new Map(),
  editsByUserId: {},
  deletedManagedUserIds: new Set()
};

function sendJson(response, statusCode, payload, setCookie) {
  const headers = {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8"
  };
  if (setCookie) {
    headers["Set-Cookie"] = setCookie;
  }
  response.writeHead(statusCode, headers);
  response.end(JSON.stringify(payload));
}

function sendText(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Cache-Control": "no-store",
    "Content-Type": "text/plain; charset=utf-8"
  });
  response.end(payload);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildSidCookie(sid) {
  return `sid=${sid}; Path=/; HttpOnly; SameSite=Lax; Max-Age=3600`;
}

const CLEAR_SID_COOKIE = "sid=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0";

function parseCookies(request) {
  const header = request.headers.cookie || "";
  const out = {};
  header.split(";").forEach((part) => {
    const idx = part.indexOf("=");
    if (idx === -1) {
      return;
    }
    const name = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (name) {
      out[name] = decodeURIComponent(value);
    }
  });
  return out;
}

function mintSession(user) {
  const issuedAtMs = Date.now();
  const sid = `sess-${user.id}-${issuedAtMs}-${crypto.randomBytes(8).toString("hex")}`;
  runtimeState.sessions.set(sid, {
    userId: user.id,
    name: user.name,
    role: user.role,
    email: user.email,
    issuedAtMs,
    expiresAtMs: issuedAtMs + 3600000
  });
  return sid;
}

function getSessionFromRequest(request) {
  const sid = parseCookies(request).sid;
  if (!sid) {
    return null;
  }
  return runtimeState.sessions.get(sid) || null;
}

function getRoleContext(request, requestUrl) {
  const flags = resolveFlags(getRunKey(request, requestUrl));
  const session = getSessionFromRequest(request);
  const role = session && !flags.sessionExpired ? session.role : null;
  const permissions = role ? ROLE_PERMISSIONS[role] : ANONYMOUS_PERMISSIONS;
  return { flags, session, role, permissions };
}

function getRunKey(request, requestUrl) {
  return requestUrl.searchParams.get("runKey") || parseCookies(request).qa_runkey || "global";
}

function resolveFlags(runKey) {
  return {
    ...FLAG_DEFAULTS,
    ...(runtimeState.flagsByRunKey.get("global") || {}),
    ...(runKey && runKey !== "global" ? runtimeState.flagsByRunKey.get(runKey) || {} : {})
  };
}

// User-data reset (managed/created users + RBAC overlays). Used by the legacy
// POST /api/test/reset-users alias. PARALLEL-SAFE: it must NOT touch sessions, flags, the
// flaky-orders markers, or the order counter — other specs (e.g. flaky-network-recovery) run
// concurrently and depend on those persisting across a single test's lifetime.
function resetData() {
  runtimeState.createdUsers = [];
  runtimeState.managedUsers = [];
  runtimeState.editsByUserId = {};
  runtimeState.deletedManagedUserIds = new Set();
}

// Full reset: user data + flaky markers + order counter + sessions + flags. Canonical
// (/api/test/reset). Intended for the seed/setup phase ONLY, never mid-run in parallel.
function resetAll() {
  resetData();
  runtimeState.flakyOrderFailuresByRunKey = new Set();
  runtimeState.orderRequestCount = 0;
  runtimeState.sessions.clear();
  runtimeState.flagsByRunKey.clear();
}

function parseRequestBody(request) {
  return new Promise((resolve, reject) => {
    let rawBody = "";

    request.on("data", (chunk) => {
      rawBody += chunk;

      if (rawBody.length > 1_000_000) {
        reject(new Error("Request body too large."));
      }
    });

    request.on("end", () => {
      if (!rawBody) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(rawBody));
      } catch (error) {
        reject(new Error("Invalid JSON payload."));
      }
    });

    request.on("error", reject);
  });
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function getStaticAssetPath(pathname) {
  const normalized = path.normalize(path.join(PUBLIC_DIR, pathname));

  if (!normalized.startsWith(PUBLIC_DIR)) {
    return null;
  }

  return normalized;
}

function getPagePath(pathname) {
  if (pathname === "/" || pathname === "") {
    return path.join(PUBLIC_DIR, "index.html");
  }

  if (pathname === "/login" || pathname === "/login/") {
    return path.join(PUBLIC_DIR, "login.html");
  }

  if (pathname === "/dashboard" || pathname === "/dashboard/") {
    return path.join(PUBLIC_DIR, "dashboard.html");
  }

  if (pathname === "/product" || pathname === "/product/" || pathname.startsWith("/product/")) {
    return path.join(PUBLIC_DIR, "product.html");
  }

  if (pathname === "/user-manager" || pathname === "/user-manager/") {
    return path.join(PUBLIC_DIR, "user-manager.html");
  }

  if (pathname === "/orders" || pathname === "/orders/") {
    return path.join(PUBLIC_DIR, "orders.html");
  }

  if (pathname === "/admin" || pathname === "/admin/") {
    return path.join(PUBLIC_DIR, "admin.html");
  }

  if (pathname === "/profile" || pathname === "/profile/") {
    return path.join(PUBLIC_DIR, "profile.html");
  }

  if (pathname === "/settings" || pathname === "/settings/") {
    return path.join(PUBLIC_DIR, "settings.html");
  }

  return null;
}

async function handleOrders(requestUrl, response) {
  const mode = requestUrl.searchParams.get("mode") || "stable";
  const runKey = requestUrl.searchParams.get("runKey") || "global";
  const requestedDelayMs = Number(requestUrl.searchParams.get("delayMs"));
  const delayMs = Number.isFinite(requestedDelayMs)
    ? Math.max(0, requestedDelayMs)
    : mode === "slow"
      ? 7000
      : 0;

  runtimeState.orderRequestCount += 1;

  if (delayMs > 0) {
    await sleep(delayMs);
  }

  if (mode === "flaky" && !runtimeState.flakyOrderFailuresByRunKey.has(runKey)) {
    runtimeState.flakyOrderFailuresByRunKey.add(runKey);
    sendJson(response, 503, {
      code: "ORDERS_UPSTREAM_TIMEOUT",
      message: "Orders API timed out on the first request.",
      retryable: true,
      mode,
      attempt: runtimeState.orderRequestCount,
      runKey
    });
    return;
  }

  sendJson(response, 200, {
    attempt: runtimeState.orderRequestCount,
    delayMs,
    mode,
    orders: seededOrders,
    refreshedAt: new Date().toISOString(),
    runKey
  });
}

async function handleCreateUser(request, response) {
  const payload = await parseRequestBody(request);

  if (typeof payload.phone_number === "string") {
    sendJson(response, 500, {
      type: "https://demo.local/problems/phone-number-type-mismatch",
      title: "Phone number type mismatch",
      status: 500,
      detail: "Field phone_number must be sent as an integer.",
      problem: {
        field: "phone_number",
        expectedType: "integer",
        receivedType: "string"
      },
      suggestion: "Send phone_number as an integer, for example 541234567."
    });
    return;
  }

  const errors = {};

  if (!String(payload.first_name || "").trim()) {
    errors.first_name = "First name is required.";
  }

  if (!String(payload.last_name || "").trim()) {
    errors.last_name = "Last name is required.";
  }

  if (!isValidEmail(payload.email)) {
    errors.email = "A valid email address is required.";
  }

  if (!Number.isInteger(payload.phone_number)) {
    errors.phone_number = "phone_number must be an integer.";
  }

  if (Object.keys(errors).length > 0) {
    sendJson(response, 400, {
      message: "User payload failed validation.",
      errors
    });
    return;
  }

  const createdUser = {
    id: `USR-${runtimeState.createdUsers.length + 1}`,
    first_name: payload.first_name,
    last_name: payload.last_name,
    email: payload.email,
    phone_number: payload.phone_number,
    createdAt: new Date().toISOString()
  };

  runtimeState.createdUsers.push(createdUser);

  sendJson(response, 201, {
    message: "User created successfully.",
    user: createdUser
  });
}

function getProductPayload(productId, state) {
  const baseProduct = productCatalog[productId] || {
    id: productId,
    name: "Agentic QA Console",
    subtitle: "Generic product payload for dynamic rendering tests.",
    price: 899.5,
    currency: "USD",
    status: "Ready to validate",
    notes: [
      {
        label: "Runtime content",
        detail: "Generic content payload for deterministic rendering tests."
      },
      {
        label: "Validation profile",
        detail: "Uses the same validation rules as the seeded product."
      },
      {
        label: "Execution mode",
        detail: "Designed for deterministic QA scenarios."
      }
    ]
  };

  if (state === "broken") {
    return {
      id: baseProduct.id,
      name: baseProduct.name,
      price: "NaN",
      currency: baseProduct.currency,
      status: "Broken render state",
      notes: [
        {
          label: "Pricing issue",
          detail: "Price is intentionally malformed."
        },
        {
          label: "Content issue",
          detail: "Subtitle is intentionally omitted."
        },
        {
          label: "Layout issue",
          detail: "Layout overlap is enabled for validation."
        }
      ],
      layout: {
        overlap: true
      }
    };
  }

  return {
    ...baseProduct,
    layout: {
      overlap: false
    }
  };
}

async function handleApiRequest(request, response, requestUrl) {
  const pathname = requestUrl.pathname;

  if (request.method === "GET" && pathname === "/api/health") {
    sendJson(response, 200, {
      status: "ok",
      port: PORT,
      service: "Reliable Agentic QA Demo"
    });
    return true;
  }

  if (request.method === "GET" && pathname === "/api/orders") {
    await handleOrders(requestUrl, response);
    return true;
  }

  if (request.method === "POST" && pathname === "/api/create-user") {
    await handleCreateUser(request, response);
    return true;
  }

  if (request.method === "GET" && pathname === "/api/users") {
    const users = [...seededUsers, ...runtimeState.managedUsers]
      .filter((user) => !runtimeState.deletedManagedUserIds.has(user.id))
      .map((user) => {
        const edit = runtimeState.editsByUserId[user.id];
        return edit ? { ...user, ...edit } : user;
      });
    sendJson(response, 200, { users, total: users.length });
    return true;
  }

  if (request.method === "POST" && pathname === "/api/users") {
    const ctx = getRoleContext(request, requestUrl);
    if (ctx.flags.rbacEnforce && !ctx.permissions.canCreate) {
      sendJson(response, 403, {
        code: "RBAC_FORBIDDEN",
        message: "You do not have permission to create users.",
        permissionDenied: true,
        requiredRole: "Editor",
        action: "create-user",
        actualRole: ctx.role
      });
      return true;
    }

    const payload = await parseRequestBody(request);
    if (!String(payload.name || "").trim()) {
      sendJson(response, 400, { message: "name is required." });
      return true;
    }
    const newUser = {
      id: `USR-${String(seededUsers.length + runtimeState.managedUsers.length + 1).padStart(3, "0")}`,
      name: String(payload.name).trim(),
      role: String(payload.role || "Viewer"),
      status: "Active",
      createdAt: new Date().toISOString()
    };
    runtimeState.managedUsers.push(newUser);
    sendJson(response, 201, { message: "User created.", user: newUser });
    return true;
  }

  if (request.method === "PATCH" && pathname.startsWith("/api/users/")) {
    const id = pathname.split("/").filter(Boolean).pop();
    const ctx = getRoleContext(request, requestUrl);
    if (ctx.flags.rbacEnforce && !ctx.permissions.canEdit) {
      sendJson(response, 403, {
        code: "RBAC_FORBIDDEN",
        message: "You do not have permission to edit users.",
        permissionDenied: true,
        requiredRole: "Editor",
        action: "edit-user",
        actualRole: ctx.role
      });
      return true;
    }

    const exists =
      [...seededUsers, ...runtimeState.managedUsers].some((user) => user.id === id) &&
      !runtimeState.deletedManagedUserIds.has(id);
    if (!exists) {
      sendJson(response, 404, { message: "User not found." });
      return true;
    }

    const payload = await parseRequestBody(request);
    const edit = {};
    if (payload.role !== undefined) {
      if (!["Admin", "Editor", "Viewer"].includes(payload.role)) {
        sendJson(response, 400, { message: "invalid role" });
        return true;
      }
      edit.role = payload.role;
    }
    if (payload.status !== undefined) {
      edit.status = String(payload.status);
    }
    runtimeState.editsByUserId[id] = { ...(runtimeState.editsByUserId[id] || {}), ...edit };
    sendJson(response, 200, { message: "User updated.", id, edit: runtimeState.editsByUserId[id] });
    return true;
  }

  if (request.method === "DELETE" && pathname.startsWith("/api/users/")) {
    const id = pathname.split("/").filter(Boolean).pop();
    const ctx = getRoleContext(request, requestUrl);
    // INTENTIONAL DEFECT: with rbacBug='editor-delete' armed, an Editor is WRONGLY allowed to
    // delete (the gate is bypassed) -> the server returns 200 where it should return 403.
    const editorDeleteBug = ctx.flags.rbacBug === "editor-delete" && ctx.role === "Editor";
    if (ctx.flags.rbacEnforce && !ctx.permissions.canDelete && !editorDeleteBug) {
      sendJson(response, 403, {
        code: "RBAC_FORBIDDEN",
        message: "You do not have permission to delete users.",
        permissionDenied: true,
        requiredRole: "Admin",
        action: "delete-user",
        actualRole: ctx.role
      });
      return true;
    }

    if (seededUsers.some((user) => user.id === id)) {
      sendJson(response, 409, { message: "Seeded users cannot be deleted." });
      return true;
    }
    if (!runtimeState.managedUsers.some((user) => user.id === id) || runtimeState.deletedManagedUserIds.has(id)) {
      sendJson(response, 404, { message: "User not found." });
      return true;
    }
    runtimeState.deletedManagedUserIds.add(id);
    sendJson(response, 200, { message: "User deleted.", id });
    return true;
  }

  if (request.method === "GET" && pathname === "/api/admin/audit") {
    const ctx = getRoleContext(request, requestUrl);
    if (ctx.flags.authRequired && !ctx.session) {
      sendJson(response, 401, { code: "AUTH_REQUIRED", message: "Login required to view the audit log.", authRequired: true });
      return true;
    }
    if (ctx.session && ctx.flags.sessionExpired) {
      sendJson(response, 401, { code: "SESSION_EXPIRED", message: "Session expired; sign in again.", authRequired: true }, CLEAR_SID_COOKIE);
      return true;
    }
    if ((ctx.flags.rbacEnforce && ctx.role !== "Admin") || ctx.flags.adminGate === "locked") {
      sendJson(response, 403, {
        code: "RBAC_FORBIDDEN",
        message: "Admin role required.",
        permissionDenied: true,
        requiredRole: "Admin",
        actualRole: ctx.role
      });
      return true;
    }
    sendJson(response, 200, { entries: SEEDED_AUDIT, role: ctx.role });
    return true;
  }

  if (request.method === "POST" && pathname === "/api/login") {
    const body = await parseRequestBody(request);
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const errors = {};
    if (!email) {
      errors.email = "email is required.";
    }
    if (!password) {
      errors.password = "password is required.";
    }
    if (Object.keys(errors).length > 0) {
      sendJson(response, 400, { code: "AUTH_MISSING_FIELDS", message: "email and password are required.", errors });
      return true;
    }

    const cred = SEEDED_CREDENTIALS[email];
    if (!cred || cred.password !== password) {
      sendJson(response, 401, { code: "AUTH_INVALID_CREDENTIALS", message: "Invalid email or password." });
      return true;
    }
    if (cred.status === "Inactive") {
      sendJson(response, 401, { code: "AUTH_INACTIVE_ACCOUNT", message: "This account is inactive." });
      return true;
    }

    const user = { id: cred.userId, name: cred.name, role: cred.role, email };
    const sid = mintSession(user);
    sendJson(response, 200, { message: "Signed in.", user }, buildSidCookie(sid));
    return true;
  }

  if (request.method === "POST" && pathname === "/api/logout") {
    const sid = parseCookies(request).sid;
    if (sid) {
      runtimeState.sessions.delete(sid);
    }
    sendJson(response, 200, { message: "Signed out." }, CLEAR_SID_COOKIE);
    return true;
  }

  if (request.method === "GET" && pathname === "/api/session") {
    const flags = resolveFlags(getRunKey(request, requestUrl));
    const session = getSessionFromRequest(request);
    const authenticated = !!session && !flags.sessionExpired;

    if (authenticated) {
      sendJson(response, 200, {
        authenticated: true,
        authRequired: flags.authRequired,
        role: session.role,
        user: { id: session.userId, name: session.name, role: session.role, email: session.email }
      });
      return true;
    }

    if (flags.authRequired) {
      const expired = !!session && flags.sessionExpired;
      sendJson(
        response,
        401,
        {
          code: expired ? "SESSION_EXPIRED" : "AUTH_SESSION_REQUIRED",
          message: expired ? "Session expired; sign in again." : "Login required.",
          authenticated: false,
          authRequired: true
        },
        expired ? CLEAR_SID_COOKIE : undefined
      );
      return true;
    }

    sendJson(response, 200, { authenticated: false, authRequired: false });
    return true;
  }

  if (request.method === "POST" && pathname === "/api/test/set-session") {
    const body = await parseRequestBody(request);
    let email = null;
    if (body.userId) {
      email = Object.keys(SEEDED_CREDENTIALS).find((e) => SEEDED_CREDENTIALS[e].userId === body.userId) || null;
    } else if (body.role) {
      email = Object.keys(SEEDED_CREDENTIALS).find((e) => SEEDED_CREDENTIALS[e].role === body.role) || null;
    }
    if (!email) {
      sendJson(response, 400, { message: "unknown role or userId" });
      return true;
    }
    const cred = SEEDED_CREDENTIALS[email];
    const user = { id: cred.userId, name: cred.name, role: cred.role, email };
    const sid = mintSession(user);
    sendJson(response, 200, { role: cred.role, user }, buildSidCookie(sid));
    return true;
  }

  if (request.method === "GET" && pathname === "/api/test/flags") {
    const runKey = requestUrl.searchParams.get("runKey") || "global";
    sendJson(response, 200, { runKey, flags: resolveFlags(runKey) });
    return true;
  }

  if (request.method === "POST" && pathname === "/api/test/flags") {
    const body = await parseRequestBody(request);
    const runKey = body.runKey || "global";
    const flags = body.flags || {};
    const errors = {};
    for (const [name, value] of Object.entries(flags)) {
      const spec = FLAG_CATALOG[name];
      if (!spec) {
        errors[name] = "unknown flag";
      } else if (!spec.values.includes(value)) {
        errors[name] = `invalid value ${JSON.stringify(value)}; allowed: ${JSON.stringify(spec.values)}`;
      }
    }
    if (Object.keys(errors).length > 0) {
      sendJson(response, 400, { message: "Invalid flag write.", errors });
      return true;
    }
    const merged = { ...(runtimeState.flagsByRunKey.get(runKey) || {}), ...flags };
    runtimeState.flagsByRunKey.set(runKey, merged);
    sendJson(response, 200, { runKey, flags: merged });
    return true;
  }

  if (request.method === "DELETE" && pathname === "/api/test/flags") {
    const runKey = requestUrl.searchParams.get("runKey");
    if (runKey) {
      runtimeState.flagsByRunKey.delete(runKey);
      sendJson(response, 200, { message: "flags cleared", runKey });
    } else {
      resetAll();
      sendJson(response, 200, { message: "runtime reset" });
    }
    return true;
  }

  if (request.method === "POST" && pathname === "/api/test/reset") {
    resetAll();
    sendJson(response, 200, {
      message: "runtime reset",
      cleared: ["sessions", "managedUsers", "createdUsers", "flakyOrders", "orderRequestCount", "flags"]
    });
    return true;
  }

  if (request.method === "POST" && pathname === "/api/test/reset-users") {
    resetData();
    sendJson(response, 200, { message: "managed users reset" });
    return true;
  }

  if (request.method === "GET" && pathname.startsWith("/api/product/")) {
    const productId = pathname.split("/").filter(Boolean).pop();
    const state = requestUrl.searchParams.get("state") || "valid";

    sendJson(response, 200, {
      product: getProductPayload(productId, state),
      state
    });
    return true;
  }

  return false;
}

function serveFile(filePath, response) {
  if (!filePath || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    sendText(response, 404, "Not found");
    return;
  }

  const extension = path.extname(filePath).toLowerCase();
  const contentType = mimeTypes[extension] || "application/octet-stream";

  response.writeHead(200, {
    "Cache-Control": "no-store",
    "Content-Type": contentType
  });

  fs.createReadStream(filePath).pipe(response);
}

const server = http.createServer(async (request, response) => {
  try {
    const requestUrl = new URL(request.url, `http://${request.headers.host}`);
    const pathname = requestUrl.pathname;

    if (pathname.startsWith("/api/")) {
      const handled = await handleApiRequest(request, response, requestUrl);

      if (!handled) {
        sendJson(response, 404, {
          message: "API route not found."
        });
      }

      return;
    }

    const pagePath = getPagePath(pathname);

    if (pagePath) {
      serveFile(pagePath, response);
      return;
    }

    const assetPath = getStaticAssetPath(pathname);

    if (assetPath) {
      serveFile(assetPath, response);
      return;
    }

    sendText(response, 404, "Not found");
  } catch (error) {
    sendJson(response, 500, {
      message: "Unexpected server error.",
      detail: error.message
    });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Reliable Agentic QA Demo running at http://127.0.0.1:${PORT}`);
});

process.on("SIGINT", () => server.close());
process.on("SIGTERM", () => server.close());
