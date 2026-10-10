import { expect, type APIRequestContext } from "@playwright/test";

// Shared helpers for the Playground Bank specs. Every test that changes data
// signs up its own customer with a unique email, so tests never share state
// and the demo accounts are never changed.

export const DEMO = {
  customer: "maya@playgroundbank.test",
  support: "sam@playgroundbank.test",
  admin: "alex@playgroundbank.test",
  locked: "lee@playgroundbank.test",
};
export const DEMO_PASSWORD = "demo1234";
export const PASSWORD = "practice123";

let counter = 0;

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
  const email = uniqueEmail("customer");
  const response = await request.post("/api/bank/register", {
    data: { fullName, email, password: PASSWORD, acceptTerms: true },
  });
  expect(response.status(), await response.text()).toBe(201);
  const account = await response.json();
  return { email, id: account.user.id as string, account };
}

export async function signIn(
  request: APIRequestContext,
  email: string,
  password = DEMO_PASSWORD,
) {
  const response = await request.post("/api/bank/login", {
    data: { email, password },
  });
  expect(response.status(), await response.text()).toBe(200);
  return response.json();
}

// --- Money (phase 2b) ---------------------------------------------------------

export interface MoneyAccount {
  id: string;
  number: string;
  kind: "checking" | "savings";
  name: string;
  balanceCents: number;
  createdAt: string;
}

// A new customer starts with these two, Checking first.
export const STARTER_CENTS = { checking: 2_500_000, savings: 7_500_000 };

export function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function moneyAccounts(
  request: APIRequestContext,
): Promise<{ accounts: MoneyAccount[]; totalCents: number }> {
  const response = await request.get("/api/bank/accounts");
  expect(response.status(), await response.text()).toBe(200);
  return response.json();
}

export async function balanceOf(
  request: APIRequestContext,
  accountId: string,
): Promise<number> {
  const response = await request.get(`/api/bank/accounts/${accountId}`);
  expect(response.status(), await response.text()).toBe(200);
  return (await response.json()).account.balanceCents;
}

export async function addFunds(
  request: APIRequestContext,
  accountId: string,
  amountCents: number,
) {
  const response = await request.post(
    `/api/bank/accounts/${accountId}/deposits`,
    { data: { amountCents } },
  );
  expect(response.status(), await response.text()).toBe(201);
  return response.json();
}

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

export async function addPayee(
  request: APIRequestContext,
  name = "City Power",
  reference = "ACC-100234",
) {
  const response = await request.post("/api/bank/payees", {
    data: { name, reference },
  });
  expect(response.status(), await response.text()).toBe(201);
  return (await response.json()).payee as { id: string; name: string };
}

export async function requestLoan(
  request: APIRequestContext,
  accountId: string,
  amountCents = 1_200_000,
  termMonths = 12,
  purpose = "Kitchen",
) {
  const response = await request.post("/api/bank/loans", {
    data: { accountId, amountCents, termMonths, purpose },
  });
  expect(response.status(), await response.text()).toBe(201);
  return (await response.json()).loan as { id: string; status: string };
}
