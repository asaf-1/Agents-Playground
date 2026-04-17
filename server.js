const http = require("http");
const fs = require("fs");
const path = require("path");

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
  { id: "USR-001", name: "Alice Northwind", role: "Admin", status: "Active" },
  { id: "USR-002", name: "Bob Harbor", role: "Editor", status: "Active" },
  { id: "USR-003", name: "Carol Cedar", role: "Viewer", status: "Inactive" }
];

const runtimeState = {
  createdUsers: [],
  managedUsers: [],
  flakyOrderFailuresByRunKey: new Set(),
  orderRequestCount: 0
};

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8"
  });
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

  if (pathname === "/dashboard" || pathname === "/dashboard/") {
    return path.join(PUBLIC_DIR, "dashboard.html");
  }

  if (pathname === "/product" || pathname === "/product/" || pathname.startsWith("/product/")) {
    return path.join(PUBLIC_DIR, "product.html");
  }

  if (pathname === "/user-manager" || pathname === "/user-manager/") {
    return path.join(PUBLIC_DIR, "user-manager.html");
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
    sendJson(response, 200, {
      users: [...seededUsers, ...runtimeState.managedUsers],
      total: seededUsers.length + runtimeState.managedUsers.length
    });
    return true;
  }

  if (request.method === "POST" && pathname === "/api/users") {
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

  if (request.method === "POST" && pathname === "/api/test/reset-users") {
    runtimeState.managedUsers = [];
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
