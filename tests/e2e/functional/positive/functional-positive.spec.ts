// The bank's happy path, as a functional check: the bank is ready, the back
// office adds a user, the orders load, and a product page passes the page
// checker. (Until 2026-11-20 this checked the original demo site.)

/** The framework's page checker: is the product page whole and readable? */
import { PageValidationAgent } from "../../../../framework/agents/validation/PageValidationAgent";
/** Playwright's test tools with the framework's page objects and the [RESULT] block. */
import {
  expect,
  expected,
  fact,
  test,
} from "../../../../framework/fixtures/appTest";
/** A back-office user the API accepts. */
import { validBackOfficeUser } from "../../../../framework/data/scenarioPayloads";

test("functional positive coverage validates the ready bank, a new back-office user, the orders, and a product page", async ({
  ordersPage,
  page,
  productPage,
  request,
}) => {
  expected(
    "ready 200; POST /api/users 201 with the same name and role, as Active; 3 orders on /app/orders; the first product's page valid",
  );

  await test.step("the bank is ready", async () => {
    const ready = await request.get("/api/bank/health/ready");
    expect(ready.status(), "the ready check answers 200").toBe(200);
  });

  await test.step("the back office adds a user", async () => {
    const user = validBackOfficeUser();
    fact("user", user.name);
    const response = await request.post("/api/users", { data: user });
    expect(response.status(), "a new user is created").toBe(201);
    const body = await response.json();
    expect(body.user.name, "with the name sent").toBe(user.name);
    expect(body.user.role, "and the role sent").toBe(user.role);
    expect(body.user.status, "and active").toBe("Active");
  });

  await test.step("the orders load", async () => {
    await ordersPage.goto("functional-orders");
    await ordersPage.waitForOrdersLoaded(3);
    await ordersPage.expectLoaded();
  });

  await test.step("a product page passes the page checker", async () => {
    const catalogue = await (await request.get("/api/products")).json();
    fact("product", catalogue.products[0].id);
    await productPage.goto(catalogue.products[0].id);
    const validation = await new PageValidationAgent(
      page,
    ).validateProductPage();
    fact("valid", validation.valid);
    expect(validation.valid, validation.explanation).toBe(true);
  });
});
