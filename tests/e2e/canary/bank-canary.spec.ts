// The type of a page.
import type { Page } from "@playwright/test";
// Playwright's test tools, with the [RESULT] block printed after every test.
import {
  expect,
  expected,
  fact,
  test,
} from "../../../framework/fixtures/resultBlock";
// A status check that says what the server answered.
import { expectStatus } from "../../../framework/helpers/apiCheck";
// The bank helpers: a customer's accounts, sign-up, and money as the pages
// print it.
import {
  moneyAccounts,
  signUpCustomer,
  uniqueEmail,
  usd,
} from "../../../framework/helpers/bank";
// Watches the page for errors and failed requests.
import {
  watchBrowser,
  type ExpectedAnswer,
} from "../../../framework/helpers/browserWatch";
// An answer checked against bank/openapi.json.
import { matchesSchema } from "../../../framework/helpers/openApiSchema";
// What the server says about this visitor's practice mode.
import { practiceTruth } from "../../../framework/helpers/practice";

// The bank canary: the short check right after a merge, on the merged commit
// (post-merge-canary.yml) and in a fresh cluster (k8s-canary.yml, through
// scripts/k8s-test.js). Is the new bank alive, and does its main path work?
// Not the full regression: one look at each main part. Run it with
// `npm run test:canary`; it joins the full suite too.
//
// Every browser step fails on any page error, console error, failed request
// or unexpected error answer from the site. Nothing is written here that the
// bank decides: balances, amounts and counts come from its own answers.

// Answers a working bank gives on purpose: a visitor who is not signed in
// asks who they are and is told 401.
const EXPECTED_ANSWERS: ExpectedAnswer[] = [
  { method: "GET", path: "/api/bank/me", status: 401 },
];

// Starts watching the page, against the site the tests run on.
function watch(page: Page, baseURL: string | undefined) {
  return watchBrowser(page, baseURL ?? "", EXPECTED_ANSWERS);
}

// The last step of every browser test: nothing went wrong in the browser.
async function expectCleanBrowser(seen: { problems: () => string[] }) {
  await test.step("the browser saw no error and no failed request", () => {
    const problems = seen.problems();
    fact("browser problems", problems.length);
    expect(
      problems,
      "no page error, console error, failed request or unexpected error answer",
    ).toEqual([]);
  });
}

// An amount in cents as a person types it: 123456 -> "1234.56".
function typed(cents: number): string {
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}

test.describe("Bank canary: the new version is alive and its main path works", () => {
  // The home page with its menu, and the not-found page for a wrong address.
  test("the bank's home opens with its main menu, and an unknown address shows Page not found", async ({
    page,
    baseURL,
  }) => {
    expected(
      "/app: the menu, Home marked current, the Bank card; /app/canary-no-such-page: 'Page not found' with the menu still there; no browser errors",
    );
    const seen = watch(page, baseURL);

    await test.step("open the home page", async () => {
      await page.goto("/app");
      await expect(
        page.getByTestId("app-nav"),
        "the main menu shows",
      ).toBeVisible();
      await expect(
        page.getByTestId("nav-link-home"),
        "Home is marked as the current page",
      ).toHaveAttribute("aria-current", "page");
      await expect(
        page.getByTestId("hub-card-bank"),
        "the home page offers the bank",
      ).toBeVisible();
    });

    await test.step("open an address the bank does not have", async () => {
      await page.goto("/app/canary-no-such-page");
      await expect(
        page.getByTestId("app-heading"),
        "the page says Page not found",
      ).toHaveText("Page not found");
      await expect(
        page.getByTestId("app-nav"),
        "the menu stays, so there is a way back",
      ).toBeVisible();
    });

    await expectCleanBrowser(seen);
  });

  // Sign up through the form, then the Bank page shows the new accounts.
  test("a new customer signs up through the form and sees their accounts", async ({
    page,
    baseURL,
  }) => {
    expected(
      "the sign-up form lands on the profile with the name; the bank opened Checking and Savings; the Bank page shows each balance and the total as the API says; no browser errors",
    );
    const seen = watch(page, baseURL);
    const email = uniqueEmail("canary");
    fact("email", email);

    await test.step("sign up through the form", async () => {
      await page.goto("/app/signup");
      await page.getByTestId("signup-fullName").fill("Canary Customer");
      await page.getByTestId("signup-email").fill(email);
      await page.getByTestId("signup-password").fill("practice123");
      await page.getByTestId("signup-confirmPassword").fill("practice123");
      await page.getByTestId("signup-acceptTerms").check();
      await page.getByTestId("signup-submit").click();
      await expect(page, "sign-up lands on the profile").toHaveURL(
        /\/app\/profile$/,
      );
      await expect(
        page.getByTestId("profile-name"),
        "the profile shows the new customer",
      ).toHaveText("Canary Customer");
    });

    const { accounts, totalCents } =
      await test.step("read the new customer's accounts from the bank", async () => {
        const money = await moneyAccounts(page.request);
        fact(
          "accounts",
          money.accounts.map((a) => `${a.kind} ${a.balanceCents}`).join(", "),
        );
        expect(
          money.accounts.map((a) => a.kind),
          "every new customer gets Checking and Savings",
        ).toEqual(["checking", "savings"]);
        return money;
      });

    await test.step("the Bank page shows them", async () => {
      await page.goto("/app/bank");
      await expect(
        page.getByTestId("bank-total"),
        "the total is the bank's own",
      ).toHaveText(usd(totalCents));
      for (const account of accounts) {
        await expect(
          page.getByTestId(`account-balance-${account.id}`),
          `${account.name} shows its balance`,
        ).toHaveText(usd(account.balanceCents));
      }
    });

    await expectCleanBrowser(seen);
  });

  // One transfer through the form: the exact amount leaves Checking, reaches
  // Savings, and a receipt shows.
  test("a transfer from Checking to Savings moves the exact amount, and a receipt shows", async ({
    page,
    baseURL,
  }) => {
    expected(
      "a tenth of Checking, sent to Savings: the review and the receipt show it, Checking falls and Savings rises by exactly that amount; no browser errors",
    );
    const seen = watch(page, baseURL);
    const { checking, savings, amountCents } =
      await test.step("a new customer, and a tenth of their Checking", async () => {
        await signUpCustomer(page.request, "Canary Transfer");
        const [checking, savings] = (await moneyAccounts(page.request))
          .accounts;
        const amountCents = Math.floor(checking.balanceCents / 10);
        fact("checking", checking.balanceCents);
        fact("savings", savings.balanceCents);
        fact("amount", amountCents);
        return { checking, savings, amountCents };
      });

    await test.step("send it through the form", async () => {
      await page.goto("/app/bank");
      await page.getByTestId(`account-transfer-${checking.id}`).click();
      await page.getByTestId("transfer-to-account").selectOption(savings.id);
      await page.getByTestId("transfer-amount").fill(typed(amountCents));
      await page.getByTestId("transfer-review").click();
      await expect(
        page.getByTestId("summary-amount"),
        "the review shows the amount",
      ).toHaveText(usd(amountCents));
      await page.getByTestId("transfer-confirm").click();
    });

    await test.step("the receipt shows the amount and the new balance", async () => {
      await expect(
        page.getByTestId("transfer-receipt"),
        "a receipt shows",
      ).toBeVisible();
      await expect(
        page.getByTestId("receipt-amount"),
        "the receipt shows the amount",
      ).toHaveText(usd(amountCents));
      await expect(
        page.getByTestId("receipt-from-balance"),
        "the receipt shows Checking's new balance",
      ).toHaveText(usd(checking.balanceCents - amountCents));
    });

    await test.step("the bank moved exactly that amount", async () => {
      const [after, saved] = (await moneyAccounts(page.request)).accounts;
      fact("checking after", after.balanceCents);
      fact("savings after", saved.balanceCents);
      expect(after.balanceCents, "Checking fell by exactly the amount").toBe(
        checking.balanceCents - amountCents,
      );
      expect(saved.balanceCents, "Savings rose by exactly the amount").toBe(
        savings.balanceCents + amountCents,
      );
    });

    await expectCleanBrowser(seen);
  });

  // Your progress lists every fault in the catalogue, all off.
  test("the practice list loads with every fault off", async ({
    page,
    baseURL,
  }) => {
    expected(
      "the server has no fault on; /app/practice/progress: 'Practice mode is off', one On/Off switch per fault in the catalogue, the switch 'off'; no browser errors",
    );
    const seen = watch(page, baseURL);
    const truth = await test.step("ask the server what is on", async () => {
      const truth = await practiceTruth(page);
      fact("faults", truth.total);
      expect(truth.armed, "a new visitor has no fault on").toEqual([]);
      return truth;
    });

    await test.step("open Your progress", async () => {
      await page.goto("/app/practice/progress");
      await expect(
        page.getByTestId("practice-state"),
        "the page says practice mode is off",
      ).toContainText("Practice mode is off");
      await expect(
        page.locator('[data-testid^="bug-toggle-"]'),
        "one On/Off switch for every fault in the catalogue",
      ).toHaveCount(truth.total);
      await expect(
        page.getByTestId("practice-switch-state"),
        "the top switch says off",
      ).toHaveText("off");
    });

    await expectCleanBrowser(seen);
  });

  // The bank's answers are what bank/openapi.json promises: the ready check,
  // a sign-up, the accounts, and one error answer.
  test("the bank's answers match bank/openapi.json: ready, sign-up, accounts and an error", async ({
    request,
  }) => {
    expected(
      "ready 200 BankReadyResponse; signed out, /me 401 BankError; sign-up 201 BankAccountResponse; accounts 200 BankMoneyAccountsResponse",
    );
    // Checks one answer against its schema in bank/openapi.json.
    const matches = (name: string, body: unknown) => {
      const schema = matchesSchema(name, body);
      expect(
        schema.valid,
        `the answer matches ${name} in bank/openapi.json: ${schema.errors}`,
      ).toBe(true);
    };

    await test.step("the ready check", async () => {
      const response = await request.get("/api/bank/health/ready");
      await expectStatus(response, 200, "the bank is ready");
      const body = await response.json();
      fact("revision", body.revision);
      matches("BankReadyResponse", body);
    });

    await test.step("an error answer: who am I, signed out", async () => {
      const response = await request.get("/api/bank/me");
      await expectStatus(response, 401, "a signed-out visitor is not anyone");
      matches("BankError", await response.json());
    });

    await test.step("a sign-up", async () => {
      const { account } = await signUpCustomer(request, "Canary Contract");
      matches("BankAccountResponse", account);
    });

    await test.step("the new customer's accounts", async () => {
      const response = await request.get("/api/bank/accounts");
      await expectStatus(response, 200, "the accounts answer");
      matches("BankMoneyAccountsResponse", await response.json());
    });
  });
});
