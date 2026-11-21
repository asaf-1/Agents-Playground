// Shared k6 helpers for the load tests in tests/k6/ (Part 7 of the Codex
// review plan): where the bank is, and only ever this PC; new customers and
// their sessions; the bank's calls; and every answer sorted into what the
// bank meant (ok, a replay, a clear refusal, its "busy" answer) or an
// unexpected error. These run inside k6, not Node: k6's own modules only.

// k6's HTTP client, checks, and custom metrics.
import http from "k6/http";
import { check } from "k6";
import { Counter } from "k6/metrics";

// --- Where the bank is: this PC only ------------------------------------------

// The address the run script gives (scripts/k6/run.js, BASE_URL). Anything but
// http://127.0.0.1:<port> stops the test before a single request, so Render or
// any other site can never be hit by mistake. The run script refuses first;
// this is the second lock, for a script started by hand.
export function bankAddress() {
  const address = String(__ENV.BASE_URL || "");
  if (!/^http:\/\/127\.0\.0\.1:\d{2,5}$/.test(address)) {
    throw new Error(
      `Refused: the load tests run only against this PC (http://127.0.0.1:<port>), not "${address}". Start them with npm run k6:<stage>.`,
    );
  }
  return address;
}
const BASE = bankAddress();

// --- What each answer was -------------------------------------------------------

// Answers the bank gives on purpose, which are not errors: a payment it
// refuses with a reason, and its "busy, try again" for too many password
// checks at once.
const REFUSALS = [
  "INSUFFICIENT_FUNDS",
  "OUT_OF_STOCK",
  "CART_EMPTY",
  "PRICE_CHANGED",
  "IDEMPOTENCY_IN_PROGRESS",
];
export const unexpectedErrors = new Counter("unexpected_errors");
// Answers that took over a second, whatever they said: the quick sign that
// the bank is falling behind (p95 covers the whole run, so it reacts late).
export const slowAnswers = new Counter("slow_answers");
export const busyAnswers = new Counter("busy_answers");
export const refusedAnswers = new Counter("refused_answers");
export const replayedAnswers = new Counter("replayed_answers");

// Limits that always pass, for each stage's options: k6 reports a tagged
// count only when a limit names it, so this makes the run report its
// refusals one code at a time.
export const REPORT_REFUSALS = Object.fromEntries(
  REFUSALS.map((code) => [`refused_answers{code:${code}}`, ["count>=0"]]),
);

// The first two unexpected answers of each virtual user are printed, so a
// failed run says why without flooding the screen.
let printed = 0;

// The bank's error code in an answer, if it has one.
function codeOf(res) {
  try {
    return res.json("code") || null;
  } catch {
    return null;
  }
}

// Sorts one answer: "ok" when its status is one the call expects, "busy" for
// 503 SERVER_BUSY, "refused" for a clear refusal, otherwise "unexpected"
// (counted, and the first few printed).
export function judge(res, okStatuses, what) {
  if (res.timings && res.timings.duration > 1000) slowAnswers.add(1, { what });
  if (okStatuses.includes(res.status)) return "ok";
  const code = codeOf(res);
  if (res.status === 503 && code === "SERVER_BUSY") {
    busyAnswers.add(1, { what });
    return "busy";
  }
  if (res.status >= 400 && res.status < 500 && REFUSALS.includes(code)) {
    refusedAnswers.add(1, { what, code });
    return "refused";
  }
  unexpectedErrors.add(1, { what, status: String(res.status) });
  if (printed < 2) {
    printed++;
    console.error(
      `unexpected: ${what} answered ${res.status} ${String(res.body || res.error).slice(0, 200)}`,
    );
  }
  return "unexpected";
}

// --- Calls --------------------------------------------------------------------

// A request's options: JSON, the customer's session cookie (replacing
// whatever this virtual user's cookie jar holds), a key, and a name for the
// timings.
function options(name, session, key) {
  const headers = { "Content-Type": "application/json" };
  if (key) headers["Idempotency-Key"] = key;
  const params = { headers, tags: { name } };
  if (session) {
    params.cookies = { pb_session: { value: session, replace: true } };
  }
  return params;
}

// A GET, named for the timings.
export function get(path, name, session) {
  return http.get(`${BASE}${path}`, options(name, session));
}

// A POST with a JSON body.
export function post(path, body, name, session, key) {
  return http.post(
    `${BASE}${path}`,
    JSON.stringify(body),
    options(name, session, key),
  );
}

// A new Idempotency-Key.
export function newKey() {
  return crypto.randomUUID();
}

// --- Customers ------------------------------------------------------------------

// The password every load-test customer uses.
const PASSWORD = "loadtest-123";

// Signs up one new customer and returns what the run needs: the email, the
// session cookie's value, the accounts and their total. null when the bank
// said busy (the caller tries again).
export function signUp(label) {
  const email = `k6-${label}-${Date.now()}-${Math.floor(Math.random() * 1e9)}@example.test`;
  const res = post(
    "/api/bank/register",
    {
      fullName: `Load ${label}`,
      email,
      password: PASSWORD,
      acceptTerms: true,
    },
    "sign up",
  );
  if (judge(res, [201], "sign up") !== "ok") return null;
  const session = res.cookies.pb_session?.[0]?.value;
  const money = accounts(session);
  return { email, session, ...money };
}

// Signs up `count` customers, trying again while the bank says busy.
export function signUpMany(count) {
  const customers = [];
  while (customers.length < count) {
    const customer = signUp(String(customers.length + 1));
    if (customer) customers.push(customer);
  }
  return customers;
}

// Logs a customer in again (the password check is the bank's slowest step).
export function logIn(customer) {
  const res = post(
    "/api/bank/login",
    { email: customer.email, password: PASSWORD },
    "log in",
  );
  return judge(res, [200], "log in");
}

// A customer's accounts and their total.
export function accounts(session) {
  const res = get("/api/bank/accounts", "accounts", session);
  judge(res, [200], "accounts");
  const body = res.json();
  return { accounts: body.accounts, totalCents: body.totalCents };
}

// --- Money actions -------------------------------------------------------------

// A transfer of `amountCents` from one account to another account number.
export function transfer(session, fromId, toNumber, amountCents, memo, key) {
  const res = post(
    "/api/bank/transfers",
    { fromAccountId: fromId, toAccountNumber: toNumber, amountCents, memo },
    "transfer",
    session,
    key || newKey(),
  );
  const result = judge(res, [201, 200], "transfer");
  if (res.status === 200) replayedAnswers.add(1, { what: "transfer" });
  return { res, result };
}

// One product in the cart, then pay for it from an account.
export function buyOne(session, productId, accountId) {
  const added = post(
    "/api/bank/shop/cart",
    { productId, quantity: 1 },
    "add to cart",
    session,
  );
  if (judge(added, [201, 200], "add to cart") !== "ok") return "refused";
  const cart = get("/api/bank/shop/cart", "cart", session);
  if (judge(cart, [200], "cart") !== "ok") return "unexpected";
  const res = post(
    "/api/bank/shop/checkout",
    { accountId, expectedTotalCents: cart.json("totalCents") },
    "checkout",
    session,
    newKey(),
  );
  return judge(res, [201], "checkout");
}

// The products that can be bought now.
export function buyableProducts() {
  const res = get("/api/bank/shop/products", "products");
  judge(res, [200], "products");
  return res
    .json("products")
    .filter((item) => item.stock > 0 && item.status === "Available");
}

// --- The common reads ------------------------------------------------------------

// What most visits read: the bank's state, the market, the shop, and a
// signed-in customer's own page and accounts.
export function commonReads(customer) {
  judge(get("/api/bank/health/ready", "ready"), [200], "ready");
  judge(get("/api/bank/status", "status"), [200], "status");
  judge(get("/api/bank/market", "market"), [200], "market");
  judge(get("/api/bank/shop/products", "products"), [200], "products");
  judge(get("/api/bank/me", "me", customer.session), [200], "me");
  judge(
    get("/api/bank/accounts", "accounts", customer.session),
    [200],
    "accounts",
  );
}

// One item from a list, a different one each time, so the work spreads over
// every customer.
export function anyOf(list) {
  return list[Math.floor(Math.random() * list.length)];
}

// How many times this virtual user has shopped. Each virtual user runs its
// own copy of this file, so the count is its own.
let shopTurns = 0;

// The customer this virtual user shops as next, from a block of customers
// only it uses (__VU, k6's number for the user, from 1), taking turns:
//
// - No two users share a cart. A cart is the customer's, not the session's:
//   two users shopping as one customer at once could empty it under each
//   other, and the checkout then sent a total of 0, which the bank rightly
//   refuses (stress on GitHub, 2026-11-21).
// - No customer gets near 100 orders, the most the bank lists for one
//   (bank/shop.js listOrders). With one customer per user, a stress shopper
//   passed 100 in 45 s on GitHub and the money check could not count them
//   all (the same day).
//
// `users` is the most virtual users the stage runs at once. A stage with
// fewer customers than users would have to share, so it stops with an error.
export function ownCustomer(customers, users) {
  const perUser = Math.floor(customers.length / users);
  if (perUser < 1 || __VU > users) {
    throw new Error(
      `virtual user ${__VU} has no customer of its own: ${customers.length} customers for ${users} users; sign up at least one per user`,
    );
  }
  const turn = shopTurns++ % perUser;
  return customers[(__VU - 1) * perUser + turn];
}

// A transfer between two of the run's customers (or one customer's own two
// accounts): money only moves inside the group, so the money check holds.
// The amount is half a percent of the payer's Checking at the start (at least
// a dollar), so no number is written here and accounts rarely run dry.
export function transferInside(customers) {
  const from = anyOf(customers);
  const to = anyOf(customers);
  const [checking] = from.accounts;
  // The same customer twice: their other account. Compared by email, because
  // k6 hands out setup data as copies, so the same customer is never the same
  // object (`to === from` sent 1 transfer in 30 to its own account).
  const target = to.accounts[to.email === from.email ? 1 : 0];
  const amountCents = Math.max(100, Math.floor(checking.balanceCents / 200));
  return transfer(
    from.session,
    checking.id,
    target.number,
    amountCents,
    "load test",
  );
}

// A double press: the same transfer sent twice at once with one key. The bank
// must never move the money twice: at most one history row with this memo.
export function doublePress(customer, amountCents) {
  const [checking, savings] = customer.accounts;
  const memo = `double press ${newKey()}`;
  const body = JSON.stringify({
    fromAccountId: checking.id,
    toAccountNumber: savings.number,
    amountCents,
    memo,
  });
  const params = options("double press", customer.session, newKey());
  const url = `${BASE}/api/bank/transfers`;
  const answers = http.batch([
    ["POST", url, body, params],
    ["POST", url, body, params],
  ]);
  for (const res of answers) judge(res, [201, 200], "double press");
  const history = get(
    `/api/bank/accounts/${checking.id}/transactions?pageSize=100`,
    "history",
    customer.session,
  );
  judge(history, [200], "history");
  const rows = history
    .json("transactions")
    .filter((row) => row.memo === memo).length;
  check(rows, { "a double press never moves the money twice": (n) => n <= 1 });
}

// --- Money must still add up --------------------------------------------------

// The most orders the bank lists for one customer (bank/shop.js listOrders).
const ORDERS_LISTED = 100;

// After the run: the customers' money now, against their money before minus
// what they spent in the shop. Transfers only move money between these
// customers' accounts, so nothing else may change the total. Prints one
// MONEY line the run script reads, and records a check. A customer with a
// full order list can't be counted, so that fails too, loudly.
export function moneyStillAddsUp(customers) {
  let before = 0;
  let after = 0;
  let spent = 0;
  let full = 0;
  for (const customer of customers) {
    before += customer.totalCents;
    after += accounts(customer.session).totalCents;
    const orders = get("/api/bank/shop/orders", "orders", customer.session);
    judge(orders, [200], "orders");
    const list = orders.json("orders");
    if (list.length >= ORDERS_LISTED) full++;
    for (const order of list) spent += order.totalCents;
  }
  const adds = full === 0 && after === before - spent;
  console.log(
    `MONEY before=${before} after=${after} spent=${spent} full_order_lists=${full} adds_up=${adds}`,
  );
  check(adds, {
    "money adds up: after = before - spent in the shop": (ok) => ok,
  });
}

// The address, for the stage files' own calls.
export const bank = BASE;
