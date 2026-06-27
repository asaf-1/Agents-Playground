import { expect, test } from "../../../framework/fixtures/baseTest";
import {
  typeMismatchCreateUserPayload,
  validCreateUserPayload,
} from "../../../framework/data/scenarioPayloads";

test("api contract governance covers the core local endpoints", async ({
  request,
}) => {
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

  const createUserResponse = await request.post("/api/create-user", {
    data: validCreateUserPayload,
  });
  const createUserPayload = await createUserResponse.json();
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

  expect(productPayload.product.notes[0]).toEqual(
    expect.objectContaining({
      detail: expect.any(String),
      label: expect.any(String),
    }),
  );
});
