const accounts = require("./accounts");
const {
  clearSessionCookie,
  readSessionToken,
  sessionCookie,
  verifyAgainstDecoy,
  verifyPassword,
} = require("./auth");

// The /api/bank/* API. Every answer is JSON with Cache-Control: no-store, and
// every error has a stable `code` plus a readable `message`.

const ROLES = ["customer", "support", "admin"];
const STATUSES = ["active", "locked"];
const CURRENCIES = ["USD", "EUR", "GBP", "ILS"];
const LOCALES = ["en-US", "en-GB", "de-DE"];
const MAX_BODY_BYTES = 64 * 1024;

class HttpError extends Error {
  constructor(status, code, message, errors) {
    super(message);
    this.status = status;
    this.code = code;
    this.errors = errors;
  }
}

function sendJson(response, status, payload, cookie) {
  const headers = {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
  };
  if (cookie) {
    headers["Set-Cookie"] = cookie;
  }
  response.writeHead(status, headers);
  response.end(JSON.stringify(payload));
}

// Changes must come as JSON. A cross-site form can't send that without the
// browser asking first, which is part of the CSRF protection (with the
// SameSite cookie).
async function readJson(request) {
  const type = String(request.headers["content-type"] || "");
  if (!type.toLowerCase().startsWith("application/json")) {
    throw new HttpError(
      415,
      "JSON_REQUIRED",
      "Send the request as application/json.",
    );
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      throw new HttpError(413, "BODY_TOO_LARGE", "The request is too large.");
    }
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString("utf8").trim();
  if (!text) {
    return {};
  }
  try {
    const body = JSON.parse(text);
    return body && typeof body === "object" && !Array.isArray(body) ? body : {};
  } catch {
    throw new HttpError(
      400,
      "INVALID_JSON",
      "The request body isn't valid JSON.",
    );
  }
}

function invalid(errors) {
  return new HttpError(
    400,
    "VALIDATION_FAILED",
    "Some fields need attention.",
    errors,
  );
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function checkFullName(value, errors) {
  const fullName = text(value);
  if (fullName.length < 2 || fullName.length > 80) {
    errors.fullName = "Enter your full name (2 to 80 characters).";
  }
  return fullName;
}

function checkEmail(value, errors) {
  const email = text(value).toLowerCase();
  if (!EMAIL_PATTERN.test(email) || email.length > 254) {
    errors.email = "Enter a valid email address.";
  }
  return email;
}

function checkNewPassword(value, errors) {
  const password = typeof value === "string" ? value : "";
  if (
    password.length < 8 ||
    password.length > 128 ||
    !/[A-Za-z]/.test(password) ||
    !/\d/.test(password)
  ) {
    errors.password =
      "Use at least 8 characters, with at least one letter and one number.";
  }
  return password;
}

function checkOptional(value, max, label, pattern, errors, key) {
  if (value === undefined) {
    return undefined;
  }
  const result = text(value);
  if (result.length > max || (result && pattern && !pattern.test(result))) {
    errors[key] = label;
  }
  return result;
}

function requireUser(user) {
  if (!user) {
    throw new HttpError(401, "NOT_SIGNED_IN", "Sign in first.");
  }
}

function requireRole(user, roles) {
  requireUser(user);
  if (!roles.includes(user.role)) {
    throw new HttpError(403, "FORBIDDEN", "You don't have access to this.");
  }
}

function requireEditable(user) {
  if (user.isDemo) {
    throw new HttpError(
      403,
      "DEMO_READ_ONLY",
      "Demo accounts are read-only. Sign up for your own account to try this.",
    );
  }
}

function createRoutes(db, info) {
  async function currentUser(request) {
    const token = readSessionToken(request);
    if (!token) {
      return null;
    }
    const row = await accounts.findSessionUser(db, token);
    return row ? accounts.toUser(row) : null;
  }

  async function signIn(request, response, status, userId) {
    const token = await accounts.createSession(db, userId);
    sendJson(
      response,
      status,
      await accounts.loadAccount(db, userId),
      sessionCookie(token, request),
    );
  }

  async function register(request, response) {
    const body = await readJson(request);
    const errors = {};
    const fullName = checkFullName(body.fullName, errors);
    const email = checkEmail(body.email, errors);
    const password = checkNewPassword(body.password, errors);
    if (body.acceptTerms !== true) {
      errors.acceptTerms = "Accept the terms to create an account.";
    }
    if (Object.keys(errors).length > 0) {
      throw invalid(errors);
    }
    let row;
    try {
      row = await accounts.createUser(db, { email, fullName, password });
    } catch (error) {
      if (error instanceof accounts.EmailTakenError) {
        throw new HttpError(
          409,
          "EMAIL_TAKEN",
          "An account with this email already exists.",
        );
      }
      throw error;
    }
    await signIn(request, response, 201, row.id);
  }

  // The password is checked before the lock, so only someone who knows it
  // learns that an account is locked.
  async function login(request, response) {
    const body = await readJson(request);
    const email = text(body.email).toLowerCase();
    const password = typeof body.password === "string" ? body.password : "";
    if (!email || !password) {
      const errors = {};
      if (!email) errors.email = "Enter your email.";
      if (!password) errors.password = "Enter your password.";
      throw invalid(errors);
    }
    const row = await accounts.findUserByEmail(db, email);
    const ok = row
      ? await verifyPassword(password, row.password_hash)
      : await verifyAgainstDecoy(password);
    if (!ok) {
      throw new HttpError(
        401,
        "INVALID_CREDENTIALS",
        "Wrong email or password.",
      );
    }
    if (row.status === "locked") {
      throw new HttpError(403, "ACCOUNT_LOCKED", "This account is locked.");
    }
    await signIn(request, response, 200, row.id);
  }

  async function logout(request, response) {
    await readJson(request);
    const token = readSessionToken(request);
    if (token) {
      await accounts.deleteSession(db, token);
    }
    sendJson(
      response,
      200,
      { message: "Signed out." },
      clearSessionCookie(request),
    );
  }

  async function updateProfile(request, response, user) {
    requireUser(user);
    requireEditable(user);
    const body = await readJson(request);
    const errors = {};
    const fields = {
      fullName:
        body.fullName === undefined
          ? undefined
          : checkFullName(body.fullName, errors),
      phone: checkOptional(
        body.phone,
        30,
        "Use digits, spaces, +, ( ) or - (up to 30).",
        /^\+?[\d\s()-]+$/,
        errors,
        "phone",
      ),
      addressLine: checkOptional(
        body.addressLine,
        120,
        "Keep the address under 120 characters.",
        null,
        errors,
        "addressLine",
      ),
      city: checkOptional(
        body.city,
        60,
        "Keep the city under 60 characters.",
        null,
        errors,
        "city",
      ),
      postalCode: checkOptional(
        body.postalCode,
        20,
        "Use letters, digits, spaces or - (up to 20).",
        /^[A-Za-z0-9 -]+$/,
        errors,
        "postalCode",
      ),
      country: checkOptional(
        body.country,
        56,
        "Pick a country from the list.",
        /^[\p{L} .'-]+$/u,
        errors,
        "country",
      ),
    };
    if (Object.keys(errors).length > 0) {
      throw invalid(errors);
    }
    sendJson(response, 200, await accounts.updateProfile(db, user.id, fields));
  }

  async function updateSettings(request, response, user) {
    requireUser(user);
    requireEditable(user);
    const body = await readJson(request);
    const errors = {};
    if (!CURRENCIES.includes(body.currency)) {
      errors.currency = `Pick one of ${CURRENCIES.join(", ")}.`;
    }
    if (!LOCALES.includes(body.locale)) {
      errors.locale = `Pick one of ${LOCALES.join(", ")}.`;
    }
    if (typeof body.emailAlerts !== "boolean") {
      errors.emailAlerts = "Must be true or false.";
    }
    if (typeof body.statementEmails !== "boolean") {
      errors.statementEmails = "Must be true or false.";
    }
    if (Object.keys(errors).length > 0) {
      throw invalid(errors);
    }
    sendJson(response, 200, await accounts.updateSettings(db, user.id, body));
  }

  async function updateUser(request, response, user, targetId) {
    requireRole(user, ["admin"]);
    const body = await readJson(request);
    const errors = {};
    if (body.role !== undefined && !ROLES.includes(body.role)) {
      errors.role = `Pick one of ${ROLES.join(", ")}.`;
    }
    if (body.status !== undefined && !STATUSES.includes(body.status)) {
      errors.status = `Pick one of ${STATUSES.join(", ")}.`;
    }
    if (body.role === undefined && body.status === undefined) {
      errors.role = "Send a role or a status to change.";
    }
    if (Object.keys(errors).length > 0) {
      throw invalid(errors);
    }
    const target = /^[0-9a-f-]{36}$/i.test(targetId)
      ? await accounts.findUserById(db, targetId)
      : null;
    if (!target) {
      throw new HttpError(404, "USER_NOT_FOUND", "There's no such user.");
    }
    if (target.id === user.id) {
      throw new HttpError(
        409,
        "CANNOT_CHANGE_SELF",
        "You can't change your own role or lock yourself.",
      );
    }
    if (target.is_demo) {
      throw new HttpError(
        403,
        "DEMO_READ_ONLY",
        "Demo accounts can't be changed.",
      );
    }
    const updated = await accounts.updateUserByAdmin(db, target.id, {
      role: body.role,
      status: body.status,
    });
    sendJson(response, 200, { user: updated });
  }

  async function route(request, response, requestUrl) {
    const { method } = request;
    const path = requestUrl.pathname.replace(/\/+$/, "");
    const user = await currentUser(request);

    if (path === "/api/bank/status" && method === "GET") {
      return sendJson(response, 200, info);
    }
    if (path === "/api/bank/register" && method === "POST") {
      return register(request, response);
    }
    if (path === "/api/bank/login" && method === "POST") {
      return login(request, response);
    }
    if (path === "/api/bank/logout" && method === "POST") {
      return logout(request, response);
    }
    if (path === "/api/bank/me" && method === "GET") {
      requireUser(user);
      return sendJson(response, 200, await accounts.loadAccount(db, user.id));
    }
    if (path === "/api/bank/me/profile" && method === "PATCH") {
      return updateProfile(request, response, user);
    }
    if (path === "/api/bank/me/settings" && method === "PUT") {
      return updateSettings(request, response, user);
    }
    if (path === "/api/bank/admin/users" && method === "GET") {
      requireRole(user, ["support", "admin"]);
      const users = await accounts.listUsers(db);
      return sendJson(response, 200, { users, total: users.length });
    }
    const match = path.match(/^\/api\/bank\/admin\/users\/([^/]+)$/);
    if (match && method === "PATCH") {
      return updateUser(request, response, user, decodeURIComponent(match[1]));
    }
    throw new HttpError(404, "NOT_FOUND", "API route not found.");
  }

  return async function handle(request, response, requestUrl) {
    try {
      await route(request, response, requestUrl);
    } catch (error) {
      if (error instanceof HttpError) {
        const payload = { code: error.code, message: error.message };
        if (error.errors) {
          payload.errors = error.errors;
        }
        sendJson(response, error.status, payload);
        return;
      }
      // Logged here, never sent: error details can leak how the server works.
      console.error("[bank] unexpected error:", error);
      sendJson(response, 500, {
        code: "SERVER_ERROR",
        message: "Something went wrong.",
      });
    }
  };
}

module.exports = { CURRENCIES, LOCALES, ROLES, createRoutes };
