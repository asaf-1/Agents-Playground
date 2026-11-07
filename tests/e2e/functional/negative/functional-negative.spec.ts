/** The framework's page checker: is the product page whole and readable? */
import { PageValidationAgent } from "../../../../framework/agents/validation/PageValidationAgent";
/** Playwright's test tools with the framework's page objects and the [RESULT] block. */
import {
  expect,
  expected,
  fact,
  test,
} from "../../../../framework/fixtures/appTest";
/** A user with missing fields, and one with a phone number of the wrong type. */
import {
  invalidCreateUserPayload,
  typeMismatchCreateUserPayload,
} from "../../../../framework/data/scenarioPayloads";

/**
 * The old "Sign Up" button is gone, and the broken product page fails the
 * page checker for its price and its overlapping parts.
 */
test("functional negative coverage surfaces stale selectors and broken rendering", async ({
  homePage,
  page,
  productPage,
}) => {
  expected(
    "no 'Sign Up' button; the broken product page is not valid, naming a non-finite number and a visual overlap",
  );
  // The landing page no longer has a "Sign Up" button.
  await homePage.goto();
  await expect(page.locator('button:has-text("Sign Up")')).toHaveCount(0);

  // The product page in its broken state fails the checker.
  await productPage.goto("sku-123", "broken");
  await productPage.expectStateText("Broken state");
  const brokenValidation = await new PageValidationAgent(
    page,
  ).validateProductPage();
  fact("issues", brokenValidation.issues);

  // Not valid, for both reasons.
  expect(brokenValidation.valid).toBeFalsy();
  expect(
    brokenValidation.issues.some((issue) =>
      issue.includes("not a finite number"),
    ),
  ).toBeTruthy();
  expect(
    brokenValidation.issues.some((issue) =>
      issue.includes("Visual overlap detected"),
    ),
  ).toBeTruthy();
});

/**
 * A user with bad fields is refused (400), a wrong type is a server error
 * (500), and the flaky dashboard shows its failure.
 */
test("functional negative coverage surfaces validation and retryable service failures", async ({
  dashboardPage,
  page,
  request,
}) => {
  expected(
    "invalid user 400 naming last_name and email; type mismatch 500 on phone_number (string); flaky dashboard 'Waiting for recovery.', 'Request failed', 0 rows",
  );
  // Missing and malformed fields.
  const invalidResponse = await request.post("/api/create-user", {
    data: invalidCreateUserPayload,
  });
  const invalidPayload = await invalidResponse.json();
  expect(invalidResponse.status()).toBe(400);
  expect(invalidPayload.errors.last_name).toContain("required");
  expect(invalidPayload.errors.email).toContain("valid");

  // A phone number sent as a string.
  const typeMismatchResponse = await request.post("/api/create-user", {
    data: typeMismatchCreateUserPayload,
  });
  const typeMismatchPayload = await typeMismatchResponse.json();
  expect(typeMismatchResponse.status()).toBe(500);
  expect(typeMismatchPayload.problem.field).toBe("phone_number");
  expect(typeMismatchPayload.problem.receivedType).toBe("string");

  // The dashboard in flaky mode shows the failure and no rows.
  await dashboardPage.goto("flaky");
  await expect(dashboardPage.ordersStatus).toContainText(
    "Waiting for recovery.",
  );
  await expect(dashboardPage.ordersError).toContainText("Request failed");
  await expect(dashboardPage.ordersRows).toHaveCount(0);
});
