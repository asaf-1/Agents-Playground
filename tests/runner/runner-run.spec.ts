// Playwright's test tools, with the [RESULT] block printed after every test.
import {
  expect,
  expected,
  fact,
  test,
} from "../../framework/fixtures/resultBlock";
// The runner helpers: wait for an outcome, open the Run tab, a flow's button,
// start a run, a unique reason.
import {
  expectOutcome,
  openRunTab,
  runButton,
  startRun,
  uniqueReason,
} from "../../framework/helpers/runner";

// Starting a run and watching it: the question before it starts, the run page
// as it goes, what failed, and cancelling.

test.describe("Starting a run", () => {
  // Run asks a question first (what, how many tests, where, which browser,
  // how long); Cancel and Escape both close it and start nothing.
  test("asks first, and the question can be declined", async ({ page }) => {
    expected(
      "'Run Sanity smoke?' with 1 test, Pipeline build, Chromium, minutes; Cancel and Escape each close it with no run page",
    );
    await openRunTab(page);
    await runButton(page, "group-sanity").click();

    // The question and its details.
    const dialog = page.getByTestId("run-confirm");
    await expect(dialog).toBeVisible();
    await expect(page.getByTestId("run-confirm-title")).toHaveText(
      "Run Sanity smoke?",
    );
    await expect(page.getByTestId("run-confirm-tests")).toHaveText("1 test");
    await expect(page.getByTestId("run-confirm-where")).toContainText(
      "Pipeline build",
    );
    await expect(page.getByTestId("run-confirm-browser")).toHaveText(
      "Chromium",
    );
    await expect(page.getByTestId("run-confirm-estimate")).toContainText(
      "minute",
    );

    // Cancel: closed, nothing started.
    await page.getByTestId("run-confirm-cancel").click();
    await expect(dialog).toBeHidden();
    await expect(page.getByTestId("panel-run-view")).toBeHidden();

    // Escape is the other way out, and starts nothing either.
    await runButton(page, "group-sanity").click();
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(page.getByTestId("panel-run-view")).toBeHidden();
  });

  // A run page shows the run going, then that it passed, with its files and logs.
  test("shows the run as it goes, then that every test passed", async ({
    page,
  }) => {
    expected(
      "'Sanity smoke' running with 3 steps and a Cancel button; then Passed, every step ok, 'Every test passed.', the reason, 3 artifacts and 3 log tabs",
    );
    const reason = uniqueReason("passing");
    await startRun(page, "group-sanity", reason);

    // While it runs.
    await expect(page.getByTestId("run-view-title")).toHaveText("Sanity smoke");
    await expectOutcome(page, /Running|Queued/);
    await expect(page.getByTestId("rail-step")).toHaveCount(3);
    await expect(page.getByTestId("run-view-cancel")).toBeVisible();

    // Once it has passed.
    await expectOutcome(page, "Passed");
    for (const step of await page.getByTestId("rail-step").all()) {
      await expect(step).toHaveAttribute("data-state", "ok");
    }
    await expect(page.getByTestId("run-view-cancel")).toBeHidden();
    await expect(page.getByTestId("run-view-counts")).toContainText("passed");
    await expect(page.getByTestId("run-view-results")).toContainText(
      "Every test passed.",
    );
    await expect(page.getByTestId("run-view-facts")).toContainText(reason);

    // The files the run left, including the one this page reads.
    await expect(page.getByTestId("run-view-artifact")).toHaveCount(3);
    await expect(page.getByTestId("run-view-artifacts")).toContainText(
      "remote-test-results",
    );

    // Console output, one job at a time: Plan, the shard, Report.
    await expect(page.getByTestId("log-job-tab")).toHaveCount(3);
    await expect(page.getByTestId("log-output")).toBeVisible();
  });

  // A failed run names each failed test with its file and its own error.
  test("names the tests that failed, in their own words", async ({ page }) => {
    expected(
      "Failed, the Tests step bad; 2 failures, the first 'check 1' in tests/e2e/sanity/ with Expected 200 / Received 500; counts say 2 failed",
    );
    // A reason containing [stub:fail] makes the stub run fail.
    await startRun(page, "group-sanity-all", uniqueReason("[stub:fail]"));

    await expectOutcome(page, "Failed");
    await expect(
      page.getByTestId("rail-step").filter({ hasText: "Tests" }),
    ).toHaveAttribute("data-state", "bad");

    // The failures, in their own words.
    await expect(page.getByTestId("run-view-failure")).toHaveCount(2);
    const first = page.getByTestId("run-view-failure").first();
    await expect(first).toContainText("check 1");
    await expect(first).toContainText("tests/e2e/sanity/");
    await expect(first).toContainText("Expected: 200");
    await expect(first).toContainText("Received: 500");
    await expect(page.getByTestId("run-view-counts")).toContainText("2");
    await expect(page.getByTestId("run-view-counts")).toContainText("failed");
  });

  // A running run can be cancelled from its page.
  test("can be cancelled while it runs", async ({ page }) => {
    expected(
      "running, then Cancelled after Cancel; the button gone and a note saying cancelled",
    );
    await startRun(page, "group-regression", uniqueReason("cancel me"));

    await expectOutcome(page, /Running|Queued/);
    await page.getByTestId("run-view-cancel").click();

    await expectOutcome(page, "Cancelled");
    await expect(page.getByTestId("run-view-cancel")).toBeHidden();
    await expect(page.getByTestId("run-view-outcome-note")).toContainText(
      "cancelled",
    );
  });

  // "Run again" opens the same question for the same flow.
  test("Run again asks the same question", async ({ page }) => {
    expected(
      "after Passed, Run again asks 'Run React app, every screen?'; Cancel closes it",
    );
    await startRun(page, "group-app", uniqueReason("again"));
    await expectOutcome(page, "Passed");

    await page.getByTestId("run-view-rerun").click();
    await expect(page.getByTestId("run-confirm")).toBeVisible();
    await expect(page.getByTestId("run-confirm-title")).toHaveText(
      "Run React app, every screen?",
    );
    await page.getByTestId("run-confirm-cancel").click();
    await expect(page.getByTestId("run-confirm")).toBeHidden();
  });

  // A unit-test run has no results file; the page says it passed and explains the missing file.
  test("a unit-test run passes without a results file, and says so", async ({
    page,
  }) => {
    expected(
      "Passed, 'Every test passed.', and a note that there is no results file",
    );
    await startRun(page, "group-unit", uniqueReason("unit"));
    await expectOutcome(page, "Passed");

    await expect(page.getByTestId("run-view-results")).toContainText(
      "Every test passed.",
    );
    await expect(
      page.getByTestId("run-view-results-unavailable"),
    ).toContainText("no results file");
  });
});
