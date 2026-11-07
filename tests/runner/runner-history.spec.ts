// Playwright's test tools, with the [RESULT] block printed after every test.
import { expect, expected, test } from "../../framework/fixtures/resultBlock";
// The runner helpers: the catalog, wait for an outcome, open the runner,
// start a run, a unique reason.
import {
  catalog,
  expectOutcome,
  openRunner,
  startRun,
  uniqueReason,
} from "../../framework/helpers/runner";

// History and the Dashboard: finding a run again, filtering, and opening it.

test.describe("History", () => {
  // A run just started shows in History under its reason, and opens again.
  test("lists the run just started, newest first, and opens it", async ({
    page,
  }) => {
    expected(
      "one History row with the reason, titled 'Performance and accessibility', flow group-nonfunctional; opening it shows the reason",
    );
    // Start a run with a reason nobody else uses.
    const reason = uniqueReason("find me");
    await startRun(page, "group-nonfunctional", reason);
    await expectOutcome(page, /Running|Queued|Passed/);

    // Back to History.
    await page.getByTestId("run-view-back").click();
    await expect(page.getByTestId("panel-history")).toBeVisible();

    // Other tests start runs too, so the row is found by its own reason.
    const row = page.getByTestId("history-row").filter({
      has: page.getByTestId("history-reason").filter({ hasText: reason }),
    });
    await expect(row).toHaveCount(1);
    await expect(row.getByTestId("history-title")).toHaveText(
      "Performance and accessibility",
    );
    await expect(row.getByTestId("history-flow-id")).toHaveText(
      "group-nonfunctional",
    );

    // Open it again.
    await row.getByTestId("run-view").click();
    await expect(page.getByTestId("panel-run-view")).toBeVisible();
    await expect(page.getByTestId("run-view-facts")).toContainText(reason);
  });

  // History filters by outcome and searches by person, with an empty state.
  test("filters by outcome and by person", async ({ page }) => {
    expected(
      "'passed' shows only passed rows; 'cancelled' only cancelled; 'sam' only sam's rows; 'nobody-ran-this' shows 'No run matches'",
    );
    await openRunner(page);
    await page.getByTestId("tab-history").click();
    await expect(page.getByTestId("history-row").first()).toBeVisible();

    // Only passed runs.
    await page.getByTestId("history-filter").selectOption("passed");
    const passed = page.getByTestId("history-row");
    expect(await passed.count()).toBeGreaterThan(0);
    for (const row of await passed.all()) {
      await expect(row).toHaveAttribute("data-outcome", "passed");
    }

    // Only cancelled runs.
    await page.getByTestId("history-filter").selectOption("cancelled");
    for (const row of await page.getByTestId("history-row").all()) {
      await expect(row).toHaveAttribute("data-outcome", "cancelled");
    }

    // The seeded history has two runs by sam.
    await page.getByTestId("history-filter").selectOption("");
    await page.getByTestId("history-search").fill("sam");
    const bySam = page.getByTestId("history-row");
    expect(await bySam.count()).toBeGreaterThan(0);
    for (const row of await bySam.all()) {
      await expect(row.getByTestId("history-actor")).toHaveText("sam");
    }

    // A name nobody has.
    await page.getByTestId("history-search").fill("nobody-ran-this");
    await expect(page.getByTestId("history-empty")).toBeVisible();
    await expect(page.getByTestId("history-empty")).toContainText(
      "No run matches",
    );
  });
});

test.describe("The Dashboard", () => {
  // The Dashboard counts runs and flows, lists recent runs, and opens one.
  test("counts the runs and opens a recent one", async ({ page }) => {
    expected(
      "a total, the flow count from the catalog, 10 quick rows; a recent run opens with 3 rail steps",
    );
    await openRunner(page);

    await expect(page.getByTestId("tile-total")).not.toHaveText("—");
    // From the committed catalog, not a number typed here: it went stale at
    // 139 when the catalog grew.
    await expect(page.getByTestId("tile-flows")).toHaveText(
      String(catalog().flows.length),
    );
    await expect(page.getByTestId("quick-row")).toHaveCount(10);

    // Open the newest run.
    await page.getByTestId("recent-run-view").first().click();
    await expect(page.getByTestId("panel-run-view")).toBeVisible();
    await expect(page.getByTestId("rail-step")).toHaveCount(3);
  });
});
