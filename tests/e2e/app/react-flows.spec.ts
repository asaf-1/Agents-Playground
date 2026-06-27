import { expect, test } from "@playwright/test";

// Phase 1 smoke coverage for the React feature surface: TanStack Query data
// loading (Orders), and the Radix dialog + React Hook Form / Zod client-side
// validation (Users). Intentionally non-mutating — the real create/optimistic
// mutation flow is covered with isolation in later phases — so these stay safe
// under the fullyParallel suite that shares one app server.
test.describe("React Orders page (TanStack Query)", () => {
  test("loads seeded orders from the live API in stable mode", async ({
    page,
  }) => {
    await page.goto("/app/orders");

    await expect(page.getByTestId("orders-table")).toBeVisible();
    const table = page.getByTestId("orders-table");
    await expect(table).toContainText("ORD-1001");
    await expect(table).toContainText("ORD-1002");
    await expect(table).toContainText("ORD-1003");

    // Mode controls drive the existing flaky/slow endpoint behavior.
    await expect(page.getByTestId("orders-mode-flaky")).toBeVisible();
    await expect(page.getByTestId("orders-mode-stable")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});

test.describe("React Users page (Radix dialog + RHF/Zod)", () => {
  test("lists users and validates the create form before submit", async ({
    page,
  }) => {
    await page.goto("/app/users");

    await expect(page.getByTestId("users-table")).toBeVisible();

    // Open the Radix dialog (rendered in a portal).
    await page.getByTestId("users-create-open").click();
    await expect(page.getByTestId("users-create-dialog")).toBeVisible();

    // Submit empty -> Zod validation blocks the request and shows the error.
    await page.getByTestId("users-create-submit").click();
    await expect(page.getByTestId("users-create-name-error")).toHaveText(
      "Name must be at least 2 characters.",
    );

    // Cancel closes the dialog without mutating shared server state.
    await page.getByTestId("users-create-cancel").click();
    await expect(page.getByTestId("users-create-dialog")).toBeHidden();
  });
});
