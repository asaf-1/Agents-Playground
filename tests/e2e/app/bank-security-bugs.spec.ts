import { expect, test } from "@playwright/test";
import { armFlags } from "./_helpers";
import { PASSWORD, signIn, signUpCustomer, uniqueRunKey } from "./_bank";

// The security pack's planted bug, armed for one run key only. Without the
// flag the same steps end every other session, which
// api-bank-security.spec.ts checks.

test("bankEndOthersKeepsOne: log out everywhere else leaves the newest other device signed in", async ({
  request,
  browser,
}) => {
  const runKey = uniqueRunKey("end-others-keeps-one");
  await armFlags(request, runKey, { bankEndOthersKeepsOne: true });

  const { email } = await signUpCustomer(request, "Three Devices");
  const second = await browser.newContext();
  await signIn(second.request, email, PASSWORD);
  const third = await browser.newContext();
  await signIn(third.request, email, PASSWORD);

  const response = await request.post(
    `/api/bank/sessions/end-others?runKey=${runKey}`,
    { data: {} },
  );
  expect(response.status()).toBe(200);
  // Two other devices, but only one is ended: the count is one short.
  expect((await response.json()).ended).toBe(1);

  // The device that signed in last is the one that survives.
  expect((await second.request.get("/api/bank/me")).status()).toBe(401);
  expect((await third.request.get("/api/bank/me")).status()).toBe(200);

  await second.close();
  await third.close();
});
