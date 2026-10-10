import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { signUpCustomer } from "./_bank";
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

  // The exchange (phase 3a). Both pages are colour-heavy -- green and red
  // prices on a dark ground, charts, a scrolling ticker -- so contrast is the
  // thing most likely to slip here, and axe measures it as the page runs.
  //
  // These scan the WHOLE page, not just <main>: the shell's old "region"
  // violation is fixed (the practice-site banner is a labelled landmark now),
  // so nothing is left to scope around. Keeping them whole-page means the
  // shell is checked on every run instead of only the page content.
  test("the markets page has no axe violations", async ({ page }) => {
    await page.goto("/app/markets?runKey=a11y-markets");
    await expect(page.getByTestId("market-list")).toBeVisible();

    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });

  test("the wallet has no axe violations", async ({ page }) => {
    // page.request shares the page's cookies, so the browser is signed in too.
    await signUpCustomer(page.request, "A11y Wallet");
    await page.goto("/app/wallet");
    await expect(page.getByTestId("wallet-addresses")).toBeVisible();

    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });

  test("the practice page has no axe violations", async ({ page }) => {
    await page.goto("/app/practice");
    await expect(page.getByTestId("practice-state")).toBeVisible();

    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });

  test("a coin page has no axe violations", async ({ page }) => {
    await page.goto("/app/markets/BTC?runKey=a11y-coin");
    await expect(page.getByTestId("coin-chart")).toBeVisible();

    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });
});
