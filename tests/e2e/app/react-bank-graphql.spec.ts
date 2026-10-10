import { expect, test } from "@playwright/test";
import { moneyAccounts, signUpCustomer } from "./_bank";

// The GraphQL explorer at /app/graphql (phase 2d): write a query, run it, read
// the answer, and browse the schema the server reports.

test.describe("Playground Bank GraphQL explorer", () => {
  test("runs the first example and shows the answer", async ({ page }) => {
    await signUpCustomer(page.request, "Explorer Customer");
    const [checking] = (await moneyAccounts(page.request)).accounts;

    await page.goto("/app/graphql");
    await expect(page.getByTestId("app-heading")).toHaveText("GraphQL");
    await expect(page.getByTestId("graphql-query")).toContainText("accounts");

    await page.getByTestId("graphql-run").click();
    await expect(page.getByTestId("graphql-response")).toBeVisible();
    await expect(page.getByTestId("graphql-result-status")).toHaveText(
      "No errors",
    );
    await expect(page.getByTestId("graphql-response")).toContainText(
      checking.number,
    );
  });

  test("picking an example loads its query and variables", async ({ page }) => {
    await signUpCustomer(page.request, "Picking Customer");
    await page.goto("/app/graphql");

    await page
      .getByTestId("graphql-example")
      .selectOption("One account with its history");
    await expect(page.getByTestId("graphql-query")).toContainText(
      "query History($id: ID!)",
    );
    await expect(page.getByTestId("graphql-variables")).toHaveValue(
      /paste-an-account-id-here/,
    );

    await page.getByTestId("graphql-example").selectOption("A loan quote");
    await expect(page.getByTestId("graphql-query")).toContainText("loanQuote");
    await expect(page.getByTestId("graphql-variables")).toHaveValue("");
  });

  test("a query with variables runs against the signed-in customer", async ({
    page,
  }) => {
    await signUpCustomer(page.request, "Variable Customer");
    const [checking] = (await moneyAccounts(page.request)).accounts;

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

  test("variables that aren't JSON are caught before anything is sent", async ({
    page,
  }) => {
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
    await page.getByTestId("graphql-variables").fill("{ not json");
    await page.getByTestId("graphql-run").click();

    await expect(page.getByTestId("graphql-variables-error")).toHaveText(
      "The variables aren't valid JSON.",
    );
    await expect(page.getByTestId("graphql-response")).toHaveCount(0);
    expect(sent).toBe(0);
  });

  test("an error from the server is shown, not hidden", async ({ page }) => {
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

  test("the schema panel lists the real Query and Mutation fields", async ({
    page,
  }) => {
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

  test("the Developers group links to the explorer and the REST docs", async ({
    page,
  }) => {
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
