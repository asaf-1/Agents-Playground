// Playwright's test tools, with the [RESULT] block printed after every test.
import {
  expect,
  expected,
  fact,
  test,
} from "../../../framework/fixtures/resultBlock";
// The bank helpers: accounts and sign up.
import { moneyAccounts, signUpCustomer } from "../../../framework/helpers/bank";

// The GraphQL explorer at /app/graphql (phase 2d): write a query, run it, read
// the answer, and browse the schema the server reports.

test.describe("Playground Bank GraphQL explorer", () => {
  // The explorer opens with an accounts query, and running it shows the
  // customer's account with no errors.
  test("runs the first example and shows the answer", async ({ page }) => {
    expected(
      "heading GraphQL; the query mentions accounts; Run shows 'No errors' and the Checking number",
    );
    // A new customer on the explorer.
    await signUpCustomer(page.request, "Explorer Customer");
    const [checking] = (await moneyAccounts(page.request)).accounts;
    fact("checking", checking.number);

    await page.goto("/app/graphql");
    await expect(page.getByTestId("app-heading")).toHaveText("GraphQL");
    await expect(page.getByTestId("graphql-query")).toContainText("accounts");

    // Run it.
    await page.getByTestId("graphql-run").click();
    await expect(page.getByTestId("graphql-response")).toBeVisible();
    await expect(page.getByTestId("graphql-result-status")).toHaveText(
      "No errors",
    );
    await expect(page.getByTestId("graphql-response")).toContainText(
      checking.number,
    );
  });

  // Choosing an example fills in its query and its variables.
  test("picking an example loads its query and variables", async ({ page }) => {
    expected(
      "the history example loads 'query History($id: ID!)' with a placeholder id; the loan example loads loanQuote with no variables",
    );
    await signUpCustomer(page.request, "Picking Customer");
    await page.goto("/app/graphql");

    // The history example.
    await page
      .getByTestId("graphql-example")
      .selectOption("One account with its history");
    await expect(page.getByTestId("graphql-query")).toContainText(
      "query History($id: ID!)",
    );
    await expect(page.getByTestId("graphql-variables")).toHaveValue(
      /paste-an-account-id-here/,
    );

    // The loan quote example.
    await page.getByTestId("graphql-example").selectOption("A loan quote");
    await expect(page.getByTestId("graphql-query")).toContainText("loanQuote");
    await expect(page.getByTestId("graphql-variables")).toHaveValue("");
  });

  // The history example runs with the customer's own account id as its variable.
  test("a query with variables runs against the signed-in customer", async ({
    page,
  }) => {
    expected("'No errors' and the Checking number in the answer");
    // A new customer picks the history example and pastes in their account id.
    await signUpCustomer(page.request, "Variable Customer");
    const [checking] = (await moneyAccounts(page.request)).accounts;
    fact("checking", checking.id);

    await page.goto("/app/graphql");
    await page
      .getByTestId("graphql-example")
      .selectOption("One account with its history");
    await page
      .getByTestId("graphql-variables")
      .fill(`{ "id": "${checking.id}" }`);
    await page.getByTestId("graphql-run").click();

    await expect(page.getByTestId("graphql-result-status")).toHaveText(
      "No errors",
    );
    await expect(page.getByTestId("graphql-response")).toContainText(
      checking.number,
    );
  });

  // The cards example and the paged history example both run.
  test("the newer examples run: cards with their charges, and history a page at a time", async ({
    page,
  }) => {
    expected(
      "the cards example shows the card's last4 with no errors; the paged history example runs with no errors and an endCursor",
    );
    // A new customer with a card.
    await signUpCustomer(page.request, "Newer Examples Customer");
    const [checking] = (await moneyAccounts(page.request)).accounts;
    const made = await page.request.post("/api/bank/cards", {
      data: { accountId: checking.id },
    });
    const { card } = await made.json();
    fact("cardId", card.id);

    // Cards and their charges.
    await page.goto("/app/graphql");
    await page
      .getByTestId("graphql-example")
      .selectOption("Cards and their charges");
    await page.getByTestId("graphql-run").click();
    await expect(page.getByTestId("graphql-result-status")).toHaveText(
      "No errors",
    );
    await expect(page.getByTestId("graphql-response")).toContainText(
      card.last4,
    );

    // History, five rows at a time, from the start.
    await page
      .getByTestId("graphql-example")
      .selectOption("History, a page at a time");
    await expect(page.getByTestId("graphql-query")).toContainText(
      "history(first: 5, after: $after)",
    );
    await page
      .getByTestId("graphql-variables")
      .fill(`{ "id": "${checking.id}", "after": null }`);
    await page.getByTestId("graphql-run").click();
    await expect(page.getByTestId("graphql-result-status")).toHaveText(
      "No errors",
    );
    await expect(page.getByTestId("graphql-response")).toContainText(
      "endCursor",
    );
  });

  // Variables that aren't JSON are caught on the page, and nothing is sent.
  test("variables that aren't JSON are caught before anything is sent", async ({
    page,
  }) => {
    expected(
      "'The variables aren't valid JSON.'; no answer shown; 0 queries sent (apart from the schema lookup)",
    );
    await signUpCustomer(page.request, "Broken Variables Customer");
    await page.goto("/app/graphql");

    // The schema panel introspects on its own; only a real query counts here.
    await expect(page.getByTestId("graphql-schema")).toBeVisible();
    let sent = 0;
    await page.route("**/api/bank/graphql**", async (route) => {
      const body = route.request().postDataJSON() as { query?: string };
      if (!body?.query?.includes("__schema")) {
        sent += 1;
      }
      await route.continue();
    });
    // Broken variables, then Run.
    await page.getByTestId("graphql-variables").fill("{ not json");
    await page.getByTestId("graphql-run").click();

    await expect(page.getByTestId("graphql-variables-error")).toHaveText(
      "The variables aren't valid JSON.",
    );
    await expect(page.getByTestId("graphql-response")).toHaveCount(0);
    fact("sent", sent);
    expect(sent).toBe(0);
  });

  // An error from the server is shown on the page.
  test("an error from the server is shown, not hidden", async ({ page }) => {
    expected("'1 error' and NOT_SIGNED_IN in the answer");
    await page.goto("/app/graphql");
    // Nobody is signed in, so the query is refused.
    await page.getByTestId("graphql-run").click();

    await expect(page.getByTestId("graphql-result-status")).toHaveText(
      "1 error",
    );
    await expect(page.getByTestId("graphql-response")).toContainText(
      "NOT_SIGNED_IN",
    );
  });

  // The schema panel shows the server's real types and fields.
  test("the schema panel lists the real Query and Mutation fields", async ({
    page,
  }) => {
    expected(
      "Query has accounts and loanQuote; Mutation has transfer; MoneyAccount has balanceCents: Cents!",
    );
    await page.goto("/app/graphql");
    const schema = page.getByTestId("graphql-schema");
    await expect(schema).toBeVisible();

    const query = page.getByTestId("graphql-type-Query");
    await expect(query).toContainText("accounts: [MoneyAccount!]!");
    await expect(query).toContainText("loanQuote(amountCents: Cents!");
    await expect(page.getByTestId("graphql-type-Mutation")).toContainText(
      "transfer(",
    );
    await expect(page.getByTestId("graphql-type-MoneyAccount")).toContainText(
      "balanceCents: Cents!",
    );
  });

  // The sidebar links to the REST docs and to the explorer, which links to the docs too.
  test("the Developers group links to the explorer and the REST docs", async ({
    page,
  }) => {
    expected(
      "the API docs link goes to /api/docs; the GraphQL link opens /app/graphql, whose docs link goes to /api/docs",
    );
    await page.goto("/app");
    await expect(page.getByTestId("nav-link-api-docs")).toHaveAttribute(
      "href",
      "/api/docs",
    );

    await page.getByTestId("nav-link-graphql").click();
    await expect(page).toHaveURL(/\/app\/graphql$/);
    await expect(page.getByTestId("graphql-page")).toBeVisible();
    await expect(page.getByTestId("graphql-docs-link")).toHaveAttribute(
      "href",
      "/api/docs",
    );
  });
});
