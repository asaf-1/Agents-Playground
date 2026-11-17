// Playwright's test tools, with the [RESULT] block printed after every test,
// and the type of a request context.
import {
  expect,
  expected,
  fact,
  test,
} from "../../../framework/fixtures/resultBlock";
import type { APIRequestContext } from "@playwright/test";
// A fresh customer, and a unique email.
import { signUpCustomer, uniqueEmail } from "../../../framework/helpers/bank";
// A status check that says what the server answered when it is wrong.
import { expectStatus } from "../../../framework/helpers/apiCheck";
// A short-lived bank server with its own settings.
import { startBankServer } from "../../../framework/helpers/bankServer";

// Who is calling, and the limits on costly requests (md/plans/
// feedback-fixes-plan.md, Part 2; bank/auth.js and bank/limits.js).
//   - The login hold counts the socket's address; X-Forwarded-For only with
//     BANK_TRUST_PROXY=true, and then its last entry, the one the proxy wrote.
//     Before the fix the first entry was trusted, so a new fake address each
//     time was never held.
//   - BANK_SIGNUP_BURST limits new accounts per address.
//   - A gate lets only BANK_HASH_CONCURRENCY password checks run at once, with
//     BANK_HASH_QUEUE waiting; past that the answer is 503 SERVER_BUSY.
// The suite's server has none of these settings, so the last three tests start
// their own server.

// The login hold's default: the fifth wrong password starts it.
const MAX_FAILURES = 5;

// Sends wrong passwords for one email, each with the X-Forwarded-For that
// forwardedFor(i) gives, and returns the statuses.
async function wrongPasswords(
  request: APIRequestContext,
  email: string,
  forwardedFor: (i: number) => string,
) {
  const responses = [];
  for (let i = 1; i <= MAX_FAILURES; i++) {
    responses.push(
      await request.post("/api/bank/login", {
        data: { email, password: `wrong-password-${i}` },
        headers: { "x-forwarded-for": forwardedFor(i) },
      }),
    );
  }
  return responses;
}

test("a fake address in X-Forwarded-For can't dodge the login hold", async ({
  request,
}) => {
  expected(
    "5 wrong passwords, each claiming a new address: 401 x4, then 429 (held)",
  );

  // A customer whose email the wrong passwords are sent for.
  const { email } = await test.step("sign up a customer", () =>
    signUpCustomer(request, "Fake Address"));

  // Each attempt claims a different address; the suite's server trusts none.
  const responses =
    await test.step("send 5 wrong passwords, each with a new fake address", () =>
      wrongPasswords(request, email, (i) => `198.51.100.${i}`));

  // The hold counts the real caller, so the fifth starts it.
  await test.step("check the hold started on the fifth", async () => {
    for (const response of responses.slice(0, MAX_FAILURES - 1)) {
      await expectStatus(response, 401, "a wrong password is refused");
    }
    await expectStatus(
      responses[MAX_FAILURES - 1],
      429,
      "the fifth wrong password starts the hold, whatever address the header claims",
    );
  });
});

test("behind a trusted proxy, the hold counts the address the proxy wrote last", async ({
  playwright,
}) => {
  expected(
    "BANK_TRUST_PROXY=true: last entry 203.0.113.7 held after 5 (first entries vary); 203.0.113.8 not held",
  );

  // A server that trusts its proxy, as on Render.
  const server = await test.step("start a bank that trusts its proxy", () =>
    startBankServer({ BANK_TRUST_PROXY: "true" }));
  const api = await playwright.request.newContext({ baseURL: server.baseURL });
  try {
    const { email } = await test.step("sign up a customer", () =>
      signUpCustomer(api, "Behind Proxy"));

    // The caller writes anything first; the proxy's entry is always last.
    const responses =
      await test.step("send 5 wrong passwords, the caller's part changing, the proxy's not", () =>
        wrongPasswords(api, email, (i) => `198.51.100.${i}, 203.0.113.7`));
    await test.step("check the proxy's address was held", async () => {
      for (const response of responses.slice(0, MAX_FAILURES - 1)) {
        await expectStatus(response, 401, "a wrong password is refused");
      }
      await expectStatus(
        responses[MAX_FAILURES - 1],
        429,
        "the fifth wrong password from the proxy's address 203.0.113.7 starts the hold",
      );
    });

    // Someone else behind the same proxy has their own count.
    await test.step("send a wrong password from another visitor", async () => {
      const other = await api.post("/api/bank/login", {
        data: { email, password: "wrong-password-other" },
        headers: { "x-forwarded-for": "198.51.100.9, 203.0.113.8" },
      });
      await expectStatus(
        other,
        401,
        "another visitor (203.0.113.8) is not held by someone else's mistakes",
      );
    });
  } finally {
    await api.dispose();
    await server.stop();
  }
});

test("one address can open only as many accounts as the sign-up limit allows", async ({
  playwright,
}) => {
  expected(
    "BANK_SIGNUP_BURST=2: status states it; sign-ups 1 and 2: 201; the third: 429 TOO_MANY_SIGNUPS with a wait",
  );

  // A server with a small limit: 2 at once, then one an hour.
  const server = await test.step("start a bank with a sign-up limit of 2", () =>
    startBankServer({
      BANK_SIGNUP_BURST: "2",
      BANK_SIGNUP_EVERY_SECONDS: "3600",
    }));
  const api = await playwright.request.newContext({ baseURL: server.baseURL });
  // One sign-up with a new email.
  const signUp = () =>
    api.post("/api/bank/register", {
      data: {
        fullName: "Limit Tester",
        email: uniqueEmail("limit"),
        password: "practice123",
        acceptTerms: true,
      },
    });
  try {
    // The page reads the limit from here, so it is stated before anyone hits it.
    await test.step("read the limit the bank states", async () => {
      const status = await api.get("/api/bank/status");
      await expectStatus(status, 200, "the bank's status answers");
      expect(
        (await status.json()).limits?.signup,
        "the status states the sign-up limit",
      ).toEqual({ burst: 2, everySeconds: 3600 });
    });

    await test.step("open two accounts from one address", async () => {
      await expectStatus(await signUp(), 201, "the first account is opened");
      await expectStatus(await signUp(), 201, "the second account is opened");
    });

    await test.step("try a third from the same address", async () => {
      const third = await signUp();
      await expectStatus(third, 429, "the third account is refused");
      const body = await third.json();
      fact("refusal", body.message);
      expect(body.code, "the refusal names the limit").toBe("TOO_MANY_SIGNUPS");
      expect(
        body.retryAfterSeconds,
        "it says how long to wait",
      ).toBeGreaterThan(0);
      expect(
        third.headers()["retry-after"],
        "the wait is in Retry-After too",
      ).toBe(String(body.retryAfterSeconds));
      expect(body.message, "the message says when to try again").toContain(
        "Try again in",
      );
    });
  } finally {
    await api.dispose();
    await server.stop();
  }
});

test("past the hashing gate's line the bank answers busy instead of slowing everyone down", async ({
  playwright,
}) => {
  expected(
    "BANK_HASH_CONCURRENCY=1, BANK_HASH_QUEUE=1: 6 log-ins at once: some 503 SERVER_BUSY, the rest 401",
  );

  // A gate of one at a time and one waiting, so a few at once overflow it.
  const server = await test.step("start a bank with a tiny hashing gate", () =>
    startBankServer({ BANK_HASH_CONCURRENCY: "1", BANK_HASH_QUEUE: "1" }));
  const api = await playwright.request.newContext({ baseURL: server.baseURL });
  try {
    // Unknown emails are checked against a decoy hash, so each one costs a
    // full password check, the same as a real account.
    const responses = await test.step("send 6 log-ins at the same moment", () =>
      Promise.all(
        Array.from({ length: 6 }, (_, i) =>
          api.post("/api/bank/login", {
            data: { email: uniqueEmail(`busy-${i}`), password: "practice123" },
          }),
        ),
      ));

    await test.step("check the overflow was told to come back", async () => {
      const statuses = responses.map((response) => response.status());
      fact("statuses", statuses.join(" "));
      expect(
        statuses.every((status) => status === 401 || status === 503),
        "each log-in is either checked (401) or told busy (503)",
      ).toBe(true);
      const busy = responses.filter((response) => response.status() === 503);
      expect(busy.length, "at least one log-in is told busy").toBeGreaterThan(
        0,
      );
      expect(
        statuses.filter((status) => status === 401).length,
        "the ones in the gate are still checked",
      ).toBeGreaterThan(0);
      const body = await busy[0].json();
      expect(body.code, "the busy answer names itself").toBe("SERVER_BUSY");
      expect(
        busy[0].headers()["retry-after"],
        "it says when to try again",
      ).toBe("2");
    });
  } finally {
    await api.dispose();
    await server.stop();
  }
});
