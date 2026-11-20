// The bank's unhappy paths, as functional checks: a renamed control and a
// broken product page are caught, bad input is refused with the field named,
// and an orders outage shows an error with Retry. (Until 2026-11-20 this
// checked the original demo site.)

/** The framework's page checker: is the product page whole and readable? */
import { PageValidationAgent } from "../../../../framework/agents/validation/PageValidationAgent";
/** Playwright's test tools with the framework's page objects and the [RESULT] block. */
import {
  expect,
  expected,
  fact,
  test,
} from "../../../../framework/fixtures/appTest";
/** A back-office user with no name, and a transfer whose amount is text. */
import {
  invalidBackOfficeUser,
  textAmountTransfer,
} from "../../../../framework/data/scenarioPayloads";
/** A fresh customer, their accounts, and a runKey of the test's own. */
import {
  moneyAccounts,
  signUpCustomer,
  uniqueRunKey,
} from "../../../../framework/helpers/bank";

// The planted HEAL fault and the AI agents' broken product state, each armed
// for this test only.
test("functional negative coverage surfaces a renamed control and broken rendering", async ({
  ordersPage,
  page,
  productPage,
  request,
}) => {
  expected(
    "with ordersRefreshLabel armed, no 'Refresh' button by name (the test id stays); with productRenderBroken armed, the product page is not valid, naming a non-finite number and a visual overlap",
  );
  const runKey = uniqueRunKey("functional-negative");
  fact("runKey", runKey);
  await request.post("/api/test/flags", {
    data: {
      runKey,
      flags: { ordersRefreshLabel: "Reload", productRenderBroken: true },
    },
  });

  try {
    await test.step("the Refresh button is renamed Reload", async () => {
      await ordersPage.goto(runKey);
      await expect(
        page.getByRole("button", { name: "Refresh" }),
        "no button by the old name",
      ).toHaveCount(0);
      await expect(
        ordersPage.refreshButton,
        "the same button by its test id, now Reload",
      ).toHaveText("Reload");
    });

    await test.step("the broken product page fails the checker", async () => {
      const catalogue = await (await request.get("/api/products")).json();
      await productPage.goto(catalogue.products[0].id, runKey);
      const validation = await new PageValidationAgent(
        page,
      ).validateProductPage();
      fact("issues", validation.issues);
      expect(validation.valid, "the broken page is not valid").toBe(false);
      expect(
        validation.issues.some((issue) =>
          issue.includes("not a finite number"),
        ),
        "it names the price",
      ).toBe(true);
      expect(
        validation.issues.some((issue) =>
          issue.includes("Visual overlap detected"),
        ),
        "and the overlap",
      ).toBe(true);
    });
  } finally {
    await request.delete(
      `/api/test/flags?runKey=${encodeURIComponent(runKey)}`,
    );
  }
});

// Bad input refused with the field named, and an outage that outlasts the
// page's own retry.
test("functional negative coverage surfaces validation and retryable service failures", async ({
  ordersPage,
  page,
}) => {
  expected(
    "a user with no name 400 'name is required.'; a transfer with the amount as text 400 VALIDATION_FAILED naming amountCents; two 503s on /api/orders show the error with Retry and 0 rows",
  );

  await test.step("a back-office user with no name is refused", async () => {
    const response = await page.request.post("/api/users", {
      data: invalidBackOfficeUser,
    });
    expect(response.status(), "refused").toBe(400);
    expect((await response.json()).message, "and says why").toBe(
      "name is required.",
    );
  });

  await test.step("a transfer with the amount as text is refused", async () => {
    // A customer of the test's own, from Checking to their own Savings.
    await signUpCustomer(page.request, "Negative Customer");
    const { accounts } = await moneyAccounts(page.request);
    const response = await page.request.post("/api/bank/transfers", {
      data: textAmountTransfer(accounts[0].id, accounts[1].number),
    });
    const body = await response.json();
    fact("errors", body.errors);
    expect(response.status(), "refused").toBe(400);
    expect(body.code, "as a validation failure").toBe("VALIDATION_FAILED");
    expect(body.errors?.amountCents, "naming the amount").toBeTruthy();
  });

  await test.step("an outage longer than the page's retry shows the error", async () => {
    // The first two answers fail; the page retries once by itself.
    let failures = 0;
    await page.route("**/api/orders?**", (route) => {
      if (failures < 2) {
        failures += 1;
        return route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ message: "Orders service unavailable." }),
        });
      }
      return route.continue();
    });
    await ordersPage.goto(uniqueRunKey("functional-outage"));
    await expect(ordersPage.error, "the error shows").toBeVisible();
    await expect(ordersPage.retryButton, "with Retry").toBeVisible();
    await expect(ordersPage.rows, "and no rows").toHaveCount(0);
    fact("failed answers", failures);
  });
});
