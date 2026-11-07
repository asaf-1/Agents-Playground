// Playwright's expect, and the type of a request context (the `request` fixture,
// page.request, or one made with playwright.request.newContext()).
import { expect, type APIRequestContext } from "@playwright/test";
// Adds a line to the running test's [RESULT] block.
import { fact } from "../fixtures/resultBlock";

// Shared helpers for the Playground Bank specs. Every test that changes data
// signs up its own customer with a unique email, so tests never share state
// and the demo accounts are never changed.

// The demo people the server seeds. They are read-only: tests sign in as them
// but never change their data.
export const DEMO = {
  customer: "maya@playgroundbank.test",
  support: "sam@playgroundbank.test",
  admin: "alex@playgroundbank.test",
  locked: "lee@playgroundbank.test",
};
// The demo password, and the one every new test customer gets.
export const DEMO_PASSWORD = "demo1234";
export const PASSWORD = "practice123";

// Counts the emails made by this worker, so two in the same millisecond differ.
let counter = 0;

// A new email nobody has used: the prefix, the time, the worker's process id,
// the counter and a random tail.
export function uniqueEmail(prefix: string): string {
  counter += 1;
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now()}-${process.pid}-${counter}-${random}@example.test`;
}

// Signs up a fresh customer. Called with page.request, the page's browser is
// signed in as that customer too (they share cookies).
export async function signUpCustomer(
  request: APIRequestContext,
  fullName = "Test Customer",
) {
  // Register with a unique email and the shared test password.
  const email = uniqueEmail("customer");
  const response = await request.post("/api/bank/register", {
    data: { fullName, email, password: PASSWORD, acceptTerms: true },
  });
  // The account is created (201); keep the email and the new user's id.
  expect(response.status(), await response.text()).toBe(201);
  const account = await response.json();
  fact("customer", email);
  fact("userId", account.user.id);
  return { email, id: account.user.id as string, account };
}

// Signs in as an existing person. The password defaults to the demo one.
export async function signIn(
  request: APIRequestContext,
  email: string,
  password = DEMO_PASSWORD,
) {
  // Log in; the answer must be 200, and the cookie stays on this context.
  const response = await request.post("/api/bank/login", {
    data: { email, password },
  });
  expect(response.status(), await response.text()).toBe(200);
  fact("signed in", email);
  return response.json();
}

// --- Money (phase 2b) ---------------------------------------------------------

// One of the customer's accounts, as the API returns it.
export interface MoneyAccount {
  id: string;
  number: string;
  kind: "checking" | "savings";
  name: string;
  balanceCents: number;
  createdAt: string;
}

// A new customer opens Checking first, then Savings -- but the money in them is
// drawn from their own id, so no two customers start on the same balance. Read
// the opening balance off the customer's own accounts rather than assuming one.

// Money the way the pages print it, so a test can expect the customer's real
// balance instead of a number written into the test.
export function usd(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

// Today's date in UTC, as YYYY-MM-DD.
export function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

// The signed-in customer's accounts and their total.
export async function moneyAccounts(
  request: APIRequestContext,
): Promise<{ accounts: MoneyAccount[]; totalCents: number }> {
  const response = await request.get("/api/bank/accounts");
  expect(response.status(), await response.text()).toBe(200);
  return response.json();
}

// The balance of one account, in cents, read fresh from the API.
export async function balanceOf(
  request: APIRequestContext,
  accountId: string,
): Promise<number> {
  const response = await request.get(`/api/bank/accounts/${accountId}`);
  expect(response.status(), await response.text()).toBe(200);
  return (await response.json()).account.balanceCents;
}

// Puts money into an account (a deposit), and checks it was taken (201).
export async function addFunds(
  request: APIRequestContext,
  accountId: string,
  amountCents: number,
) {
  fact("deposit", `${amountCents} cents into ${accountId}`);
  const response = await request.post(
    `/api/bank/accounts/${accountId}/deposits`,
    { data: { amountCents } },
  );
  expect(response.status(), await response.text()).toBe(201);
  return response.json();
}

// Sends money between accounts. It returns the answer without checking it, so
// a test can expect a refusal too. An Idempotency-Key and a runKey (which arms
// a planted bug for this test only) are optional.
export function sendMoney(
  request: APIRequestContext,
  data: {
    fromAccountId: string;
    toAccountNumber: string;
    amountCents: number;
    memo?: string;
  },
  options: { key?: string; runKey?: string } = {},
) {
  fact(
    "transfer",
    `${data.amountCents} cents from ${data.fromAccountId} to ${data.toAccountNumber}`,
  );
  fact("runKey", options.runKey);
  // The runKey travels in the query string; the key in a header.
  const query = options.runKey
    ? `?runKey=${encodeURIComponent(options.runKey)}`
    : "";
  return request.post(`/api/bank/transfers${query}`, {
    data,
    headers: options.key ? { "Idempotency-Key": options.key } : {},
  });
}

// A unique runKey for arming planted bugs in one test only.
export function uniqueRunKey(prefix: string): string {
  return `${prefix}-${Date.now()}-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
}

// --- Bill pay and loans (phase 2b-2) ------------------------------------------

// Saves a payee for the signed-in customer and returns it (id and name).
export async function addPayee(
  request: APIRequestContext,
  name = "City Power",
  reference = "ACC-100234",
) {
  fact("payee", `${name} (${reference})`);
  const response = await request.post("/api/bank/payees", {
    data: { name, reference },
  });
  expect(response.status(), await response.text()).toBe(201);
  return (await response.json()).payee as { id: string; name: string };
}

// Asks for a loan into one account. It waits for a decision (status pending).
export async function requestLoan(
  request: APIRequestContext,
  accountId: string,
  amountCents = 1_200_000,
  termMonths = 12,
  purpose = "Kitchen",
) {
  fact(
    "loan ask",
    `${amountCents} cents over ${termMonths} months into ${accountId}`,
  );
  const response = await request.post("/api/bank/loans", {
    data: { accountId, amountCents, termMonths, purpose },
  });
  expect(response.status(), await response.text()).toBe(201);
  return (await response.json()).loan as { id: string; status: string };
}

// --- GraphQL (phase 2d) ---------------------------------------------------------

// One error in a GraphQL answer.
export interface GraphqlError {
  message: string;
  path?: (string | number)[];
  extensions?: { code?: string; stacktrace?: string[] };
}

// A GraphQL answer: the data, the errors, or both.
export interface GraphqlAnswer<T> {
  data?: T;
  errors?: GraphqlError[];
}

// A GraphQL answer is always HTTP 200: what went wrong is in `errors`. Every
// call asserts that, so a test that expects an error still reads the body.
export async function graphql<T = Record<string, unknown>>(
  request: APIRequestContext,
  query: string,
  variables?: Record<string, unknown>,
  runKey?: string,
): Promise<GraphqlAnswer<T>> {
  // The query itself, as one short line, so the block says which call it was.
  fact("graphql", query);
  // A runKey arms a planted bug for this call only.
  const path = runKey
    ? `/api/bank/graphql?runKey=${encodeURIComponent(runKey)}`
    : "/api/bank/graphql";
  const response = await request.post(path, { data: { query, variables } });
  expect(response.status(), await response.text()).toBe(200);
  return response.json();
}

// The code of the first error, or undefined when nothing went wrong.
export function errorCode(answer: GraphqlAnswer<unknown>): string | undefined {
  return answer.errors?.[0]?.extensions?.code;
}
