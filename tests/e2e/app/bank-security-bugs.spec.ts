// Playwright's test tools, with the [RESULT] block printed after every test.
import {
  expect,
  expected,
  test,
} from "../../../framework/fixtures/resultBlock";
// Arms a planted bug for one runKey.
import { armFlags } from "../../../framework/helpers/flags";
// The bank helpers: the shared test password, sign in, sign up, a unique runKey.
import {
  PASSWORD,
  signIn,
  signUpCustomer,
  uniqueRunKey,
} from "../../../framework/helpers/bank";

// The security pack's planted bug, armed for one run key only. Without the
// flag the same steps end every other session, which
// api-bank-security.spec.ts checks.

// With the bug armed, "log out everywhere else" ends one device too few.
test("bankEndOthersKeepsOne: log out everywhere else leaves the newest other device signed in", async ({
  request,
  browser,
}) => {
  expected(
    "with bankEndOthersKeepsOne armed: ended 1 of 2; the second device 401, the third (newest) still 200",
  );
  // Arm the bug for this runKey.
  const runKey = uniqueRunKey("end-others-keeps-one");
  await armFlags(request, runKey, { bankEndOthersKeepsOne: true });

  // The customer signed in on three devices: here, a second and a third.
  const { email } = await signUpCustomer(request, "Three Devices");
  const second = await browser.newContext();
  await signIn(second.request, email, PASSWORD);
  const third = await browser.newContext();
  await signIn(third.request, email, PASSWORD);

  // End the others, with the runKey.
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
