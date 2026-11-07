// axe-core's Playwright runner, which checks a page for accessibility problems.
import AxeBuilder from "@axe-core/playwright";
// Playwright's test tools, with the [RESULT] block printed after every test.
import {
  expect,
  expected,
  fact,
  test,
} from "../../../framework/fixtures/resultBlock";
// Signs up a fresh customer.
import { signUpCustomer } from "../../../framework/helpers/bank";
// Arms a planted bug for one runKey.
import { armFlags } from "../../../framework/helpers/flags";

// Accessibility coverage scoped to the create-user dialog (the surface whose
// labeling we control). Clean by default; armed usersA11yBug introduces a
// missing-label violation a correct test should flag (REPORT).
test.describe("React a11y (axe)", () => {
  // The create-user dialog passes axe with nothing armed.
  test("create-user dialog has no axe violations by default", async ({
    page,
  }) => {
    expected("no axe violations inside the create-user dialog");
    // Open the dialog.
    await page.goto("/app/users?runKey=a11y-clean");
    await page.getByTestId("users-create-open").click();
    await expect(page.getByTestId("users-create-dialog")).toBeVisible();

    // Scan only the dialog.
    const results = await new AxeBuilder({ page })
      .include('[data-testid="users-create-dialog"]')
      .analyze();

    fact("violations", results.violations.length);
    expect(results.violations).toEqual([]);
  });

  // With the bug armed, a field in the dialog loses its label and axe says so.
  test("REPORT: armed usersA11yBug introduces a missing-label violation", async ({
    page,
    request,
  }) => {
    expected(
      "with usersA11yBug armed: axe finds a 'label' violation in the dialog",
    );
    // Arm the bug and open the dialog.
    await armFlags(request, "a11y-bug", { usersA11yBug: true });
    await page.goto("/app/users?runKey=a11y-bug");
    await page.getByTestId("users-create-open").click();
    await expect(page.getByTestId("users-create-dialog")).toBeVisible();

    // Scan only the dialog.
    const results = await new AxeBuilder({ page })
      .include('[data-testid="users-create-dialog"]')
      .analyze();

    // One of the violations is the missing label.
    const labelViolation = results.violations.find((v) => v.id === "label");
    fact("violations", results.violations.length);
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

  // The whole markets page passes axe.
  test("the markets page has no axe violations", async ({ page }) => {
    expected("no axe violations on /app/markets");
    await page.goto("/app/markets?runKey=a11y-markets");
    await expect(page.getByTestId("market-list")).toBeVisible();

    const results = await new AxeBuilder({ page }).analyze();
    fact("violations", results.violations.length);
    expect(results.violations).toEqual([]);
  });

  // The whole wallet page passes axe for a signed-in customer.
  test("the wallet has no axe violations", async ({ page }) => {
    expected("no axe violations on /app/wallet");
    // page.request shares the page's cookies, so the browser is signed in too.
    await signUpCustomer(page.request, "A11y Wallet");
    await page.goto("/app/wallet");
    await expect(page.getByTestId("wallet-addresses")).toBeVisible();

    const results = await new AxeBuilder({ page }).analyze();
    fact("violations", results.violations.length);
    expect(results.violations).toEqual([]);
  });

  // The whole practice page passes axe.
  test("the practice page has no axe violations", async ({ page }) => {
    expected("no axe violations on /app/practice");
    await page.goto("/app/practice");
    await expect(page.getByTestId("practice-state")).toBeVisible();

    const results = await new AxeBuilder({ page }).analyze();
    fact("violations", results.violations.length);
    expect(results.violations).toEqual([]);
  });

  // The whole Bitcoin page, chart included, passes axe.
  test("a coin page has no axe violations", async ({ page }) => {
    expected("no axe violations on /app/markets/BTC");
    await page.goto("/app/markets/BTC?runKey=a11y-coin");
    await expect(page.getByTestId("coin-chart")).toBeVisible();

    const results = await new AxeBuilder({ page }).analyze();
    fact("violations", results.violations.length);
    expect(results.violations).toEqual([]);
  });
});
