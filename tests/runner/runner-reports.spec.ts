import fs from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { openRunner } from "./_runner";

// The Reports and Triage tabs against the stub's two weeks of seeded runs.
// Other specs start runs on the same stub while these run, so nothing here
// pins an exact total: it checks that each figure is there, that filters
// narrow it, and that the downloads hold what the page shows.

async function openTab(page: Page, tab: "reports" | "triage") {
  await openRunner(page);
  await page.getByTestId(`tab-${tab}`).click();
  await expect(page.getByTestId(`panel-${tab}`)).toBeVisible();
}

async function reportReady(page: Page) {
  await expect(page.getByTestId("report-runs")).not.toHaveText("—", {
    timeout: 20_000,
  });
}

function count(text: string | null): number {
  return Number(String(text).replace(/[^\d]/g, ""));
}

test.describe("Reports", () => {
  test("shows the period's figures and draws every chart", async ({ page }) => {
    await openTab(page, "reports");
    await reportReady(page);

    expect(
      count(await page.getByTestId("report-runs").textContent()),
    ).toBeGreaterThan(10);
    await expect(page.getByTestId("report-pass-rate")).toHaveText(/^\d+%$/);
    await expect(page.getByTestId("report-tests")).toHaveText(/^[\d,]+$/);
    await expect(page.getByTestId("report-duration")).toHaveText(/\d+[ms]/);

    // The test-results donut: four ways a test ends, each with a share.
    const outcomes = page.getByTestId("chart-outcomes");
    await expect(outcomes.getByTestId("legend-item")).toHaveCount(4);
    await expect(
      outcomes.locator('[data-testid="legend-item"][data-key="failed"]'),
    ).toContainText(/\d+ · (\d+|<1)%/);

    // The seeded history has failures of several kinds.
    expect(
      await page
        .getByTestId("chart-categories")
        .getByTestId("legend-item")
        .count(),
    ).toBeGreaterThan(2);

    await expect(
      page.getByTestId("chart-pass-rate").locator("circle").first(),
    ).toBeVisible();
    expect(
      await page.getByTestId("chart-tests").getByTestId("chart-bar").count(),
    ).toBeGreaterThan(5);
    await expect(
      page.getByTestId("chart-duration").locator("svg"),
    ).toBeVisible();
    expect(
      await page.getByTestId("chart-flows").getByTestId("hbar").count(),
    ).toBeGreaterThan(1);
  });

  test("filters narrow every figure, and the period carries to Triage", async ({
    page,
  }) => {
    await openTab(page, "reports");
    await reportReady(page);
    const all = count(await page.getByTestId("report-runs").textContent());

    // group-app: three seeded runs, all older than a day, none started by
    // another spec.
    await page.getByTestId("reports-flow").selectOption("group-app");
    await expect(page.getByTestId("report-runs")).toHaveText("3");
    expect(all).toBeGreaterThan(3);
    await expect(
      page.getByTestId("chart-flows").getByTestId("hbar"),
    ).toHaveCount(1);

    await page.getByTestId("reports-window").selectOption("1d");
    await expect(page.getByTestId("report-runs")).toHaveText("0");
    await expect(
      page.getByTestId("chart-outcomes").getByTestId("chart-empty"),
    ).toBeVisible();

    // One set of filters for both tabs: Triage opens on the same choice, and
    // its downloads carry it.
    await page.getByTestId("tab-triage").click();
    await expect(page.getByTestId("triage-window")).toHaveValue("1d");
    await expect(page.getByTestId("triage-flow")).toHaveValue("group-app");
    await expect(page.getByTestId("triage-download-csv")).toHaveAttribute(
      "href",
      /format=csv&window=1d&flow=group-app/,
    );
    await expect(
      page.getByTestId("triage-failing").getByTestId("triage-empty"),
    ).toBeVisible();
  });
});

test.describe("Triage", () => {
  test("ranks failing tests, each with its kind and similar known problems", async ({
    page,
  }) => {
    await openTab(page, "triage");

    const first = page.getByTestId("triage-test").first();
    await expect(first).toBeVisible({ timeout: 20_000 });
    await expect(first.getByTestId("category-chip")).toBeVisible();

    // Most runs first.
    const runs = await page.getByTestId("triage-runs-failed").allTextContents();
    expect(runs.map(Number)).toEqual(
      [...runs.map(Number)].sort((a, b) => b - a),
    );

    await first.locator("summary").click();
    await expect(first.locator(".failure-message")).toBeVisible();
    await expect(first.getByTestId("triage-similar")).toBeVisible();
    expect(await first.getByTestId("similar-item").count()).toBeGreaterThan(0);
    await expect(first.getByTestId("similar-item").first()).toContainText(
      /score \d/,
    );

    await expect(page.getByTestId("triage-flaky-item").first()).toBeVisible();
    await expect(page.getByTestId("triage-group").first()).toContainText(
      /Expected|Error|timeout/i,
    );
    expect(
      await page
        .getByTestId("triage-categories")
        .getByTestId("category-chip")
        .count(),
    ).toBeGreaterThan(2);
  });

  test("downloads an HTML report grouped by category, and a CSV", async ({
    page,
  }) => {
    await openTab(page, "triage");
    await expect(page.getByTestId("triage-test").first()).toBeVisible({
      timeout: 20_000,
    });

    const [html] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("triage-download-html").click(),
    ]);
    expect(html.suggestedFilename()).toMatch(
      /^test-triage-\d{4}-\d{2}-\d{2}\.html$/,
    );
    const page1 = fs.readFileSync(await html.path(), "utf8");
    expect(page1).toContain("<h1>Test triage report</h1>");
    expect(page1).toContain("What it usually means:");
    expect(page1).toContain("Similar known problems");
    expect(page1).not.toContain("<script");
    expect(page1.match(/<section class="category">/g)?.length).toBeGreaterThan(
      2,
    );

    const [csv] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("triage-download-csv").click(),
    ]);
    expect(csv.suggestedFilename()).toMatch(/\.csv$/);
    const lines = fs
      .readFileSync(await csv.path(), "utf8")
      .trim()
      .split(/\r\n/);
    expect(lines[0].replace(/^﻿/, "")).toBe(
      "run,date,flow,started_by,test,file,line,status,category,message",
    );
    expect(lines.length).toBeGreaterThan(5);
  });

  test("is refused without signing in", async ({ request, browser }) => {
    const context = await browser.newContext({
      storageState: { cookies: [], origins: [] },
    });
    const anonymous = await context.request.get("/api/reports");
    expect(anonymous.status()).toBe(401);
    const download = await context.request.get(
      "/api/reports/download?format=csv",
    );
    expect(download.status()).toBe(401);
    await context.close();

    expect((await request.get("/api/reports")).status()).toBe(200);
  });
});

test.describe("Accessibility", () => {
  test("Reports and Triage", async ({ page }) => {
    const serious = async () =>
      (
        await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()
      ).violations.filter(
        (v) => v.impact === "serious" || v.impact === "critical",
      );

    await openTab(page, "reports");
    await reportReady(page);
    expect(await serious()).toEqual([]);

    await page.getByTestId("tab-triage").click();
    await page.getByTestId("triage-test").first().locator("summary").click();
    expect(await serious()).toEqual([]);
  });
});
