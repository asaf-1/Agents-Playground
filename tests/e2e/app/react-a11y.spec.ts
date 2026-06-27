import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { armFlags } from "./_helpers";

// Accessibility coverage scoped to the create-user dialog (the surface whose
// labeling we control). Clean by default; armed usersA11yBug introduces a
// missing-label violation a correct test should flag (REPORT).
test.describe("React a11y (axe)", () => {
  test("create-user dialog has no axe violations by default", async ({
    page,
  }) => {
    await page.goto("/app/users?runKey=a11y-clean");
    await page.getByTestId("users-create-open").click();
    await expect(page.getByTestId("users-create-dialog")).toBeVisible();

    const results = await new AxeBuilder({ page })
      .include('[data-testid="users-create-dialog"]')
      .analyze();

    expect(results.violations).toEqual([]);
  });

  test("REPORT: armed usersA11yBug introduces a missing-label violation", async ({
    page,
    request,
  }) => {
    await armFlags(request, "a11y-bug", { usersA11yBug: true });
    await page.goto("/app/users?runKey=a11y-bug");
    await page.getByTestId("users-create-open").click();
    await expect(page.getByTestId("users-create-dialog")).toBeVisible();

    const results = await new AxeBuilder({ page })
      .include('[data-testid="users-create-dialog"]')
      .analyze();

    const labelViolation = results.violations.find((v) => v.id === "label");
    expect(labelViolation, "expected an axe 'label' violation").toBeTruthy();
  });
});
