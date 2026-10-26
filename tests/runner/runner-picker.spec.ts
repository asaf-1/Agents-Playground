import { expect, test } from "@playwright/test";
import { catalog, countByKind, flowById, groups, openRunTab } from "./_runner";

// Picking what to run: three levels, plain names, a sentence per flow, how it
// went last time, and a search that says where else to look.

test.describe("The picker", () => {
  test("offers three levels with the catalog's own counts", async ({
    page,
  }) => {
    await openRunTab(page);

    await expect(page.getByTestId("picker-count-group")).toHaveText(
      String(countByKind("group")),
    );
    await expect(page.getByTestId("picker-count-spec")).toHaveText(
      String(countByKind("spec")),
    );
    await expect(page.getByTestId("picker-count-suite")).toHaveText(
      String(countByKind("suite")),
    );
    await expect(page.getByTestId("flow-count")).toHaveText(
      `${countByKind("group")} suites`,
    );
    await expect(page.getByTestId("picker-level-group")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  test("names every suite in plain words, with what it checks", async ({
    page,
  }) => {
    await openRunTab(page);

    for (const group of groups()) {
      const card = page.locator(
        `[data-testid="flow-row"][data-flow-id="${group.id}"]`,
      );
      await expect(card.getByTestId("flow-name")).toHaveText(group.label);
      await expect(card.getByTestId("flow-summary")).toHaveText(
        group.description,
      );
      await expect(card.getByTestId("flow-time")).toContainText("minute");
    }

    // The seeded history: a suite nothing in this suite touches.
    const functional = page.locator(
      '[data-testid="flow-row"][data-flow-id="group-functional"]',
    );
    await expect(functional.getByTestId("flow-tests")).toHaveText(
      `${flowById("group-functional").testCount} tests`,
    );
    await expect(functional.getByTestId("flow-last")).toContainText("Passed");

    const contract = page.locator(
      '[data-testid="flow-row"][data-flow-id="group-contract"]',
    );
    await expect(contract.getByTestId("flow-last")).toContainText("Cancelled");
  });

  test("groups the pages by area, each with a sentence from its spec", async ({
    page,
  }) => {
    await openRunTab(page);
    await page.getByTestId("picker-level-spec").click();

    await expect(page.getByTestId("flow-count")).toHaveText(
      `${countByKind("spec")} pages`,
    );
    const sections = page.getByTestId("flow-section");
    await expect(sections.first()).toHaveAttribute("data-area", "bank-screens");
    await expect(sections.first()).toContainText("Bank screens");

    const cards = page.locator(
      '[data-testid="flow-row"][data-flow-id="spec-app-react-bank-cards"]',
    );
    await expect(cards.getByTestId("flow-name")).toHaveText("Cards");
    await expect(cards.getByTestId("flow-summary")).toHaveText(
      flowById("spec-app-react-bank-cards").summary as string,
    );
  });

  test("names a single check by its block, and the page it lives in", async ({
    page,
  }) => {
    const block = catalog().flows.find(
      (flow) =>
        flow.kind === "suite" &&
        flow.path === "tests/e2e/app/react-bank-cards.spec.ts",
    );
    if (!block) throw new Error("the cards spec has no describe block");

    await openRunTab(page);
    await page.getByTestId("picker-level-suite").click();

    const row = page.locator(
      `[data-testid="flow-row"][data-flow-id="${block.id}"]`,
    );
    await expect(row.getByTestId("flow-name")).toHaveText(
      block.title as string,
    );
    await expect(row.getByTestId("flow-summary")).toContainText("In Cards");
  });

  test("search narrows a level and points at the others", async ({ page }) => {
    await openRunTab(page);
    await page.getByTestId("flow-filter").fill("cards");

    // No suite is about cards, so the level says where to look instead.
    await expect(page.getByTestId("picker-count-group")).toHaveText("0");
    await expect(page.getByTestId("flow-list-empty")).toContainText("pages");

    const pages = Number(
      await page.getByTestId("picker-count-spec").textContent(),
    );
    expect(pages).toBeGreaterThan(0);

    await page.getByTestId("picker-level-spec").click();
    await expect(page.getByTestId("flow-row")).toHaveCount(pages);
    for (const row of await page.getByTestId("flow-row").all()) {
      const text = ((await row.textContent()) || "").toLowerCase();
      const id = (await row.getAttribute("data-flow-id")) || "";
      expect(`${text} ${id}`).toContain("card");
    }

    await page.getByTestId("flow-filter").press("Escape");
    await expect(page.getByTestId("flow-count")).toHaveText(
      `${countByKind("spec")} pages`,
    );
  });

  test("keeps the options folded and sums them up in one line", async ({
    page,
  }) => {
    await openRunTab(page);

    const card = page.getByTestId("options-card");
    await expect(card).not.toHaveAttribute("open", "");
    await expect(page.getByTestId("options-summary")).toContainText("Chromium");
    await expect(page.getByTestId("options-summary")).toContainText(
      "Pipeline build",
    );

    await card.locator("summary").click();
    await expect(page.getByTestId("option-environment")).toHaveValue(
      "pipeline",
    );
    await expect(page.getByTestId("option-environment-hint")).not.toBeEmpty();

    await page.getByTestId("option-browser").selectOption("firefox");
    await expect(page.getByTestId("options-summary")).toContainText("Firefox");

    await page.getByTestId("options-reset").click();
    await expect(page.getByTestId("options-summary")).toContainText("Chromium");
  });
});
