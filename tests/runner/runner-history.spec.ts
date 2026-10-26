import { expect, test } from "@playwright/test";
import { expectOutcome, openRunner, startRun, uniqueReason } from "./_runner";

// History and the Dashboard: finding a run again, filtering, and opening it.

test.describe("History", () => {
  test("lists the run just started, newest first, and opens it", async ({
    page,
  }) => {
    const reason = uniqueReason("find me");
    await startRun(page, "group-nonfunctional", reason);
    await expectOutcome(page, /Running|Queued|Passed/);

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

    await row.getByTestId("run-view").click();
    await expect(page.getByTestId("panel-run-view")).toBeVisible();
    await expect(page.getByTestId("run-view-facts")).toContainText(reason);
  });

  test("filters by outcome and by person", async ({ page }) => {
    await openRunner(page);
    await page.getByTestId("tab-history").click();
    await expect(page.getByTestId("history-row").first()).toBeVisible();

    await page.getByTestId("history-filter").selectOption("passed");
    const passed = page.getByTestId("history-row");
    expect(await passed.count()).toBeGreaterThan(0);
    for (const row of await passed.all()) {
      await expect(row).toHaveAttribute("data-outcome", "passed");
    }

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

    await page.getByTestId("history-search").fill("nobody-ran-this");
    await expect(page.getByTestId("history-empty")).toBeVisible();
    await expect(page.getByTestId("history-empty")).toContainText(
      "No run matches",
    );
  });
});

test.describe("The Dashboard", () => {
  test("counts the runs and opens a recent one", async ({ page }) => {
    await openRunner(page);

    await expect(page.getByTestId("tile-total")).not.toHaveText("—");
    await expect(page.getByTestId("tile-flows")).toHaveText("139");
    await expect(page.getByTestId("quick-row")).toHaveCount(10);

    await page.getByTestId("recent-run-view").first().click();
    await expect(page.getByTestId("panel-run-view")).toBeVisible();
    await expect(page.getByTestId("rail-step")).toHaveCount(3);
  });
});
