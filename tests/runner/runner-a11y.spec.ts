import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import {
  expectOutcome,
  openRunTab,
  runButton,
  startRun,
  uniqueReason,
} from "./_runner";

// The runner is read all day by people who are not its authors. axe over the
// three screens a colleague uses: the picker, the question, the run page.

async function seriousViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();

  return results.violations.filter(
    (violation) =>
      violation.impact === "serious" || violation.impact === "critical",
  );
}

test.describe("Accessibility", () => {
  test("the picker and the question", async ({ page }) => {
    await openRunTab(page);
    expect(await seriousViolations(page)).toEqual([]);

    await runButton(page, "group-sanity").click();
    await expect(page.getByTestId("run-confirm")).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);
  });

  test("the run page", async ({ page }) => {
    await startRun(page, "group-scenarios", uniqueReason("axe"));
    await expectOutcome(page, "Passed");
    expect(await seriousViolations(page)).toEqual([]);
  });
});
