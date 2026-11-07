// axe-core's Playwright runner, which checks a page for accessibility problems.
import AxeBuilder from "@axe-core/playwright";
// The type of a browser page.
import { type Page } from "@playwright/test";
// Playwright's test tools, with the [RESULT] block printed after every test.
import { expect, expected, test } from "../../framework/fixtures/resultBlock";
// The runner helpers: wait for an outcome, open the Run tab, a flow's button,
// start a run, a unique reason.
import {
  expectOutcome,
  openRunTab,
  runButton,
  startRun,
  uniqueReason,
} from "../../framework/helpers/runner";

// The runner is read all day by people who are not its authors. axe over the
// three screens a colleague uses: the picker, the question, the run page.

// The serious and critical WCAG A/AA problems axe finds on the page.
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
  // The Run tab, and the question asked before a run starts.
  test("the picker and the question", async ({ page }) => {
    expected("no serious violations on the picker, nor on the run question");
    await openRunTab(page);
    expect(await seriousViolations(page)).toEqual([]);

    // Press Run on the sanity group to open the question.
    await runButton(page, "group-sanity").click();
    await expect(page.getByTestId("run-confirm")).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);
  });

  // The page of a finished run.
  test("the run page", async ({ page }) => {
    expected("the run passes, and its page has no serious violations");
    await startRun(page, "group-scenarios", uniqueReason("axe"));
    await expectOutcome(page, "Passed");
    expect(await seriousViolations(page)).toEqual([]);
  });
});
