// Playwright's test tools, with the [RESULT] block printed after every test.
import {
  expect,
  expected,
  fact,
  test,
} from "../../../framework/fixtures/resultBlock";
// Fresh customers, their accounts, and the shared test password.
import {
  PASSWORD,
  moneyAccounts,
  signUpCustomer,
} from "../../../framework/helpers/bank";
// A sidebar link, with its group opened first if it is shut.
import { navLink } from "../../../framework/helpers/nav";

// No flash of the last person's data (md/plans/feedback-fixes-plan.md, Part 3).
// The bank's pages keep their answers in one shared cache, and the keys carry
// no user. Before the fix, signing out and in only marked those answers stale,
// so the next person to open the Bank page saw the last person's accounts
// until their own arrived. The fix (web/src/useBankSession.ts) cancels what is
// on its way and empties the bank's cache when the account changes.
// Everything after the first page load moves inside the app, never with
// page.goto: a fresh load empties the cache by itself and would hide the bug.

// How long B's accounts are held back, so a flash would be on screen long
// enough to be seen.
const HOLD_MS = 2_000;

test("after switching accounts, the next person never sees the last person's accounts", async ({
  page,
  playwright,
  baseURL,
}) => {
  expected(
    "A logs out, B logs in with B's accounts held back 2 s: A's account card never appears, B's does",
  );

  // Two customers, each signed up on a request context of their own, so the
  // page itself starts signed out.
  const { a, b } =
    await test.step("sign up two customers, A and B", async () => {
      const people = [];
      for (const name of ["Switch Customer A", "Switch Customer B"]) {
        const api = await playwright.request.newContext({ baseURL });
        const { email } = await signUpCustomer(api, name);
        const [first] = (await moneyAccounts(api)).accounts;
        await api.dispose();
        people.push({ email, accountId: first.id as string });
      }
      const [a, b] = people;
      fact("A's account", a.accountId);
      fact("B's account", b.accountId);
      return { a, b };
    });

  // Log in on the Log in page (the only page.goto), and fill the form.
  const logIn = async (email: string) => {
    await page.getByTestId("login-email").fill(email);
    await page.getByTestId("login-password").fill(PASSWORD);
    await page.getByTestId("login-submit").click();
    await expect(
      page.getByTestId("account-menu-trigger"),
      "the account menu shows someone signed in",
    ).not.toContainText("Guest");
  };

  await test.step("log in as A and open the Bank page", async () => {
    await page.goto("/app/login");
    await logIn(a.email);
    await (await navLink(page, "nav-link-bank")).click();
    await expect(
      page.getByTestId(`bank-account-card-${a.accountId}`),
      "A sees their own account",
    ).toBeVisible();
  });

  await test.step("log out from the account menu", async () => {
    await page.getByTestId("account-menu-trigger").click();
    await page.getByTestId("account-menu-logout").click();
    await expect(
      page.getByTestId("account-menu-trigger"),
      "the account menu says Guest after logging out",
    ).toContainText("Guest");
  });

  // From here on the accounts list is held back, like a slow connection.
  await test.step("hold back the accounts list for 2 seconds", async () => {
    await page.route(/\/api\/bank\/accounts(\?|$)/, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, HOLD_MS));
      await route.continue();
    });
  });

  await test.step("log in as B from the account menu", async () => {
    await page.getByTestId("account-menu-trigger").click();
    await page.getByTestId("account-menu-login").click();
    await logIn(b.email);
  });

  await test.step("open the Bank page as B, and watch for A's account", async () => {
    // Watching starts before the click, so a flash can't be missed; it ends a
    // second after B's accounts are let through.
    const sawA = page
      .getByTestId(`bank-account-card-${a.accountId}`)
      .waitFor({ state: "attached", timeout: HOLD_MS + 1_000 })
      .then(
        () => true,
        () => false,
      );
    await (await navLink(page, "nav-link-bank")).click();
    await expect(
      page.getByTestId(`bank-account-card-${b.accountId}`),
      "B sees their own account once it arrives",
    ).toBeVisible({ timeout: HOLD_MS + 8_000 });
    const flashed = await sawA;
    fact("A's account shown to B", flashed);
    expect(flashed, "A's account never appeared on B's Bank page").toBe(false);
  });
});
