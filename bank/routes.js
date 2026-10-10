const accounts = require("./accounts");
const money = require("./money");
const bills = require("./bills");
const loans = require("./loans");
const notifications = require("./notify");
const requests = require("./requests");
const support = require("./support");
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
const ROLE_NAMES = { customer: "Customer", support: "Support", admin: "Admin" };
const CURRENCIES = ["USD", "EUR", "GBP", "ILS"];
const LOCALES = ["en-US", "en-GB", "de-DE"];
const MAX_BODY_BYTES = 64 * 1024;

const ACCOUNT_KINDS = ["checking", "savings"];
const KIND_NAMES = { checking: "Checking", savings: "Savings" };
// One top-up (Add funds, or a new account's starting amount) is at most
// $1,000,000. Balances can grow past it; transfers are limited only by what
// the account holds.
const MAX_TOP_UP_CENTS = 100_000_000;
const MEMO_MAX = 140;
const HISTORY_TYPES = ["in", "out", "deposit", "transfer", "bill", "loan"];
const ACCOUNT_NUMBER = /^PB-?(\d{4})-?(\d{4})$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const PAYEE_REFERENCE = /^[A-Za-z0-9 ./-]+$/;
const LOAN_STATUSES = ["pending", "approved", "rejected"];
const TICKET_STATUSES = ["open", "answered", "solved"];
const STAFF = ["support", "admin"];

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

// A whole number of cents within [min, max]; anything else is a field error.
function checkCents(value, min, max, message, errors, key) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    errors[key] = message;
  }
  return value;
}

// A calendar date (YYYY-MM-DD) that really exists, or undefined when absent.
function checkDate(value, errors, key) {
  if (value === null || value === "") {
    return undefined;
  }
  const date = new Date(`${value}T00:00:00Z`);
  if (
    !DATE.test(value) ||
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    errors[key] = "Use a real date, written YYYY-MM-DD.";
    return undefined;
  }
  return value;
}

function checkWholeNumber(value, min, max, errors, key, message) {
  if (value === null || value === "") {
    return undefined;
  }
  const number = Number(value);
  if (!/^\d+$/.test(value) || number < min || number > max) {
    errors[key] = message;
    return undefined;
  }
  return number;
}

function startOfDay(date) {
  return `${date}T00:00:00.000Z`;
}

function dayAfter(date) {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString();
}

function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

function daysBefore(date, days) {
  const earlier = new Date(`${date}T00:00:00Z`);
  earlier.setUTCDate(earlier.getUTCDate() - days);
  return earlier.toISOString().slice(0, 10);
}

// The period filter shared by history and statements. Dates are whole days in
// UTC, and both ends are included.
function periodFilter(from, to, flags) {
  return {
    fromIso: from ? startOfDay(from) : undefined,
    // INTENTIONAL DEFECT (bankDateFilterOffByOne, REPORT): ends the period at
    // the START of the "to" day instead of the start of the day after, so the
    // last day of the range is left out.
    toIso: to
      ? flags.bankDateFilterOffByOne
        ? startOfDay(to)
        : dayAfter(to)
      : undefined,
  };
}

function plainAmount(cents) {
  const abs = Math.abs(cents);
  return `${cents < 0 ? "-" : ""}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

// Spreadsheet apps run a cell that starts with = + - @ as a formula, so text
// that came from people is defused with a leading apostrophe (CSV injection).
function csvText(value) {
  let cell = String(value);
  if (/^[=+\-@\t\r]/.test(cell)) {
    cell = `'${cell}`;
  }
  return /[",\n\r]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
}

function csvDate(iso) {
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)}`;
}

function createRoutes(db, info, getFlags = () => ({})) {
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
    await money.openStarterAccounts(db, row.id);
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
    if (body.role !== undefined && body.role !== target.role) {
      await notifications.notify(db, {
        userId: target.id,
        kind: "account_changed",
        title: `Your role is now ${ROLE_NAMES[body.role]}`,
        body: "An Admin changed what you can do in Playground Bank.",
        link: "/profile",
      });
    }
    if (body.status === "active" && target.status === "locked") {
      await notifications.notify(db, {
        userId: target.id,
        kind: "account_changed",
        title: "Your account was unlocked",
        body: "You can log in again.",
        link: "/profile",
      });
    }
    sendJson(response, 200, { user: updated });
  }

  // --- Money ----------------------------------------------------------------

  async function ownAccount(user, accountId) {
    const row = await money.findOwnAccount(db, user.id, accountId);
    if (!row) {
      throw new HttpError(404, "ACCOUNT_NOT_FOUND", "There's no such account.");
    }
    return row;
  }

  async function listMoneyAccounts(response, user) {
    requireUser(user);
    const list = await money.listAccounts(db, user.id);
    sendJson(response, 200, {
      accounts: list,
      totalCents: list.reduce((sum, account) => sum + account.balanceCents, 0),
    });
  }

  async function openMoneyAccount(request, response, user) {
    requireUser(user);
    requireEditable(user);
    const body = await readJson(request);
    const errors = {};
    if (!ACCOUNT_KINDS.includes(body.kind)) {
      errors.kind = "Pick checking or savings.";
    }
    const name = body.name === undefined ? "" : text(body.name);
    if (body.name !== undefined && (name.length < 2 || name.length > 40)) {
      errors.name = "Name the account in 2 to 40 characters.";
    }
    const openingCents = checkCents(
      body.openingCents === undefined ? 0 : body.openingCents,
      0,
      MAX_TOP_UP_CENTS,
      "Enter a starting amount from $0 to $1,000,000.",
      errors,
      "openingCents",
    );
    if (Object.keys(errors).length > 0) {
      throw invalid(errors);
    }
    try {
      const account = await money.openAccount(db, user.id, {
        kind: body.kind,
        name: name || KIND_NAMES[body.kind],
        openingCents,
      });
      sendJson(response, 201, { account });
    } catch (error) {
      if (error instanceof money.TooManyAccountsError) {
        throw new HttpError(
          409,
          "TOO_MANY_ACCOUNTS",
          `You can have up to ${money.MAX_ACCOUNTS} accounts.`,
        );
      }
      throw error;
    }
  }

  async function addFunds(request, response, user, accountId) {
    requireUser(user);
    requireEditable(user);
    const body = await readJson(request);
    const account = await ownAccount(user, accountId);
    const errors = {};
    checkCents(
      body.amountCents,
      1,
      MAX_TOP_UP_CENTS,
      "Enter an amount from $0.01 to $1,000,000.",
      errors,
      "amountCents",
    );
    if (Object.keys(errors).length > 0) {
      throw invalid(errors);
    }
    sendJson(response, 201, {
      account: await money.deposit(db, account.id, body.amountCents),
    });
  }

  function historyQuery(requestUrl, flags) {
    const params = requestUrl.searchParams;
    const errors = {};
    const from = checkDate(params.get("from"), errors, "from");
    const to = checkDate(params.get("to"), errors, "to");
    if (from && to && from > to) {
      errors.to = "The end date can't be before the start date.";
    }
    const type = params.get("type") || undefined;
    if (type && !HISTORY_TYPES.includes(type)) {
      errors.type = `Pick one of ${HISTORY_TYPES.join(", ")}.`;
    }
    const amountMessage = "Use a whole number of cents, 0 or more.";
    const minCents = checkWholeNumber(
      params.get("minCents"),
      0,
      Number.MAX_SAFE_INTEGER,
      errors,
      "minCents",
      amountMessage,
    );
    const maxCents = checkWholeNumber(
      params.get("maxCents"),
      0,
      Number.MAX_SAFE_INTEGER,
      errors,
      "maxCents",
      amountMessage,
    );
    if (
      minCents !== undefined &&
      maxCents !== undefined &&
      minCents > maxCents
    ) {
      errors.maxCents = "The highest amount can't be below the lowest.";
    }
    const page = checkWholeNumber(
      params.get("page"),
      1,
      100_000,
      errors,
      "page",
      "Use a page number from 1.",
    );
    const pageSize = checkWholeNumber(
      params.get("pageSize"),
      1,
      100,
      errors,
      "pageSize",
      "Use a page size from 1 to 100.",
    );
    if (Object.keys(errors).length > 0) {
      throw invalid(errors);
    }
    return {
      ...periodFilter(from, to, flags),
      type,
      minCents,
      maxCents,
      page: page ?? 1,
      pageSize: pageSize ?? 20,
    };
  }

  async function listHistory(response, user, accountId, requestUrl, flags) {
    requireUser(user);
    const account = await ownAccount(user, accountId);
    const filters = historyQuery(requestUrl, flags);
    sendJson(
      response,
      200,
      await money.listTransactions(db, account.id, filters),
    );
  }

  async function statement(response, user, accountId, requestUrl, flags) {
    requireUser(user);
    const account = await ownAccount(user, accountId);
    const errors = {};
    const to = checkDate(requestUrl.searchParams.get("to"), errors, "to");
    const from = checkDate(requestUrl.searchParams.get("from"), errors, "from");
    if (Object.keys(errors).length > 0) {
      throw invalid(errors);
    }
    const end = to || todayUtc();
    const start = from || daysBefore(end, 30);
    if (start > end) {
      throw invalid({ to: "The end date can't be before the start date." });
    }
    const rows = await money.statementTransactions(
      db,
      account.id,
      periodFilter(start, end, flags),
    );
    // INTENTIONAL DEFECT (bankStatementTotal, REPORT): the total leaves out
    // the last row, so it no longer matches the rows above it.
    const counted = flags.bankStatementTotal ? rows.slice(0, -1) : rows;
    const total = counted.reduce((sum, row) => sum + row.amountCents, 0);
    const lines = [
      "Date (UTC),Description,Memo,Type,Amount,Balance",
      ...rows.map((row) =>
        [
          csvDate(row.createdAt),
          csvText(row.description),
          csvText(row.memo),
          row.kind,
          plainAmount(row.amountCents),
          plainAmount(row.balanceAfterCents),
        ].join(","),
      ),
      `Total,,,,${plainAmount(total)},`,
    ];
    response.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="statement-${account.number}-${start}-to-${end}.csv"`,
    });
    response.end(`${lines.join("\r\n")}\r\n`);
  }

  async function makeTransfer(request, response, user, flags) {
    requireUser(user);
    requireEditable(user);
    const body = await readJson(request);
    const errors = {};
    const fromAccountId = text(body.fromAccountId);
    if (!fromAccountId) {
      errors.fromAccountId = "Pick the account to send from.";
    }
    const numberMatch = text(body.toAccountNumber).match(ACCOUNT_NUMBER);
    if (!numberMatch) {
      errors.toAccountNumber = "Enter an account number like PB-1234-5678.";
    }
    const amountCents = body.amountCents;
    // INTENTIONAL DEFECT (bankNegativeTransfer, REPORT): with the flag armed,
    // any amount except zero passes, so a negative transfer pulls money from
    // the recipient into the sender's account.
    const amountOk = flags.bankNegativeTransfer
      ? Number.isSafeInteger(amountCents) && amountCents !== 0
      : Number.isSafeInteger(amountCents) && amountCents > 0;
    if (!amountOk) {
      errors.amountCents = "Enter an amount above zero.";
    }
    const memo = body.memo === undefined ? "" : text(body.memo);
    if (memo.length > MEMO_MAX) {
      errors.memo = `Keep the memo under ${MEMO_MAX} characters.`;
    }
    const key = String(request.headers["idempotency-key"] || "").trim();
    if (key.length > 100) {
      errors.idempotencyKey = "Keep the Idempotency-Key under 100 characters.";
    }
    if (Object.keys(errors).length > 0) {
      throw invalid(errors);
    }

    const from = await ownAccount(user, fromAccountId);
    const toNumber = `PB-${numberMatch[1]}-${numberMatch[2]}`;
    const to = await money.findAccountByNumber(db, toNumber);
    if (!to) {
      throw new HttpError(
        404,
        "RECIPIENT_NOT_FOUND",
        "There's no account with that number.",
      );
    }
    if (to.id === from.id) {
      throw invalid({
        toAccountNumber: "Pick a different account from the one sending.",
      });
    }
    if (to.is_demo) {
      throw new HttpError(
        403,
        "DEMO_ACCOUNT",
        "Demo accounts can't receive money, so they stay the same for everyone.",
      );
    }

    let result;
    try {
      result = await money.transfer(db, {
        userId: user.id,
        from,
        to,
        amountCents,
        memo,
        key: key || null,
        race: Boolean(flags.bankTransferRace),
      });
    } catch (error) {
      if (error instanceof money.InsufficientFundsError) {
        throw new HttpError(
          409,
          "INSUFFICIENT_FUNDS",
          "The account doesn't have enough money for this transfer.",
        );
      }
      throw error;
    }
    const fromAccount = money.toMoneyAccount(
      await money.findOwnAccount(db, user.id, from.id),
    );
    sendJson(response, result.replayed ? 200 : 201, {
      transfer: result.transfer,
      fromAccount,
      replayed: result.replayed,
    });
  }

  async function bankUserDetail(response, user, targetId) {
    requireRole(user, ["support", "admin"]);
    const target = /^[0-9a-f-]{36}$/i.test(targetId)
      ? await accounts.findUserById(db, targetId)
      : null;
    if (!target) {
      throw new HttpError(404, "USER_NOT_FOUND", "There's no such user.");
    }
    const detail = await accounts.loadAccount(db, target.id);
    sendJson(response, 200, {
      user: detail.user,
      profile: detail.profile,
      accounts: await money.listAccounts(db, target.id),
    });
  }

  // --- Bill pay ---------------------------------------------------------------

  async function addPayee(request, response, user) {
    requireUser(user);
    requireEditable(user);
    const body = await readJson(request);
    const errors = {};
    const name = text(body.name);
    if (name.length < 2 || name.length > 60) {
      errors.name = "Name the payee in 2 to 60 characters.";
    }
    const reference = text(body.reference);
    if (
      reference.length < 2 ||
      reference.length > 40 ||
      !PAYEE_REFERENCE.test(reference)
    ) {
      errors.reference =
        "Use 2 to 40 letters, digits, spaces, dots, slashes or dashes.";
    }
    if (Object.keys(errors).length > 0) {
      throw invalid(errors);
    }
    try {
      sendJson(response, 201, {
        payee: await bills.addPayee(db, user.id, { name, reference }),
      });
    } catch (error) {
      if (error instanceof bills.TooManyPayeesError) {
        throw new HttpError(
          409,
          "TOO_MANY_PAYEES",
          "You can save up to " + bills.MAX_PAYEES + " payees.",
        );
      }
      throw error;
    }
  }

  async function deletePayee(request, response, user, payeeId, flags) {
    requireUser(user);
    requireEditable(user);
    await readJson(request);
    const deleted = await bills.deletePayee(db, user.id, payeeId, {
      anyOwner: Boolean(flags.bankPayeeIdor),
    });
    if (!deleted) {
      throw new HttpError(404, "PAYEE_NOT_FOUND", "There's no such payee.");
    }
    sendJson(response, 200, { message: "Payee deleted.", payee: deleted });
  }

  async function payBill(request, response, user) {
    requireUser(user);
    requireEditable(user);
    const body = await readJson(request);
    const errors = {};
    const fromAccountId = text(body.fromAccountId);
    if (!fromAccountId) {
      errors.fromAccountId = "Pick the account to pay from.";
    }
    const payeeId = text(body.payeeId);
    if (!payeeId) {
      errors.payeeId = "Pick who to pay.";
    }
    if (!Number.isSafeInteger(body.amountCents) || body.amountCents <= 0) {
      errors.amountCents = "Enter an amount above zero.";
    }
    const memo = body.memo === undefined ? "" : text(body.memo);
    if (memo.length > MEMO_MAX) {
      errors.memo = "Keep the memo under " + MEMO_MAX + " characters.";
    }
    const key = String(request.headers["idempotency-key"] || "").trim();
    if (key.length > 100) {
      errors.idempotencyKey = "Keep the Idempotency-Key under 100 characters.";
    }
    if (Object.keys(errors).length > 0) {
      throw invalid(errors);
    }
    const from = await ownAccount(user, fromAccountId);
    const payee = await bills.findOwnPayee(db, user.id, payeeId);
    if (!payee) {
      throw new HttpError(404, "PAYEE_NOT_FOUND", "There's no such payee.");
    }
    let result;
    try {
      result = await bills.payBill(db, {
        userId: user.id,
        from,
        payee,
        amountCents: body.amountCents,
        memo,
        key: key || null,
      });
    } catch (error) {
      if (error instanceof money.InsufficientFundsError) {
        throw new HttpError(
          409,
          "INSUFFICIENT_FUNDS",
          "The account doesn't have enough money for this payment.",
        );
      }
      throw error;
    }
    sendJson(response, result.replayed ? 200 : 201, {
      payment: result.payment,
      fromAccount: money.toMoneyAccount(
        await money.findOwnAccount(db, user.id, from.id),
      ),
      replayed: result.replayed,
    });
  }

  // --- Loans ------------------------------------------------------------------

  function checkLoanTerms(amountCents, termMonths, errors) {
    if (
      !Number.isSafeInteger(amountCents) ||
      amountCents < loans.MIN_LOAN_CENTS ||
      amountCents > loans.MAX_LOAN_CENTS
    ) {
      errors.amountCents = "Ask for $1,000 to $1,000,000.";
    }
    if (!Object.keys(loans.TERMS).map(Number).includes(termMonths)) {
      errors.termMonths = "Pick 12, 24, 36 or 60 months.";
    }
  }

  function loanQuote(response, user, requestUrl, flags) {
    requireUser(user);
    const params = requestUrl.searchParams;
    const errors = {};
    const amountText = params.get("amountCents") || "";
    const termText = params.get("termMonths") || "";
    if (!/^\d+$/.test(amountText) || !/^\d+$/.test(termText)) {
      if (!/^\d+$/.test(amountText)) {
        errors.amountCents = "Ask for $1,000 to $1,000,000.";
      }
      if (!/^\d+$/.test(termText)) {
        errors.termMonths = "Pick 12, 24, 36 or 60 months.";
      }
    } else {
      checkLoanTerms(Number(amountText), Number(termText), errors);
    }
    if (Object.keys(errors).length > 0) {
      throw invalid(errors);
    }
    sendJson(
      response,
      200,
      loans.quote(Number(amountText), Number(termText), {
        roundingBug: Boolean(flags.bankLoanRounding),
      }),
    );
  }

  async function requestLoan(request, response, user, flags) {
    requireUser(user);
    requireEditable(user);
    const body = await readJson(request);
    const errors = {};
    checkLoanTerms(body.amountCents, body.termMonths, errors);
    const accountId = text(body.accountId);
    if (!accountId) {
      errors.accountId = "Pick the account the money goes into.";
    }
    const purpose = body.purpose === undefined ? "" : text(body.purpose);
    if (purpose.length > MEMO_MAX) {
      errors.purpose = "Keep the purpose under " + MEMO_MAX + " characters.";
    }
    if (Object.keys(errors).length > 0) {
      throw invalid(errors);
    }
    const account = await ownAccount(user, accountId);
    try {
      sendJson(response, 201, {
        loan: await loans.requestLoan(db, {
          userId: user.id,
          account,
          amountCents: body.amountCents,
          termMonths: body.termMonths,
          purpose,
          roundingBug: Boolean(flags.bankLoanRounding),
        }),
      });
    } catch (error) {
      if (error instanceof loans.TooManyPendingError) {
        throw new HttpError(
          409,
          "TOO_MANY_PENDING",
          "You can have up to " + loans.MAX_PENDING + " loan requests waiting.",
        );
      }
      throw error;
    }
  }

  async function loanDetail(response, user, loanId) {
    requireUser(user);
    const row = await loans.findLoan(db, loanId);
    const staff = user.role === "support" || user.role === "admin";
    if (!row || (row.user_id !== user.id && !staff)) {
      throw new HttpError(404, "LOAN_NOT_FOUND", "There's no such loan.");
    }
    const loan = loans.toLoan(row);
    if (!staff) {
      delete loan.customer;
    }
    sendJson(response, 200, { loan, schedule: loans.scheduleFor(row) });
  }

  async function staffLoans(response, user, requestUrl) {
    requireRole(user, ["support", "admin"]);
    const status = requestUrl.searchParams.get("status") || undefined;
    if (status && !LOAN_STATUSES.includes(status)) {
      throw invalid({
        status: "Pick one of " + LOAN_STATUSES.join(", ") + ".",
      });
    }
    const list = await loans.listAllLoans(db, status);
    sendJson(response, 200, { loans: list, total: list.length });
  }

  async function decideLoan(request, response, user, loanId) {
    requireRole(user, ["admin"]);
    const body = await readJson(request);
    const errors = {};
    if (!["approve", "reject"].includes(body.decision)) {
      errors.decision = "Pick approve or reject.";
    }
    const note = body.note === undefined ? "" : text(body.note);
    if (note.length > 200) {
      errors.note = "Keep the note under 200 characters.";
    } else if (body.decision === "reject" && note.length < 2) {
      errors.note = "Say why the loan is rejected.";
    }
    if (Object.keys(errors).length > 0) {
      throw invalid(errors);
    }
    const row = await loans.findLoan(db, loanId);
    if (!row) {
      throw new HttpError(404, "LOAN_NOT_FOUND", "There's no such loan.");
    }
    // The person who asked for a loan can't also approve it (four eyes).
    if (row.user_id === user.id) {
      throw new HttpError(
        409,
        "CANNOT_DECIDE_OWN",
        "You can't decide your own loan; another Admin has to.",
      );
    }
    if (row.customer_is_demo) {
      throw new HttpError(
        403,
        "DEMO_READ_ONLY",
        "Demo accounts' loans can't be changed.",
      );
    }
    try {
      sendJson(response, 200, {
        loan: await loans.decideLoan(db, {
          loanId: row.id,
          deciderId: user.id,
          decision: body.decision,
          note,
        }),
      });
    } catch (error) {
      if (error instanceof loans.AlreadyDecidedError) {
        throw new HttpError(
          409,
          "ALREADY_DECIDED",
          "This loan was already decided.",
        );
      }
      throw error;
    }
  }

  // --- Connected flows: notifications, requests, support (phase 2c) -----------

  async function readNotification(request, response, user, id) {
    requireUser(user);
    await readJson(request);
    const updated = await notifications.markRead(db, user.id, id);
    if (!updated) {
      throw new HttpError(
        404,
        "NOTIFICATION_NOT_FOUND",
        "There's no such notification.",
      );
    }
    sendJson(response, 200, { notification: updated });
  }

  async function askForMoney(request, response, user) {
    requireUser(user);
    requireEditable(user);
    const body = await readJson(request);
    const errors = {};
    const toAccountId = text(body.toAccountId);
    if (!toAccountId) {
      errors.toAccountId = "Pick the account the money goes into.";
    }
    const numberMatch = text(body.fromAccountNumber).match(ACCOUNT_NUMBER);
    if (!numberMatch) {
      errors.fromAccountNumber = "Enter an account number like PB-1234-5678.";
    }
    checkCents(
      body.amountCents,
      1,
      MAX_TOP_UP_CENTS,
      "Ask for $0.01 to $1,000,000.",
      errors,
      "amountCents",
    );
    const memo = body.memo === undefined ? "" : text(body.memo);
    if (memo.length > MEMO_MAX) {
      errors.memo = "Keep the memo under " + MEMO_MAX + " characters.";
    }
    if (Object.keys(errors).length > 0) {
      throw invalid(errors);
    }
    const toAccount = await ownAccount(user, toAccountId);
    const payerAccount = await money.findAccountByNumber(
      db,
      "PB-" + numberMatch[1] + "-" + numberMatch[2],
    );
    if (!payerAccount) {
      throw new HttpError(
        404,
        "PAYER_NOT_FOUND",
        "There's no account with that number.",
      );
    }
    if (payerAccount.user_id === user.id) {
      throw invalid({
        fromAccountNumber:
          "Ask another customer, not one of your own accounts.",
      });
    }
    if (payerAccount.is_demo) {
      throw new HttpError(
        403,
        "DEMO_ACCOUNT",
        "Demo accounts can't be asked for money.",
      );
    }
    try {
      sendJson(response, 201, {
        request: await requests.createRequest(db, {
          requesterId: user.id,
          requesterName: user.fullName,
          toAccount,
          payerAccount,
          amountCents: body.amountCents,
          memo,
        }),
      });
    } catch (error) {
      if (error instanceof requests.TooManyRequestsError) {
        throw new HttpError(
          409,
          "TOO_MANY_REQUESTS",
          "You can have up to " +
            requests.MAX_PENDING_REQUESTS +
            " requests waiting.",
        );
      }
      throw error;
    }
  }

  function notPending() {
    return new HttpError(
      409,
      "REQUEST_NOT_PENDING",
      "This request was already answered.",
    );
  }

  async function answerRequest(
    request,
    response,
    user,
    requestId,
    action,
    flags,
  ) {
    requireUser(user);
    requireEditable(user);
    const body = await readJson(request);
    const row = await requests.findRequest(db, requestId);
    const mine =
      row &&
      (action === "cancel"
        ? row.requester_id === user.id
        : row.payer_id === user.id);
    if (!mine) {
      throw new HttpError(404, "REQUEST_NOT_FOUND", "There's no such request.");
    }
    try {
      if (action === "decline") {
        return sendJson(response, 200, {
          request: await requests.declineRequest(db, {
            request: row,
            payerId: user.id,
          }),
        });
      }
      if (action === "cancel") {
        return sendJson(response, 200, {
          request: await requests.cancelRequest(db, {
            request: row,
            requesterId: user.id,
          }),
        });
      }
      const fromAccountId = text(body.fromAccountId);
      if (!fromAccountId) {
        throw invalid({ fromAccountId: "Pick the account to pay from." });
      }
      const fromAccount = await ownAccount(user, fromAccountId);
      const key = String(request.headers["idempotency-key"] || "").trim();
      const result = await requests.payRequest(db, {
        request: row,
        payerId: user.id,
        fromAccount,
        key: key.slice(0, 100) || null,
        doublePay: Boolean(flags.bankRequestDoublePay),
      });
      return sendJson(response, 200, {
        ...result,
        fromAccount: money.toMoneyAccount(
          await money.findOwnAccount(db, user.id, fromAccount.id),
        ),
      });
    } catch (error) {
      if (error instanceof requests.RequestNotPendingError) {
        throw notPending();
      }
      if (error instanceof money.InsufficientFundsError) {
        throw new HttpError(
          409,
          "INSUFFICIENT_FUNDS",
          "The account doesn't have enough money to pay this.",
        );
      }
      if (error.code === "23505") {
        throw notPending();
      }
      throw error;
    }
  }

  async function openTicket(request, response, user) {
    requireUser(user);
    requireEditable(user);
    const body = await readJson(request);
    const errors = {};
    const subject = text(body.subject);
    if (subject.length < 3 || subject.length > 120) {
      errors.subject = "Write a subject of 3 to 120 characters.";
    }
    const message = text(body.body);
    if (message.length < 3 || message.length > 2000) {
      errors.body = "Write a message of 3 to 2,000 characters.";
    }
    let transactionId = null;
    if (body.transactionId !== undefined && body.transactionId !== null) {
      const own = await support.ownTransaction(db, user.id, body.transactionId);
      if (!own) {
        errors.transactionId = "That isn't one of your transactions.";
      } else {
        transactionId = own.id;
      }
    }
    if (Object.keys(errors).length > 0) {
      throw invalid(errors);
    }
    const ticket = await support.openTicket(db, {
      userId: user.id,
      subject,
      body: message,
      transactionId,
    });
    sendJson(response, 201, { ticket: support.toTicket(ticket) });
  }

  async function visibleTicket(user, ticketId) {
    requireUser(user);
    const row = await support.findTicket(db, ticketId);
    if (!row || (row.user_id !== user.id && !STAFF.includes(user.role))) {
      throw new HttpError(404, "TICKET_NOT_FOUND", "There's no such ticket.");
    }
    return row;
  }

  async function ticketDetail(response, user, ticketId) {
    const row = await visibleTicket(user, ticketId);
    sendJson(response, 200, {
      ticket: support.toTicket(row),
      messages: await support.ticketMessages(db, row.id),
    });
  }

  async function replyToTicket(request, response, user, ticketId, flags) {
    const row = await visibleTicket(user, ticketId);
    // Demo customers are read-only; demo staff can still answer real customers,
    // as the demo Admin can decide their loans.
    if (row.user_id === user.id) {
      requireEditable(user);
    }
    const body = await readJson(request);
    const message = text(body.body);
    if (message.length < 1 || message.length > 2000) {
      throw invalid({ body: "Write a message of 1 to 2,000 characters." });
    }
    if (row.customer_is_demo) {
      throw new HttpError(
        403,
        "DEMO_READ_ONLY",
        "Demo accounts' tickets can't be changed.",
      );
    }
    const updated = await support.addMessage(db, {
      ticket: row,
      author: user,
      body: message,
      statusBug: Boolean(flags.bankSupportStatus),
    });
    sendJson(response, 201, {
      ticket: support.toTicket(updated),
      messages: await support.ticketMessages(db, row.id),
    });
  }

  async function solveTicket(request, response, user, ticketId) {
    requireRole(user, STAFF);
    const body = await readJson(request);
    if (body.status !== "solved") {
      throw invalid({ status: "Send status: solved." });
    }
    const row = await visibleTicket(user, ticketId);
    if (row.customer_is_demo) {
      throw new HttpError(
        403,
        "DEMO_READ_ONLY",
        "Demo accounts' tickets can't be changed.",
      );
    }
    if (row.status === "solved") {
      throw new HttpError(
        409,
        "ALREADY_SOLVED",
        "This ticket is already solved.",
      );
    }
    sendJson(response, 200, {
      ticket: support.toTicket(await support.solveTicket(db, { ticket: row })),
    });
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
    if (match && method === "GET") {
      return bankUserDetail(response, user, decodeURIComponent(match[1]));
    }

    // Planted bugs are armed per runKey (?runKey= or the qa_runkey cookie)
    // through server.js's flag store; all are off by default.
    const flags = getFlags(request, requestUrl) || {};
    if (path === "/api/bank/accounts" && method === "GET") {
      return listMoneyAccounts(response, user);
    }
    if (path === "/api/bank/accounts" && method === "POST") {
      return openMoneyAccount(request, response, user);
    }
    if (path === "/api/bank/activity" && method === "GET") {
      requireUser(user);
      return sendJson(response, 200, {
        transactions: await money.recentActivity(db, user.id, 8),
      });
    }
    if (path === "/api/bank/transfers" && method === "POST") {
      return makeTransfer(request, response, user, flags);
    }
    if (path === "/api/bank/notifications" && method === "GET") {
      requireUser(user);
      return sendJson(
        response,
        200,
        await notifications.listNotifications(db, user.id, {
          countBug: Boolean(flags.bankNotificationCount),
        }),
      );
    }
    if (path === "/api/bank/notifications/read-all" && method === "POST") {
      requireUser(user);
      await readJson(request);
      return sendJson(response, 200, {
        marked: await notifications.markAllRead(db, user.id),
      });
    }
    const notificationMatch = path.match(
      /^\/api\/bank\/notifications\/([^/]+)\/read$/,
    );
    if (notificationMatch && method === "POST") {
      return readNotification(
        request,
        response,
        user,
        decodeURIComponent(notificationMatch[1]),
      );
    }
    if (path === "/api/bank/requests" && method === "GET") {
      requireUser(user);
      return sendJson(response, 200, await requests.listRequests(db, user.id));
    }
    if (path === "/api/bank/requests" && method === "POST") {
      return askForMoney(request, response, user);
    }
    const requestMatch = path.match(
      /^\/api\/bank\/requests\/([^/]+)\/(pay|decline|cancel)$/,
    );
    if (requestMatch && method === "POST") {
      return answerRequest(
        request,
        response,
        user,
        decodeURIComponent(requestMatch[1]),
        requestMatch[2],
        flags,
      );
    }
    if (path === "/api/bank/support" && method === "GET") {
      requireUser(user);
      return sendJson(response, 200, {
        tickets: await support.listMyTickets(db, user.id),
      });
    }
    if (path === "/api/bank/support" && method === "POST") {
      return openTicket(request, response, user);
    }
    const ticketMatch = path.match(/^\/api\/bank\/support\/([^/]+)$/);
    if (ticketMatch && method === "GET") {
      return ticketDetail(response, user, decodeURIComponent(ticketMatch[1]));
    }
    if (ticketMatch && method === "PATCH") {
      return solveTicket(
        request,
        response,
        user,
        decodeURIComponent(ticketMatch[1]),
      );
    }
    const messageMatch = path.match(
      /^\/api\/bank\/support\/([^/]+)\/messages$/,
    );
    if (messageMatch && method === "POST") {
      return replyToTicket(
        request,
        response,
        user,
        decodeURIComponent(messageMatch[1]),
        flags,
      );
    }
    if (path === "/api/bank/admin/support" && method === "GET") {
      requireRole(user, STAFF);
      const status = requestUrl.searchParams.get("status") || undefined;
      if (status && !TICKET_STATUSES.includes(status)) {
        throw invalid({
          status: "Pick one of " + TICKET_STATUSES.join(", ") + ".",
        });
      }
      const tickets = await support.listAllTickets(db, status);
      return sendJson(response, 200, { tickets, total: tickets.length });
    }
    if (path === "/api/bank/payees" && method === "GET") {
      requireUser(user);
      return sendJson(response, 200, {
        payees: await bills.listPayees(db, user.id),
      });
    }
    if (path === "/api/bank/payees" && method === "POST") {
      return addPayee(request, response, user);
    }
    const payeeMatch = path.match(/^\/api\/bank\/payees\/([^/]+)$/);
    if (payeeMatch && method === "DELETE") {
      return deletePayee(
        request,
        response,
        user,
        decodeURIComponent(payeeMatch[1]),
        flags,
      );
    }
    if (path === "/api/bank/bill-payments" && method === "GET") {
      requireUser(user);
      return sendJson(response, 200, {
        payments: await bills.listBillPayments(db, user.id),
      });
    }
    if (path === "/api/bank/bill-payments" && method === "POST") {
      return payBill(request, response, user);
    }
    if (path === "/api/bank/loans/quote" && method === "GET") {
      return loanQuote(response, user, requestUrl, flags);
    }
    if (path === "/api/bank/loans" && method === "GET") {
      requireUser(user);
      return sendJson(response, 200, {
        loans: await loans.listLoans(db, user.id),
      });
    }
    if (path === "/api/bank/loans" && method === "POST") {
      return requestLoan(request, response, user, flags);
    }
    const loanMatch = path.match(/^\/api\/bank\/loans\/([^/]+)$/);
    if (loanMatch && method === "GET") {
      return loanDetail(response, user, decodeURIComponent(loanMatch[1]));
    }
    if (path === "/api/bank/admin/loans" && method === "GET") {
      return staffLoans(response, user, requestUrl);
    }
    const decideMatch = path.match(/^\/api\/bank\/admin\/loans\/([^/]+)$/);
    if (decideMatch && method === "PATCH") {
      return decideLoan(
        request,
        response,
        user,
        decodeURIComponent(decideMatch[1]),
      );
    }
    const accountMatch = path.match(
      /^\/api\/bank\/accounts\/([^/]+)(\/deposits|\/transactions|\/statement\.csv)?$/,
    );
    if (accountMatch) {
      const accountId = decodeURIComponent(accountMatch[1]);
      const section = accountMatch[2];
      if (!section && method === "GET") {
        requireUser(user);
        const row = await ownAccount(user, accountId);
        return sendJson(response, 200, {
          account: money.toMoneyAccount(row),
        });
      }
      if (section === "/deposits" && method === "POST") {
        return addFunds(request, response, user, accountId);
      }
      if (section === "/transactions" && method === "GET") {
        return listHistory(response, user, accountId, requestUrl, flags);
      }
      if (section === "/statement.csv" && method === "GET") {
        return statement(response, user, accountId, requestUrl, flags);
      }
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
