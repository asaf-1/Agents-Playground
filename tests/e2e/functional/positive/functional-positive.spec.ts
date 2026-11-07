/** The framework's page checker: is the product page whole and readable? */
import { PageValidationAgent } from "../../../../framework/agents/validation/PageValidationAgent";
/** Playwright's test tools with the framework's page objects and the [RESULT] block. */
import {
  expect,
  expected,
  fact,
  test,
} from "../../../../framework/fixtures/appTest";
/** A valid user for the create-user API. */
import { validCreateUserPayload } from "../../../../framework/data/scenarioPayloads";

/**
 * The happy path of the classic site: the API is healthy, a valid user is
 * created, the dashboard loads its orders, and the product page passes the
 * page checker.
 */
test("functional positive coverage validates healthy API, stable dashboard, and valid product rendering", async ({
  dashboardPage,
  page,
  productPage,
  request,
}) => {
  expected(
    "health 200 ok; create-user 201 with the same email and phone; 'Loaded 3 orders'; the product page validates",
  );
  // The health endpoint.
  const healthResponse = await request.get("/api/health");
  const healthPayload = await healthResponse.json();
  expect(healthResponse.status()).toBe(200);
  expect(healthPayload.status).toBe("ok");

  // Create a valid user: the answer echoes its email and phone.
  const createUserResponse = await request.post("/api/create-user", {
    data: validCreateUserPayload,
  });
  const createUserPayload = await createUserResponse.json();
  fact("user email", validCreateUserPayload.email);

  expect(createUserResponse.status()).toBe(201);
  expect(createUserPayload.user.email).toBe(validCreateUserPayload.email);
  expect(createUserPayload.user.phone_number).toBe(
    validCreateUserPayload.phone_number,
  );

  // The dashboard in stable mode loads three orders.
  await dashboardPage.goto("stable");
  await dashboardPage.expectLoaded();
  await dashboardPage.waitForOrdersLoaded(3);
  await expect(dashboardPage.ordersStatus).toContainText("Loaded 3 orders");

  // A valid product page passes the page checker.
  await productPage.goto("sku-123", "valid");
  await productPage.expectStateText("Valid state");
  await productPage.expectLoaded();
  const validation = await new PageValidationAgent(page).validateProductPage();
  fact("valid", validation.valid);

  expect(validation.valid).toBeTruthy();
});
