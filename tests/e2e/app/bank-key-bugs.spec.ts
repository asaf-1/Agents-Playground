import { expect, test } from "@playwright/test";
import { armFlags } from "./_helpers";
import { signUpCustomer, uniqueRunKey } from "./_bank";

// The API keys' planted bug, armed for one run key only. Without the flag
// the same request answers 403, which api-bank-keys.spec.ts checks.

test("bankKeyScopeLeak: a read-only key can add a payee", async ({
  request,
  browser,
}) => {
  const runKey = uniqueRunKey("key-scope-leak");
  await armFlags(request, runKey, { bankKeyScopeLeak: true });

  await signUpCustomer(request, "Leaky Customer");
  const made = await request.post("/api/bank/keys", {
    data: { name: "Read only", scope: "read" },
  });
  const { token } = await made.json();

  const api = await browser.newContext();
  const headers = { Authorization: `Bearer ${token}` };

  // Every other change is still refused…
  const transfer = await api.request.post(
    `/api/bank/scheduled-payments?runKey=${runKey}`,
    { headers, data: {} },
  );
  expect(transfer.status()).toBe(403);
  expect((await transfer.json()).code).toBe("KEY_READ_ONLY");

  // …but this one goes through.
  const payee = await api.request.post(`/api/bank/payees?runKey=${runKey}`, {
    headers,
    data: { name: "City Power", reference: "ACC-100234" },
  });
  expect(payee.status()).toBe(201);
  await api.close();
});
