// Playwright's test tools, with the [RESULT] block printed after every test.
import {
  expect,
  expected,
  test,
} from "../../../framework/fixtures/resultBlock";
// Arms a planted bug for one runKey.
import { armFlags } from "../../../framework/helpers/flags";
// The bank helpers: sign up, a unique runKey.
import { signUpCustomer, uniqueRunKey } from "../../../framework/helpers/bank";

// The API keys' planted bug, armed for one run key only. Without the flag
// the same request answers 403, which api-bank-keys.spec.ts checks.

// With the bug armed, a read-only key can add a payee, though every other
// change is still refused.
test("bankKeyScopeLeak: a read-only key can add a payee", async ({
  request,
  browser,
}) => {
  expected(
    "with bankKeyScopeLeak armed: the read key's scheduled payment 403 KEY_READ_ONLY, but its new payee 201",
  );
  // Arm the bug for this runKey.
  const runKey = uniqueRunKey("key-scope-leak");
  await armFlags(request, runKey, { bankKeyScopeLeak: true });

  // A new customer makes a read-only key. The token is never printed.
  await signUpCustomer(request, "Leaky Customer");
  const made = await request.post("/api/bank/keys", {
    data: { name: "Read only", scope: "read" },
  });
  const { token } = await made.json();

  // A context that signs in by the key alone.
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
