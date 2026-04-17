import { PageValidationAgent } from "../../../../framework/agents/validation/PageValidationAgent";
import { expect, test } from "../../../../framework/fixtures/baseTest";
import {
  invalidCreateUserPayload,
  typeMismatchCreateUserPayload
} from "../../../../framework/data/scenarioPayloads";

test("functional negative coverage surfaces stale selectors and broken rendering", async ({
  homePage,
  page,
  productPage
}) => {
  await homePage.goto();
  await expect(page.locator('button:has-text("Sign Up")')).toHaveCount(0);

  await productPage.goto("sku-123", "broken");
  await productPage.expectStateText("Broken state");
  const brokenValidation = await new PageValidationAgent(page).validateProductPage();

  expect(brokenValidation.valid).toBeFalsy();
  expect(brokenValidation.issues.some((issue) => issue.includes("not a finite number"))).toBeTruthy();
  expect(brokenValidation.issues.some((issue) => issue.includes("Visual overlap detected"))).toBeTruthy();
});

test("functional negative coverage surfaces validation and retryable service failures", async ({
  dashboardPage,
  page,
  request
}) => {
  const invalidResponse = await request.post("/api/create-user", {
    data: invalidCreateUserPayload
  });
  const invalidPayload = await invalidResponse.json();
  expect(invalidResponse.status()).toBe(400);
  expect(invalidPayload.errors.last_name).toContain("required");
  expect(invalidPayload.errors.email).toContain("valid");

  const typeMismatchResponse = await request.post("/api/create-user", {
    data: typeMismatchCreateUserPayload
  });
  const typeMismatchPayload = await typeMismatchResponse.json();
  expect(typeMismatchResponse.status()).toBe(500);
  expect(typeMismatchPayload.problem.field).toBe("phone_number");
  expect(typeMismatchPayload.problem.receivedType).toBe("string");

  await dashboardPage.goto("flaky");
  await expect(dashboardPage.ordersStatus).toContainText("Waiting for recovery.");
  await expect(dashboardPage.ordersError).toContainText("Request failed");
  await expect(dashboardPage.ordersRows).toHaveCount(0);
});
