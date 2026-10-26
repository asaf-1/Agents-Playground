import { expect, test } from "@playwright/test";
import {
  expectOutcome,
  openRunTab,
  runButton,
  startRun,
  uniqueReason,
} from "./_runner";

// Starting a run and watching it: the question before it starts, the run page
// as it goes, what failed, and cancelling.

test.describe("Starting a run", () => {
  test("asks first, and the question can be declined", async ({ page }) => {
    await openRunTab(page);
    await runButton(page, "group-sanity").click();

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

  test("shows the run as it goes, then that every test passed", async ({
    page,
  }) => {
    const reason = uniqueReason("passing");
    await startRun(page, "group-sanity", reason);

    await expect(page.getByTestId("run-view-title")).toHaveText("Sanity smoke");
    await expectOutcome(page, /Running|Queued/);
    await expect(page.getByTestId("rail-step")).toHaveCount(3);
    await expect(page.getByTestId("run-view-cancel")).toBeVisible();

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

  test("names the tests that failed, in their own words", async ({ page }) => {
    await startRun(page, "group-sanity-all", uniqueReason("[stub:fail]"));

    await expectOutcome(page, "Failed");
    await expect(
      page.getByTestId("rail-step").filter({ hasText: "Tests" }),
    ).toHaveAttribute("data-state", "bad");

    await expect(page.getByTestId("run-view-failure")).toHaveCount(2);
    const first = page.getByTestId("run-view-failure").first();
    await expect(first).toContainText("check 1");
    await expect(first).toContainText("tests/e2e/sanity/");
    await expect(first).toContainText("Expected: 200");
    await expect(first).toContainText("Received: 500");
    await expect(page.getByTestId("run-view-counts")).toContainText("2");
    await expect(page.getByTestId("run-view-counts")).toContainText("failed");
  });

  test("can be cancelled while it runs", async ({ page }) => {
    await startRun(page, "group-regression", uniqueReason("cancel me"));

    await expectOutcome(page, /Running|Queued/);
    await page.getByTestId("run-view-cancel").click();

    await expectOutcome(page, "Cancelled");
    await expect(page.getByTestId("run-view-cancel")).toBeHidden();
    await expect(page.getByTestId("run-view-outcome-note")).toContainText(
      "cancelled",
    );
  });

  test("Run again asks the same question", async ({ page }) => {
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

  test("a unit-test run passes without a results file, and says so", async ({
    page,
  }) => {
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
