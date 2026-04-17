import { PageValidationAgent } from "../../../../framework/agents/validation/PageValidationAgent";
import { expect, test } from "../../../../framework/fixtures/baseTest";
import { validCreateUserPayload } from "../../../../framework/data/scenarioPayloads";

test("functional positive coverage validates healthy API, stable dashboard, and valid product rendering", async ({
  dashboardPage,
  page,
  productPage,
  request
}) => {
  const healthResponse = await request.get("/api/health");
  const healthPayload = await healthResponse.json();
  expect(healthResponse.status()).toBe(200);
  expect(healthPayload.status).toBe("ok");

  const createUserResponse = await request.post("/api/create-user", {
    data: validCreateUserPayload
  });
  const createUserPayload = await createUserResponse.json();

  expect(createUserResponse.status()).toBe(201);
  expect(createUserPayload.user.email).toBe(validCreateUserPayload.email);
  expect(createUserPayload.user.phone_number).toBe(validCreateUserPayload.phone_number);

  await dashboardPage.goto("stable");
  await dashboardPage.expectLoaded();
  await dashboardPage.waitForOrdersLoaded(3);
  await expect(dashboardPage.ordersStatus).toContainText("Loaded 3 orders");

  await productPage.goto("sku-123", "valid");
  await productPage.expectStateText("Valid state");
  await productPage.expectLoaded();
  const validation = await new PageValidationAgent(page).validateProductPage();

  expect(validation.valid).toBeTruthy();
});
