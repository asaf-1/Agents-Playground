/** Playwright's test tools with the framework's page objects and the [RESULT] block. */
import {
  expect,
  expected,
  fact,
  test,
} from "../../../framework/fixtures/appTest";
/** A valid user, and one whose phone number is the wrong type. */
import {
  typeMismatchCreateUserPayload,
  validCreateUserPayload,
} from "../../../framework/data/scenarioPayloads";

/**
 * The classic site's core endpoints answer in the shape they promise: health,
 * orders, create-user (good and bad), and a product.
 */
test("api contract governance covers the core local endpoints", async ({
  request,
}) => {
  expected(
    "health 200 ok on 4173; 3 stable orders with their fields; create-user 201 with a USR- id; type mismatch 500 problem on phone_number; sku-123 200 with its product fields",
  );
  // Health: the service, its port, and ok.
  const healthResponse = await request.get("/api/health");
  const healthPayload = await healthResponse.json();
  expect(healthResponse.status()).toBe(200);
  expect(healthPayload).toEqual(
    expect.objectContaining({
      port: 4173,
      service: "Reliable Agentic QA Demo",
      status: "ok",
    }),
  );

  // Orders in stable mode: three, each with its fields.
  const ordersResponse = await request.get("/api/orders?mode=stable");
  const ordersPayload = await ordersResponse.json();
  expect(ordersResponse.status()).toBe(200);
  expect(ordersPayload.mode).toBe("stable");
  expect(Array.isArray(ordersPayload.orders)).toBeTruthy();
  expect(ordersPayload.orders).toHaveLength(3);
  expect(ordersPayload.orders[0]).toEqual(
    expect.objectContaining({
      customer: expect.any(String),
      id: expect.any(String),
      region: expect.any(String),
      status: expect.any(String),
      total: expect.any(String),
    }),
  );

  // A valid user is created and echoed back with a USR- id.
  const createUserResponse = await request.post("/api/create-user", {
    data: validCreateUserPayload,
  });
  const createUserPayload = await createUserResponse.json();
  fact("user id", createUserPayload.user?.id);
  expect(createUserResponse.status()).toBe(201);
  expect(createUserPayload.user).toEqual(
    expect.objectContaining({
      email: validCreateUserPayload.email,
      first_name: validCreateUserPayload.first_name,
      id: expect.stringMatching(/^USR-/),
      last_name: validCreateUserPayload.last_name,
      phone_number: validCreateUserPayload.phone_number,
    }),
  );

  // A phone number sent as a string is a 500 with a problem description.
  const typeMismatchResponse = await request.post("/api/create-user", {
    data: typeMismatchCreateUserPayload,
  });
  const typeMismatchPayload = await typeMismatchResponse.json();
  expect(typeMismatchResponse.status()).toBe(500);
  expect(typeMismatchPayload).toEqual(
    expect.objectContaining({
      detail: expect.any(String),
      problem: expect.objectContaining({
        expectedType: "integer",
        field: "phone_number",
        receivedType: "string",
      }),
      status: 500,
      title: "Phone number type mismatch",
    }),
  );

  // The valid product page's data.
  const productResponse = await request.get("/api/product/sku-123?state=valid");
  const productPayload = await productResponse.json();
  expect(productResponse.status()).toBe(200);
  expect(productPayload).toEqual(
    expect.objectContaining({
      product: expect.objectContaining({
        currency: "USD",
        id: "sku-123",
        layout: expect.objectContaining({
          overlap: false,
        }),
        name: "Agentic QA Console",
        notes: expect.any(Array),
        price: expect.any(Number),
        status: "Ready to validate",
      }),
      state: "valid",
    }),
  );

  // Its first note has a label and a detail.
  expect(productPayload.product.notes[0]).toEqual(
    expect.objectContaining({
      detail: expect.any(String),
      label: expect.any(String),
    }),
  );
});
