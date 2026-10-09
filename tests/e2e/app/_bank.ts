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
