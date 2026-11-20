// Delete on /app/users (added 2026-11-20, when the RBAC demo moved from the
// original demo site to the bank): a back-office Admin sees it in a row's ⋯
// menu and can delete a user they created; a seeded user is refused with the
// server's reason; an Editor and a guest never see it. The server makes the
// same check itself (the RBAC scenario proves that, and the planted rbacBug).
// Each test deletes only a user it created, so the shared list stays as it
// was for everyone else.

/** Playwright's test tools, with the [RESULT] block printed after every test. */
import {
  expect,
  expected,
  fact,
  test,
} from "../../../framework/fixtures/resultBlock";
/** A back-office user the API accepts, with a name of its own. */
import { validBackOfficeUser } from "../../../framework/data/scenarioPayloads";

// Signs the page's browser in to the back office (the cookie is shared with
// page.request).
async function signInBackOffice(
  page: import("@playwright/test").Page,
  email: string,
) {
  const response = await page.request.post("/api/login", {
    data: { email, password: "demo1234" },
  });
  expect(response.status(), `${email} signs in`).toBe(200);
  fact("signed in", email);
}

test.describe("Users: Delete", () => {
  // An Admin deletes a user they created, from the row's menu.
  test("a back-office Admin deletes a user they created from the row menu", async ({
    page,
  }) => {
    expected(
      "the new user's menu has Delete; after Delete the row is gone and stays gone after a reload",
    );
    await signInBackOffice(page, "alice@demo.local");
    // A user of the test's own, created as the Admin.
    const created = await page.request.post("/api/users", {
      data: validBackOfficeUser(),
    });
    expect(created.status(), "the user is created").toBe(201);
    const id: string = (await created.json()).user.id;
    fact("userId", id);

    await page.goto("/app/users?runKey=users-delete");

    await test.step("Delete is offered and removes the row", async () => {
      await page.getByTestId(`user-actions-${id}`).click();
      await page.getByTestId(`user-delete-${id}`).click();
      await expect(
        page.getByTestId(`user-row-${id}`),
        "the row is gone",
      ).toBeHidden();
    });

    await test.step("the server deleted it too", async () => {
      await page.reload();
      await expect(
        page.getByTestId("user-row-USR-001"),
        "the list loaded",
      ).toBeVisible();
      await expect(
        page.getByTestId(`user-row-${id}`),
        "still gone after a reload",
      ).toHaveCount(0);
    });
  });

  // A seeded user can't be deleted; the page shows why.
  test("deleting a seeded user is refused with the server's reason", async ({
    page,
  }) => {
    expected(
      "Delete on Bob Harbor shows 'Seeded users cannot be deleted.' and his row stays",
    );
    await signInBackOffice(page, "alice@demo.local");
    await page.goto("/app/users?runKey=users-delete-seeded");
    await page.getByTestId("user-actions-USR-002").click();
    await page.getByTestId("user-delete-USR-002").click();
    await expect(
      page.getByTestId("users-delete-error"),
      "the server's reason",
    ).toHaveText("Seeded users cannot be deleted.");
    await expect(
      page.getByTestId("user-row-USR-002"),
      "Bob stays",
    ).toBeVisible();
  });

  // An Editor, and a guest, see View and Edit only.
  test("an Editor and a guest are not offered Delete", async ({ page }) => {
    expected(
      "a guest's menu: View and Edit, no Delete; signed in as the Editor bob@demo.local: the same",
    );

    await test.step("a guest", async () => {
      await page.goto("/app/users?runKey=users-delete-guest");
      await page.getByTestId("user-actions-USR-001").click();
      await expect(page.getByTestId("user-view-USR-001"), "View").toBeVisible();
      await expect(
        page.getByTestId("user-delete-USR-001"),
        "no Delete",
      ).toHaveCount(0);
      await page.keyboard.press("Escape");
    });

    await test.step("the Editor", async () => {
      await signInBackOffice(page, "bob@demo.local");
      await page.goto("/app/users?runKey=users-delete-editor");
      await page.getByTestId("user-actions-USR-001").click();
      await expect(page.getByTestId("user-edit-USR-001"), "Edit").toBeVisible();
      await expect(
        page.getByTestId("user-delete-USR-001"),
        "no Delete",
      ).toHaveCount(0);
    });
  });
});
