// The bank's core endpoints answer in the shape they promise: its health
// checks, the back office's orders, users and products, and its validation
// errors. (Until 2026-11-20 this checked the original demo site's API.)

/** Playwright's test tools with the framework's page objects and the [RESULT] block. */
import {
  expect,
  expected,
  fact,
  test,
} from "../../../framework/fixtures/appTest";
/** A back-office user the API accepts, and a transfer whose amount is text. */
import {
  textAmountTransfer,
  validBackOfficeUser,
} from "../../../framework/data/scenarioPayloads";
/** A fresh customer and their accounts. */
import { moneyAccounts, signUpCustomer } from "../../../framework/helpers/bank";

test("api contract governance covers the core local endpoints", async ({
  request,
}) => {
  expected(
    "live 200 'live'; ready 200 'ready' with every migration applied; 3 stable orders with their fields; a new user 201 with a USR- id; the products with numeric prices; a product 200 with its fields; a text amount 400 VALIDATION_FAILED with errors.amountCents",
  );

  await test.step("the health checks", async () => {
    const live = await request.get("/api/bank/health/live");
    expect(live.status(), "live answers 200").toBe(200);
    expect(await live.json(), "and says live").toEqual({ status: "live" });
    const ready = await request.get("/api/bank/health/ready");
    const readyBody = await ready.json();
    fact("migrations", readyBody.migrations);
    expect(ready.status(), "ready answers 200").toBe(200);
    expect(readyBody.status, "and says ready").toBe("ready");
    expect(readyBody.migrations.applied, "with every migration applied").toBe(
      readyBody.migrations.expected,
    );
  });

  await test.step("the orders, in stable mode", async () => {
    const response = await request.get(
      "/api/orders?mode=stable&runKey=contracts",
    );
    const body = await response.json();
    expect(response.status(), "orders answer 200").toBe(200);
    expect(body.mode, "in the mode asked for").toBe("stable");
    expect(body.orders, "three orders").toHaveLength(3);
    expect(body.orders[0], "each with its fields").toEqual(
      expect.objectContaining({
        customer: expect.any(String),
        id: expect.any(String),
        region: expect.any(String),
        status: expect.any(String),
        total: expect.any(String),
      }),
    );
  });

  await test.step("a new back-office user", async () => {
    const user = validBackOfficeUser();
    const response = await request.post("/api/users", { data: user });
    const body = await response.json();
    fact("user id", body.user?.id);
    expect(response.status(), "created").toBe(201);
    expect(body.user, "echoed back with a USR- id").toEqual(
      expect.objectContaining({
        id: expect.stringMatching(/^USR-/),
        name: user.name,
        role: user.role,
        status: "Active",
      }),
    );
  });

  await test.step("the products, and one product", async () => {
    const list = await request.get("/api/products");
    const listBody = await list.json();
    expect(list.status(), "products answer 200").toBe(200);
    expect(listBody.total, "the total matches the list").toBe(
      listBody.products.length,
    );
    expect(
      listBody.products.every(
        (product: { price: unknown }) => typeof product.price === "number",
      ),
      "every price is a number",
    ).toBe(true);
    const first = listBody.products[0];
    const one = await request.get(`/api/products/${first.id}`);
    expect(one.status(), "one product answers 200").toBe(200);
    expect((await one.json()).product, "with the same fields").toEqual(
      expect.objectContaining({
        category: expect.any(String),
        id: first.id,
        name: first.name,
        price: expect.any(Number),
        status: expect.any(String),
        stock: expect.any(Number),
      }),
    );
  });

  await test.step("a validation error names the field", async () => {
    await signUpCustomer(request, "Contract Customer");
    const { accounts } = await moneyAccounts(request);
    const response = await request.post("/api/bank/transfers", {
      data: textAmountTransfer(accounts[0].id, accounts[1].number),
    });
    const body = await response.json();
    fact("error", body);
    expect(response.status(), "refused").toBe(400);
    expect(body, "with a code, a message and the field").toEqual(
      expect.objectContaining({
        code: "VALIDATION_FAILED",
        message: expect.any(String),
        errors: expect.objectContaining({ amountCents: expect.any(String) }),
      }),
    );
  });
});
