// The website's one server: the classic site's pages and JSON API, the React
// app at /app, Playground Bank's API at /api/bank, the API docs, and the test
// hooks that arm planted bugs per runKey. No framework: Node's http module.

// Node's http server, file, path and crypto tools; the bank; and the practice
// mode's list of planted bugs.
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { createBank } = require("./bank");
const practice = require("./practice");
// Every response carries the same security headers; see security-headers.js
// for what each one does and why the three kinds of page get three policies.
const security = require("./security-headers");

// Playground Bank's API (/api/bank/*), with its own database. See bank/. Its
// planted bugs read the same per-runKey flag store as the rest of the app.
const bank = createBank({
  getFlags: (request, requestUrl) =>
    resolveFlags(getRunKey(request, requestUrl)),
  // The market gives every visitor their own prices; a visitor who has not
  // signed in is told apart by their run key.
  getRunKey: (request, requestUrl) => getRunKey(request, requestUrl),
});

// The port (first argument, then PORT, then 4173), the address to listen on,
// and the folder of static files.
const PORT = Number(process.argv[2] || process.env.PORT || 4173);
const HOST = process.env.HOST || "127.0.0.1";
const PUBLIC_DIR = path.join(__dirname, "public");

// OpenAPI spec + Swagger UI (served from the swagger-ui-dist devDependency).
const openApiSpec = require("./openapi.json");
let swaggerUiAssetPath = null;
try {
  swaggerUiAssetPath = require("swagger-ui-dist").getAbsoluteFSPath();
} catch {
  swaggerUiAssetPath = null; // devDependency; fine if absent in a prod image
}
const SWAGGER_UI_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Agents Playground API Docs</title>
    <link rel="stylesheet" href="/api/docs-assets/swagger-ui.css" />
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="/api/docs-assets/swagger-ui-bundle.js"></script>
    <script src="/api/docs-assets/swagger-ui-standalone-preset.js"></script>
    <script>
      window.ui = SwaggerUIBundle({
        url: "/api/openapi.json",
        dom_id: "#swagger-ui",
        presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
        layout: "StandaloneLayout",
      });
    </script>
  </body>
</html>`;
// The hash of the inline script above, for the docs page's Content Security
// Policy. Edit the script and the hash follows on the next start.
const SWAGGER_SCRIPT_HASHES = security.inlineScriptHashes(SWAGGER_UI_HTML);

// The content type for each kind of static file.
const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

// The classic site's three orders.
const seededOrders = [
  {
    id: "ORD-1001",
    customer: "Northwind QA",
    status: "Queued",
    total: "$1,420.00",
    region: "US-East",
  },
  {
    id: "ORD-1002",
    customer: "Harbor Runtime Labs",
    status: "Processing",
    total: "$980.00",
    region: "EU-West",
  },
  {
    id: "ORD-1003",
    customer: "Cedar Validation Group",
    status: "Ready",
    total: "$2,305.00",
    region: "APAC",
  },
];

// The classic site's one product, the one the page checker tests.
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
        detail: "Price is rendered from runtime API data.",
      },
      {
        label: "Layout quality",
        detail: "Layout stays readable on both desktop and mobile.",
      },
      {
        label: "Validation confidence",
        detail:
          "The validation agent can parse this value without hardcoded assertions.",
      },
    ],
  },
};

// The classic site's three users: an Admin, an Editor and an inactive Viewer.
const seededUsers = [
  {
    id: "USR-001",
    name: "Alice Northwind",
    role: "Admin",
    status: "Active",
    email: "alice@demo.local",
  },
  {
    id: "USR-002",
    name: "Bob Harbor",
    role: "Editor",
    status: "Active",
    email: "bob@demo.local",
  },
  {
    id: "USR-003",
    name: "Carol Cedar",
    role: "Viewer",
    status: "Inactive",
    email: "carol@demo.local",
  },
];

// Auth (Phase 1). One email per seeded user; a single shared demo password keeps the
// /login form easy to drive. Carol is Inactive on purpose (login -> 401 inactive).
const SEEDED_CREDENTIALS = {
  "alice@demo.local": {
    userId: "USR-001",
    password: "demo1234",
    role: "Admin",
    name: "Alice Northwind",
    status: "Active",
  },
  "bob@demo.local": {
    userId: "USR-002",
    password: "demo1234",
    role: "Editor",
    name: "Bob Harbor",
    status: "Active",
  },
  "carol@demo.local": {
    userId: "USR-003",
    password: "demo1234",
    role: "Viewer",
    name: "Carol Cedar",
    status: "Inactive",
  },
};

// RBAC (Phase 3). Role capabilities; anonymous (no session) is read-only.
const ROLE_PERMISSIONS = {
  Admin: { canRead: true, canCreate: true, canEdit: true, canDelete: true },
  Editor: { canRead: true, canCreate: false, canEdit: true, canDelete: false },
  Viewer: { canRead: true, canCreate: false, canEdit: false, canDelete: false },
};
// Someone not signed in may only read.
const ANONYMOUS_PERMISSIONS = {
  canRead: true,
  canCreate: false,
  canEdit: false,
  canDelete: false,
};

// Audit log served by GET /api/admin/audit (was an inline array in admin.html before the rewrite).
const SEEDED_AUDIT = [
  {
    ts: "2026-04-17T10:04:00Z",
    actor: "alice@demo",
    action: "Added user Bob Harbor",
  },
  {
    ts: "2026-04-17T11:22:00Z",
    actor: "bob@demo",
    action: "Disabled user Carol Cedar",
  },
  {
    ts: "2026-04-18T07:45:00Z",
    actor: "alice@demo",
    action: "Rotated API key for integrations",
  },
];

// The gear shop's 48 products live in the bank's database now, with real stock
// (bank/shop.js). /api/products and /api/products/:id below read them through
// the bank, in the shape those routes have always answered.

// Drift flag store (per-runKey). Defaults == today's non-drifted behavior, so nothing
// fires by accident.
const FLAG_DEFAULTS = {
  authRequired: false,
  sessionExpired: false,
  loginSubmitLabel: "Sign In",
  rbacEnforce: false,
  adminGate: "open",
  rbacBug: "off",
  // React (/app) surface drift. All default to non-drifted behavior so nothing
  // fires by accident; armed per-runKey via POST /api/test/flags.
  userCreateConflict: false,
  usersA11yBug: false,
  usersLocaleBug: false,
  usersSearchStale: false,
  ordersRefreshLabel: "Refresh",
  productSchemaDrift: false,
  // Playground Bank money (bank/, web/src/pages/Bank*). Same rule: off by
  // default, armed per runKey.
  bankNegativeTransfer: false,
  bankDoubleSubmit: false,
  bankTransferRace: false,
  bankStaleBalance: false,
  bankDateFilterOffByOne: false,
  bankStatementTotal: false,
  bankLoanRounding: false,
  bankPayeeIdor: false,
  bankNotificationCount: false,
  bankRequestDoublePay: false,
  bankSupportStatus: false,
  // Playground Bank GraphQL (bank/graphql.js, /app/graphql).
  bankGraphqlOwnerLeak: false,
  bankGraphqlErrorDetail: false,
  bankGraphqlDepth: false,
  // Crypto exchange (bank/market.js, bank/coins.js, /app/markets).
  bankCryptoPriceType: false,
  // Trading (bank/trading.js, /app/markets/:symbol, /app/portfolio).
  bankQuoteExpired: false,
  bankProfitSign: false,
  bankFeeHidden: false,
  // Wallets (bank/wallet.js, /app/wallet).
  bankBadAddress: false,
  bankCryptoFloat: false,
  // The security pack (bank/accounts.js, /app/devices).
  bankEndOthersKeepsOne: false,
  // Scheduled payments (bank/schedule.js, /app/bank/bills).
  bankMonthlyRepeatOverflow: false,
  // Cards (bank/cards.js, /app/bank/cards).
  bankCardLimitPerCharge: false,
  // Limit orders (bank/exchange.js, /app/markets/:symbol).
  bankSellLimitInverted: false,
  // API keys (bank/keys.js, /app/developer).
  bankKeyScopeLeak: false,
  // The database (bank/migrations, /app/bank/transfer).
  bankMemoNoLimit: false,
  // GraphQL (bank/graphql.js, /app/graphql).
  bankGraphqlKeyScope: false,
  bankCursorSkip: false,
  // The gear shop (bank/shop.js, /app/products, /app/shop/cart).
  bankShopOversell: false,
  bankShopClientPrice: false,
  bankShopBackorderBuyable: false,
  // The shop's back office (bank/shop.js, bank/routes.js,
  // /app/admin/shop-orders).
  bankShopRefundTwice: false,
  bankShopStatusSkip: false,
  bankShopSupportRefund: false,
  // Bank rules: retry-safe keys, the audit log, the books (bank/idempotency.js,
  // bank/routes.js, bank/shop.js, /app/admin/audit, /app/admin/books).
  bankIdempotencyMismatch: false,
  bankAuditGraphqlGap: false,
  bankRefundNoEntry: false,
};
// The values each flag may be set to; anything else is refused.
const FLAG_CATALOG = {
  authRequired: { values: [true, false] },
  sessionExpired: { values: [true, false] },
  loginSubmitLabel: { values: ["Sign In", "Authenticate"] },
  rbacEnforce: { values: [true, false] },
  adminGate: { values: ["open", "locked"] },
  rbacBug: { values: ["off", "editor-delete"] },
  userCreateConflict: { values: [true, false] },
  usersA11yBug: { values: [true, false] },
  usersLocaleBug: { values: [true, false] },
  usersSearchStale: { values: [true, false] },
  ordersRefreshLabel: { values: ["Refresh", "Reload"] },
  productSchemaDrift: { values: [true, false] },
  bankNegativeTransfer: { values: [true, false] },
  bankDoubleSubmit: { values: [true, false] },
  bankTransferRace: { values: [true, false] },
  bankStaleBalance: { values: [true, false] },
  bankDateFilterOffByOne: { values: [true, false] },
  bankStatementTotal: { values: [true, false] },
  bankLoanRounding: { values: [true, false] },
  bankPayeeIdor: { values: [true, false] },
  bankNotificationCount: { values: [true, false] },
  bankRequestDoublePay: { values: [true, false] },
  bankSupportStatus: { values: [true, false] },
  bankGraphqlOwnerLeak: { values: [true, false] },
  bankGraphqlErrorDetail: { values: [true, false] },
  bankGraphqlDepth: { values: [true, false] },
  bankCryptoPriceType: { values: [true, false] },
  bankQuoteExpired: { values: [true, false] },
  bankProfitSign: { values: [true, false] },
  bankFeeHidden: { values: [true, false] },
  bankBadAddress: { values: [true, false] },
  bankCryptoFloat: { values: [true, false] },
  bankEndOthersKeepsOne: { values: [true, false] },
  bankMonthlyRepeatOverflow: { values: [true, false] },
  bankCardLimitPerCharge: { values: [true, false] },
  bankSellLimitInverted: { values: [true, false] },
  bankKeyScopeLeak: { values: [true, false] },
  bankMemoNoLimit: { values: [true, false] },
  bankGraphqlKeyScope: { values: [true, false] },
  bankCursorSkip: { values: [true, false] },
  bankShopOversell: { values: [true, false] },
  bankShopClientPrice: { values: [true, false] },
  bankShopBackorderBuyable: { values: [true, false] },
  bankShopRefundTwice: { values: [true, false] },
  bankShopStatusSkip: { values: [true, false] },
  bankShopSupportRefund: { values: [true, false] },
  bankIdempotencyMismatch: { values: [true, false] },
  bankAuditGraphqlGap: { values: [true, false] },
  bankRefundNoEntry: { values: [true, false] },
};

// The classic site keeps its state in memory: created and managed users,
// flaky-order markers, the order counter, sessions, flags, edits and deletes.
// A restart clears it.
const runtimeState = {
  createdUsers: [],
  managedUsers: [],
  flakyOrderFailuresByRunKey: new Set(),
  orderRequestCount: 0,
  sessions: new Map(),
  flagsByRunKey: new Map(),
  editsByUserId: {},
  deletedManagedUserIds: new Set(),
};

// The caller's headers plus the security set. response.req is the request the
// response answers, which is how the https check for HSTS gets at it without
// every send* call passing the request along.
function secured(response, kind, headers, options) {
  return security.headersFor(kind, {
    request: response.req,
    extra: headers,
    ...options,
  });
}

// Sends a JSON answer that is never cached, with the security headers and an
// optional cookie.
function sendJson(response, statusCode, payload, setCookie) {
  const headers = {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
  };
  if (setCookie) {
    headers["Set-Cookie"] = setCookie;
  }
  response.writeHead(statusCode, secured(response, "api", headers));
  response.end(JSON.stringify(payload));
}

// Sends plain text, never cached, with the security headers.
function sendText(response, statusCode, payload) {
  response.writeHead(
    statusCode,
    secured(response, "api", {
      "Cache-Control": "no-store",
      "Content-Type": "text/plain; charset=utf-8",
    }),
  );
  response.end(payload);
}

// Waits a number of milliseconds.
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// The classic site's session cookie (one hour), and the same cookie expired.
function buildSidCookie(sid) {
  return `sid=${sid}; Path=/; HttpOnly; SameSite=Lax; Max-Age=3600`;
}

const CLEAR_SID_COOKIE = "sid=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0";

// The request's cookies, by name.
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

// Starts a one-hour session for a user and returns its id.
function mintSession(user) {
  const issuedAtMs = Date.now();
  const sid = `sess-${user.id}-${issuedAtMs}-${crypto.randomBytes(8).toString("hex")}`;
  runtimeState.sessions.set(sid, {
    userId: user.id,
    name: user.name,
    role: user.role,
    email: user.email,
    issuedAtMs,
    expiresAtMs: issuedAtMs + 3600000,
  });
  return sid;
}

// The session the request's cookie points at, or null.
function getSessionFromRequest(request) {
  const sid = parseCookies(request).sid;
  if (!sid) {
    return null;
  }
  return runtimeState.sessions.get(sid) || null;
}

// Who is asking and what they may do: the flags, the session, the role and its
// permissions. An "expired" session (a planted flag) counts as signed out.
function getRoleContext(request, requestUrl) {
  const flags = resolveFlags(getRunKey(request, requestUrl));
  const session = getSessionFromRequest(request);
  const role = session && !flags.sessionExpired ? session.role : null;
  const permissions = role ? ROLE_PERMISSIONS[role] : ANONYMOUS_PERMISSIONS;
  return { flags, session, role, permissions };
}

// The request's runKey: ?runKey=, else the qa_runkey cookie, else "global".
function getRunKey(request, requestUrl) {
  return (
    requestUrl.searchParams.get("runKey") ||
    parseCookies(request).qa_runkey ||
    "global"
  );
}

// The flags in force for a runKey: the defaults, then the global ones, then
// that runKey's own.
function resolveFlags(runKey) {
  return {
    ...FLAG_DEFAULTS,
    ...(runtimeState.flagsByRunKey.get("global") || {}),
    ...(runKey && runKey !== "global"
      ? runtimeState.flagsByRunKey.get(runKey) || {}
      : {}),
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

// The request's JSON body ({} when empty); more than about 1 MB, or bad JSON,
// is an error.
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

// Something@something.something.
function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

// The file under public/ for a path, or null for one that tries to leave it.
function getStaticAssetPath(pathname) {
  const normalized = path.normalize(path.join(PUBLIC_DIR, pathname));

  if (!normalized.startsWith(PUBLIC_DIR)) {
    return null;
  }

  return normalized;
}

// The classic site's HTML page for a path, or null.
function getPagePath(pathname) {
  // The front door is Playground Bank at /app; `/` only redirects there (see
  // the route below). The original demo site keeps every one of its own pages
  // -- /login, /dashboard, /orders and the rest -- and its home page moved to
  // /classic, so nothing that pointed at those pages had to change.
  if (pathname === "/classic" || pathname === "/classic/") {
    return path.join(PUBLIC_DIR, "index.html");
  }

  if (pathname === "/login" || pathname === "/login/") {
    return path.join(PUBLIC_DIR, "login.html");
  }

  if (pathname === "/dashboard" || pathname === "/dashboard/") {
    return path.join(PUBLIC_DIR, "dashboard.html");
  }

  if (
    pathname === "/product" ||
    pathname === "/product/" ||
    pathname.startsWith("/product/")
  ) {
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

// GET /api/orders. The mode makes it stable, slow (7 s) or flaky (the first
// request of each runKey fails with 503), and delayMs sets the wait.
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

  if (
    mode === "flaky" &&
    !runtimeState.flakyOrderFailuresByRunKey.has(runKey)
  ) {
    runtimeState.flakyOrderFailuresByRunKey.add(runKey);
    sendJson(response, 503, {
      code: "ORDERS_UPSTREAM_TIMEOUT",
      message: "Orders API timed out on the first request.",
      retryable: true,
      mode,
      attempt: runtimeState.orderRequestCount,
      runKey,
    });
    return;
  }

  sendJson(response, 200, {
    attempt: runtimeState.orderRequestCount,
    delayMs,
    mode,
    orders: seededOrders,
    refreshedAt: new Date().toISOString(),
    runKey,
  });
}

// POST /api/create-user. A string phone number gets a 500 that names the field
// and the types (the API diagnosis scenario's case); other bad fields get 400.
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
        receivedType: "string",
      },
      suggestion: "Send phone_number as an integer, for example 541234567.",
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
      errors,
    });
    return;
  }

  // Valid: keep it in memory and answer 201.
  const createdUser = {
    id: `USR-${runtimeState.createdUsers.length + 1}`,
    first_name: payload.first_name,
    last_name: payload.last_name,
    email: payload.email,
    phone_number: payload.phone_number,
    createdAt: new Date().toISOString(),
  };

  runtimeState.createdUsers.push(createdUser);

  sendJson(response, 201, {
    message: "User created successfully.",
    user: createdUser,
  });
}

// The product page's data. The "broken" state is planted on purpose: a NaN
// price, no subtitle, and parts that overlap.
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
        detail: "Generic content payload for deterministic rendering tests.",
      },
      {
        label: "Validation profile",
        detail: "Uses the same validation rules as the seeded product.",
      },
      {
        label: "Execution mode",
        detail: "Designed for deterministic QA scenarios.",
      },
    ],
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
          detail: "Price is intentionally malformed.",
        },
        {
          label: "Content issue",
          detail: "Subtitle is intentionally omitted.",
        },
        {
          label: "Layout issue",
          detail: "Layout overlap is enabled for validation.",
        },
      ],
      layout: {
        overlap: true,
      },
    };
  }

  return {
    ...baseProduct,
    layout: {
      overlap: false,
    },
  };
}

// The classic site's JSON API. Returns true when it answered the request.
async function handleApiRequest(request, response, requestUrl) {
  const pathname = requestUrl.pathname;

  // The health check the canaries and Render probe.
  if (request.method === "GET" && pathname === "/api/health") {
    sendJson(response, 200, {
      status: "ok",
      port: PORT,
      service: "Reliable Agentic QA Demo",
    });
    return true;
  }

  // The dashboard's orders.
  if (request.method === "GET" && pathname === "/api/orders") {
    await handleOrders(requestUrl, response);
    return true;
  }

  // All 48 products, with their stock as it is now, from the bank's database.
  if (request.method === "GET" && pathname === "/api/products") {
    const flags = resolveFlags(getRunKey(request, requestUrl));
    const catalogue = await bank.classicProducts();
    // INTENTIONAL DEFECT: with productSchemaDrift armed, price is emitted as a
    // string instead of a number, violating the OpenAPI ProductsResponse schema
    // so the contract test REPORTS it. Default off.
    const products = flags.productSchemaDrift
      ? catalogue.map((item) => ({ ...item, price: String(item.price) }))
      : catalogue;
    sendJson(response, 200, { products, total: products.length });
    return true;
  }

  // The OpenAPI document the contract tests and the docs page read.
  if (request.method === "GET" && pathname === "/api/openapi.json") {
    sendJson(response, 200, openApiSpec);
    return true;
  }

  // The API docs page (Swagger UI), with the hash its inline script needs.
  if (request.method === "GET" && pathname === "/api/docs") {
    response.writeHead(
      200,
      secured(
        response,
        "docs",
        {
          "Cache-Control": "no-store",
          "Content-Type": "text/html; charset=utf-8",
        },
        { scriptHashes: SWAGGER_SCRIPT_HASHES },
      ),
    );
    response.end(SWAGGER_UI_HTML);
    return true;
  }

  // Swagger UI's own three files, and nothing else from its folder.
  if (request.method === "GET" && pathname.startsWith("/api/docs-assets/")) {
    const file = path.basename(pathname);
    const allowed = new Set([
      "swagger-ui.css",
      "swagger-ui-bundle.js",
      "swagger-ui-standalone-preset.js",
    ]);
    if (!swaggerUiAssetPath || !allowed.has(file)) {
      sendJson(response, 404, { message: "Swagger UI asset unavailable." });
      return true;
    }
    serveFile(path.join(swaggerUiAssetPath, file), response);
    return true;
  }

  // One product by its id, from the bank's database.
  if (request.method === "GET" && pathname.startsWith("/api/products/")) {
    const id = pathname.split("/").filter(Boolean).pop();
    const product = await bank.classicProduct(id);
    if (!product) {
      sendJson(response, 404, { message: "Product not found." });
      return true;
    }
    sendJson(response, 200, { product });
    return true;
  }

  // The classic create-user API.
  if (request.method === "POST" && pathname === "/api/create-user") {
    await handleCreateUser(request, response);
    return true;
  }

  // The user list: the seeded users plus the created ones, with their edits,
  // without the deleted.
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

  // Creates a user. With role checks on, only Admin may.
  if (request.method === "POST" && pathname === "/api/users") {
    const ctx = getRoleContext(request, requestUrl);
    if (ctx.flags.rbacEnforce && !ctx.permissions.canCreate) {
      sendJson(response, 403, {
        code: "RBAC_FORBIDDEN",
        message: "You do not have permission to create users.",
        permissionDenied: true,
        requiredRole: "Editor",
        action: "create-user",
        actualRole: ctx.role,
      });
      return true;
    }

    // INTENTIONAL DEFECT (React /app): with userCreateConflict armed, creation
    // fails with 409 so the React optimistic-update row rolls back. Default off.
    if (ctx.flags.userCreateConflict) {
      sendJson(response, 409, {
        code: "USER_CREATE_CONFLICT",
        message: "A user with these details already exists.",
        conflict: true,
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
      createdAt: new Date().toISOString(),
    };
    runtimeState.managedUsers.push(newUser);
    sendJson(response, 201, { message: "User created.", user: newUser });
    return true;
  }

  // Edits a user's role or status. With role checks on, Admin and Editor may.
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
        actualRole: ctx.role,
      });
      return true;
    }

    const exists =
      [...seededUsers, ...runtimeState.managedUsers].some(
        (user) => user.id === id,
      ) && !runtimeState.deletedManagedUserIds.has(id);
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
    runtimeState.editsByUserId[id] = {
      ...(runtimeState.editsByUserId[id] || {}),
      ...edit,
    };
    sendJson(response, 200, {
      message: "User updated.",
      id,
      edit: runtimeState.editsByUserId[id],
    });
    return true;
  }

  // Deletes a created user (seeded ones never). With role checks on, only
  // Admin may.
  if (request.method === "DELETE" && pathname.startsWith("/api/users/")) {
    const id = pathname.split("/").filter(Boolean).pop();
    const ctx = getRoleContext(request, requestUrl);
    // INTENTIONAL DEFECT: with rbacBug='editor-delete' armed, an Editor is WRONGLY allowed to
    // delete (the gate is bypassed) -> the server returns 200 where it should return 403.
    const editorDeleteBug =
      ctx.flags.rbacBug === "editor-delete" && ctx.role === "Editor";
    if (
      ctx.flags.rbacEnforce &&
      !ctx.permissions.canDelete &&
      !editorDeleteBug
    ) {
      sendJson(response, 403, {
        code: "RBAC_FORBIDDEN",
        message: "You do not have permission to delete users.",
        permissionDenied: true,
        requiredRole: "Admin",
        action: "delete-user",
        actualRole: ctx.role,
      });
      return true;
    }

    if (seededUsers.some((user) => user.id === id)) {
      sendJson(response, 409, { message: "Seeded users cannot be deleted." });
      return true;
    }
    if (
      !runtimeState.managedUsers.some((user) => user.id === id) ||
      runtimeState.deletedManagedUserIds.has(id)
    ) {
      sendJson(response, 404, { message: "User not found." });
      return true;
    }
    runtimeState.deletedManagedUserIds.add(id);
    sendJson(response, 200, { message: "User deleted.", id });
    return true;
  }

  // The audit log. Depending on the flags: 401 when sign-in is required or the
  // session expired, 403 unless Admin or when the gate is locked.
  if (request.method === "GET" && pathname === "/api/admin/audit") {
    const ctx = getRoleContext(request, requestUrl);
    if (ctx.flags.authRequired && !ctx.session) {
      sendJson(response, 401, {
        code: "AUTH_REQUIRED",
        message: "Login required to view the audit log.",
        authRequired: true,
      });
      return true;
    }
    if (ctx.session && ctx.flags.sessionExpired) {
      sendJson(
        response,
        401,
        {
          code: "SESSION_EXPIRED",
          message: "Session expired; sign in again.",
          authRequired: true,
        },
        CLEAR_SID_COOKIE,
      );
      return true;
    }
    if (
      (ctx.flags.rbacEnforce && ctx.role !== "Admin") ||
      ctx.flags.adminGate === "locked"
    ) {
      sendJson(response, 403, {
        code: "RBAC_FORBIDDEN",
        message: "Admin role required.",
        permissionDenied: true,
        requiredRole: "Admin",
        actualRole: ctx.role,
      });
      return true;
    }
    sendJson(response, 200, { entries: SEEDED_AUDIT, role: ctx.role });
    return true;
  }

  // The classic site's sign-in: both fields, a known email and its password,
  // and an active account; then a session cookie.
  if (request.method === "POST" && pathname === "/api/login") {
    const body = await parseRequestBody(request);
    const email =
      typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const errors = {};
    if (!email) {
      errors.email = "email is required.";
    }
    if (!password) {
      errors.password = "password is required.";
    }
    if (Object.keys(errors).length > 0) {
      sendJson(response, 400, {
        code: "AUTH_MISSING_FIELDS",
        message: "email and password are required.",
        errors,
      });
      return true;
    }

    const cred = SEEDED_CREDENTIALS[email];
    if (!cred || cred.password !== password) {
      sendJson(response, 401, {
        code: "AUTH_INVALID_CREDENTIALS",
        message: "Invalid email or password.",
      });
      return true;
    }
    if (cred.status === "Inactive") {
      sendJson(response, 401, {
        code: "AUTH_INACTIVE_ACCOUNT",
        message: "This account is inactive.",
      });
      return true;
    }

    const user = { id: cred.userId, name: cred.name, role: cred.role, email };
    const sid = mintSession(user);
    sendJson(
      response,
      200,
      { message: "Signed in.", user },
      buildSidCookie(sid),
    );
    return true;
  }

  // Ends the session and clears the cookie.
  if (request.method === "POST" && pathname === "/api/logout") {
    const sid = parseCookies(request).sid;
    if (sid) {
      runtimeState.sessions.delete(sid);
    }
    sendJson(response, 200, { message: "Signed out." }, CLEAR_SID_COOKIE);
    return true;
  }

  // Who is signed in; 401 when sign-in is required and there is no live
  // session.
  if (request.method === "GET" && pathname === "/api/session") {
    const flags = resolveFlags(getRunKey(request, requestUrl));
    const session = getSessionFromRequest(request);
    const authenticated = !!session && !flags.sessionExpired;

    if (authenticated) {
      sendJson(response, 200, {
        authenticated: true,
        authRequired: flags.authRequired,
        role: session.role,
        user: {
          id: session.userId,
          name: session.name,
          role: session.role,
          email: session.email,
        },
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
          message: expired
            ? "Session expired; sign in again."
            : "Login required.",
          authenticated: false,
          authRequired: true,
        },
        expired ? CLEAR_SID_COOKIE : undefined,
      );
      return true;
    }

    sendJson(response, 200, { authenticated: false, authRequired: false });
    return true;
  }

  // Test hook: signs in as a seeded user, by id or by role, without a
  // password.
  if (request.method === "POST" && pathname === "/api/test/set-session") {
    const body = await parseRequestBody(request);
    let email = null;
    if (body.userId) {
      email =
        Object.keys(SEEDED_CREDENTIALS).find(
          (e) => SEEDED_CREDENTIALS[e].userId === body.userId,
        ) || null;
    } else if (body.role) {
      email =
        Object.keys(SEEDED_CREDENTIALS).find(
          (e) => SEEDED_CREDENTIALS[e].role === body.role,
        ) || null;
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

  // --- Practice mode ----------------------------------------------------
  //
  // One switch that arms every planted bug for the visitor who flipped it, and
  // nobody else. The visitor is told apart by a run key in a session cookie, so
  // the bugs follow them from page to page but end when they close the browser.
  //
  // Nothing is saved. A visitor turns it on, practises, and leaves; coming back
  // to a clean site and starting over is how a demo site is meant to work, and
  // it means there is no stored state to go stale or to leak between people.
  if (request.method === "GET" && pathname === "/api/practice") {
    const runKey = getRunKey(request, requestUrl);
    const flags = resolveFlags(runKey);
    // On when every flag in the catalogue is armed for this run key.
    const armed = practice.BUGS.every((bug) => flags[bug.flag] === bug.value);
    sendJson(response, 200, {
      on: runKey !== "global" && armed,
      runKey: runKey === "global" ? null : runKey,
      bugs: practice.catalogue(),
      total: practice.BUGS.length,
    });
    return true;
  }

  // Turns practice mode on (every planted bug) or off, for this visitor only.
  if (request.method === "POST" && pathname === "/api/practice") {
    const body = await parseRequestBody(request);
    const on = body.on === true;
    const existing = getRunKey(request, requestUrl);
    // A visitor with no key of their own gets one when they switch it on, so
    // arming never touches the shared "global" defaults everybody else reads.
    const runKey =
      existing !== "global" ? existing : `practice-${crypto.randomUUID()}`;

    runtimeState.flagsByRunKey.set(runKey, {
      ...(runtimeState.flagsByRunKey.get(runKey) || {}),
      ...(on ? practice.practiceFlags() : practice.cleanFlags(FLAG_DEFAULTS)),
    });

    // A session cookie: no Max-Age, so it ends with the browser.
    sendJson(
      response,
      200,
      { on, runKey, total: practice.BUGS.length },
      `qa_runkey=${encodeURIComponent(runKey)}; Path=/; SameSite=Lax`,
    );
    return true;
  }

  // Test hook: the flags in force for a runKey.
  if (request.method === "GET" && pathname === "/api/test/flags") {
    // getRunKey, not the query string alone: a reader with no ?runKey= of its
    // own falls back to the qa_runkey cookie, which is how the pages pick up
    // practice mode. An explicit parameter still wins, so tests are unaffected.
    const runKey = getRunKey(request, requestUrl);
    sendJson(response, 200, { runKey, flags: resolveFlags(runKey) });
    return true;
  }

  // Test hook: arms flags for a runKey; every name and value must be in the
  // catalog.
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
        errors[name] =
          `invalid value ${JSON.stringify(value)}; allowed: ${JSON.stringify(spec.values)}`;
      }
    }
    if (Object.keys(errors).length > 0) {
      sendJson(response, 400, { message: "Invalid flag write.", errors });
      return true;
    }
    const merged = {
      ...(runtimeState.flagsByRunKey.get(runKey) || {}),
      ...flags,
    };
    runtimeState.flagsByRunKey.set(runKey, merged);
    sendJson(response, 200, { runKey, flags: merged });
    return true;
  }

  // Test hook: clears one runKey's flags, or (with no runKey) resets
  // everything.
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

  // Test hook: resets everything in memory (for the setup step only).
  if (request.method === "POST" && pathname === "/api/test/reset") {
    resetAll();
    sendJson(response, 200, {
      message: "runtime reset",
      cleared: [
        "sessions",
        "managedUsers",
        "createdUsers",
        "flakyOrders",
        "orderRequestCount",
        "flags",
      ],
    });
    return true;
  }

  // Test hook: resets only the user data, safe while other tests run.
  if (request.method === "POST" && pathname === "/api/test/reset-users") {
    resetData();
    sendJson(response, 200, { message: "managed users reset" });
    return true;
  }

  // The product page's data, valid or broken.
  if (request.method === "GET" && pathname.startsWith("/api/product/")) {
    const productId = pathname.split("/").filter(Boolean).pop();
    const state = requestUrl.searchParams.get("state") || "valid";

    sendJson(response, 200, {
      product: getProductPayload(productId, state),
      state,
    });
    return true;
  }

  // Not one of the classic site's routes.
  return false;
}

// Vite names every file under public/app/assets after a hash of its content,
// so a changed file is a new name and the old one can be cached for good. The
// HTML that points at them stays no-store, which is what makes that safe.
const HASHED_ASSETS_DIR = path.join(PUBLIC_DIR, "app", "assets") + path.sep;

// kind is the security-headers kind: "asset" for files, "classic" for the
// original demo pages. The React app's index.html goes through serveAppIndex
// instead, because it needs a nonce.
function serveFile(filePath, response, kind = "asset") {
  if (
    !filePath ||
    !fs.existsSync(filePath) ||
    fs.statSync(filePath).isDirectory()
  ) {
    sendText(response, 404, "Not found");
    return;
  }

  // Its type, and how long it may be cached: hashed app files for a year,
  // everything else never.
  const extension = path.extname(filePath).toLowerCase();
  const contentType = mimeTypes[extension] || "application/octet-stream";
  const cacheControl = filePath.startsWith(HASHED_ASSETS_DIR)
    ? "public, max-age=31536000, immutable"
    : "no-store";

  response.writeHead(
    200,
    secured(response, kind, {
      "Cache-Control": cacheControl,
      "Content-Type": contentType,
    }),
  );

  fs.createReadStream(filePath).pipe(response);
}

// The React app's shell, with a fresh nonce in its policy and in the tags Vite
// marked with the placeholder (html.cspNonce in vite.config.ts). Read per
// request: the file is small, it is sent no-store, and a rebuild while the
// server runs is picked up without a restart.
function serveAppIndex(response) {
  const indexPath = path.join(PUBLIC_DIR, "app", "index.html");
  if (!fs.existsSync(indexPath)) {
    sendText(response, 404, "Not found");
    return;
  }
  const nonce = security.newNonce();
  const html = fs
    .readFileSync(indexPath, "utf8")
    .replaceAll(security.NONCE_PLACEHOLDER, nonce);
  response.writeHead(
    200,
    secured(
      response,
      "app",
      {
        "Cache-Control": "no-store",
        "Content-Type": mimeTypes[".html"],
      },
      { nonce },
    ),
  );
  response.end(html);
}

// Every request: the bank's API, the classic API, the root redirect, the React
// app, the classic pages, the static files, or 404.
const server = http.createServer(async (request, response) => {
  try {
    const requestUrl = new URL(request.url, `http://${request.headers.host}`);
    const pathname = requestUrl.pathname;

    if (pathname.startsWith("/api/bank/")) {
      await bank.handle(request, response, requestUrl);
      return;
    }

    if (pathname.startsWith("/api/")) {
      const handled = await handleApiRequest(request, response, requestUrl);

      if (!handled) {
        sendJson(response, 404, {
          message: "API route not found.",
        });
      }

      return;
    }

    // React SPA (Vite build output in public/app) served at /app with a
    // client-side routing fallback. Real built assets resolve through
    // getStaticAssetPath; unknown /app/* routes fall back to the SPA index.html
    // so client-side routes deep-link correctly.
    // The root is Playground Bank. A visitor arriving at the bare domain --
    // from Render's dashboard, a bookmark, a shared link -- should land on the
    // practice site, not on the older demo pages behind it.
    if (pathname === "/" || pathname === "") {
      response.writeHead(
        302,
        secured(response, "api", {
          Location: "/app",
          "Cache-Control": "no-store",
        }),
      );
      response.end();
      return;
    }

    if (pathname === "/app" || pathname.startsWith("/app/")) {
      const spaAsset = getStaticAssetPath(pathname);

      if (
        spaAsset &&
        fs.existsSync(spaAsset) &&
        !fs.statSync(spaAsset).isDirectory()
      ) {
        serveFile(spaAsset, response);
        return;
      }

      serveAppIndex(response);
      return;
    }

    // A classic site page, then any other file under public/.
    const pagePath = getPagePath(pathname);

    if (pagePath) {
      serveFile(pagePath, response, "classic");
      return;
    }

    const assetPath = getStaticAssetPath(pathname);

    if (assetPath) {
      serveFile(assetPath, response);
      return;
    }

    sendText(response, 404, "Not found");
  } catch (error) {
    // Anything unexpected becomes a 500.
    sendJson(response, 500, {
      message: "Unexpected server error.",
      detail: error.message,
    });
  }
});

// A port that cannot be opened ends the process with an error code.
server.on("error", (error) => {
  console.error(`Server failed to start on ${HOST}:${PORT}:`, error);
  process.exitCode = 1;
});

// The port opens only once the bank's database is ready. If it can't start
// (for example a wrong DATABASE_URL), the process exits, so a bad deploy fails
// its health check and Render keeps the previous version running.
bank
  .start()
  .then(() => {
    server.listen(PORT, HOST, () => {
      console.log(`Reliable Agentic QA Demo running at http://${HOST}:${PORT}`);
    });
  })
  .catch((error) => {
    console.error(`Playground Bank database failed to start: ${error.message}`);
    process.exit(1);
  });

// Ctrl+C or a stop signal closes the server and the bank's database.
function shutdown() {
  server.close();
  bank.stop();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
