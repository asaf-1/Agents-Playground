// Playwright's test tools, with the [RESULT] block printed after every test.
import {
  expect,
  expected,
  fact,
  test,
} from "../../framework/fixtures/resultBlock";
// The runner helpers: the catalog and its counts, one flow, the groups, the Run tab.
import {
  catalog,
  countByKind,
  flowById,
  groups,
  openRunTab,
} from "../../framework/helpers/runner";

// Picking what to run: three levels, plain names, a sentence per flow, how it
// went last time, and a search that says where else to look.

test.describe("The picker", () => {
  // The picker's three levels show the same counts as the committed catalog.
  test("offers three levels with the catalog's own counts", async ({
    page,
  }) => {
    expected(
      "the group, spec and suite counts equal the catalog's; 'N suites'; the group level pressed",
    );
    await openRunTab(page);

    // Each level's count, from the catalog.
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
    // Groups are shown first.
    await expect(page.getByTestId("picker-level-group")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  // Every group card shows its plain name, its sentence and a time; two show
  // how they went last time.
  test("names every suite in plain words, with what it checks", async ({
    page,
  }) => {
    expected(
      "each group card shows its label, description and a time in minutes; functional shows its test count and Passed; contract shows Cancelled",
    );
    await openRunTab(page);

    // Each group's card.
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

    // And one whose last run was cancelled.
    const contract = page.locator(
      '[data-testid="flow-row"][data-flow-id="group-contract"]',
    );
    await expect(contract.getByTestId("flow-last")).toContainText("Cancelled");
  });

  // The page level groups specs by area, each with the sentence from its spec.
  test("groups the pages by area, each with a sentence from its spec", async ({
    page,
  }) => {
    expected(
      "'N pages'; the first section is Bank screens; the Cards card shows its catalog summary",
    );
    await openRunTab(page);
    await page.getByTestId("picker-level-spec").click();

    // The count and the first area.
    await expect(page.getByTestId("flow-count")).toHaveText(
      `${countByKind("spec")} pages`,
    );
    const sections = page.getByTestId("flow-section");
    await expect(sections.first()).toHaveAttribute("data-area", "bank-screens");
    await expect(sections.first()).toContainText("Bank screens");

    // The Cards page's card.
    const cards = page.locator(
      '[data-testid="flow-row"][data-flow-id="spec-app-react-bank-cards"]',
    );
    await expect(cards.getByTestId("flow-name")).toHaveText("Cards");
    await expect(cards.getByTestId("flow-summary")).toHaveText(
      flowById("spec-app-react-bank-cards").summary as string,
    );
  });

  // The check level names a describe block by its title and says which page it is in.
  test("names a single check by its block, and the page it lives in", async ({
    page,
  }) => {
    expected(
      "the cards spec's describe block is listed by its title, 'In Cards'",
    );
    // The cards spec's describe block, from the catalog.
    const block = catalog().flows.find(
      (flow) =>
        flow.kind === "suite" &&
        flow.path === "tests/e2e/app/react-bank-cards.spec.ts",
    );
    if (!block) throw new Error("the cards spec has no describe block");
    fact("block", block.id);

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

  // Searching narrows the level and, when a level has nothing, says which
  // other level does; Escape clears it.
  test("search narrows a level and points at the others", async ({ page }) => {
    expected(
      "'cards': 0 groups and a pointer to pages; the pages level lists only card rows; Escape restores 'N pages'",
    );
    await openRunTab(page);
    await page.getByTestId("flow-filter").fill("cards");

    // No suite is about cards, so the level says where to look instead.
    await expect(page.getByTestId("picker-count-group")).toHaveText("0");
    await expect(page.getByTestId("flow-list-empty")).toContainText("pages");

    // How many pages matched.
    const pages = Number(
      await page.getByTestId("picker-count-spec").textContent(),
    );
    fact("pages", pages);
    expect(pages).toBeGreaterThan(0);

    // On the pages level, every row is about cards.
    await page.getByTestId("picker-level-spec").click();
    await expect(page.getByTestId("flow-row")).toHaveCount(pages);
    for (const row of await page.getByTestId("flow-row").all()) {
      const text = ((await row.textContent()) || "").toLowerCase();
      const id = (await row.getAttribute("data-flow-id")) || "";
      expect(`${text} ${id}`).toContain("card");
    }

    // Escape clears the search.
    await page.getByTestId("flow-filter").press("Escape");
    await expect(page.getByTestId("flow-count")).toHaveText(
      `${countByKind("spec")} pages`,
    );
  });

  // The options start folded with a one-line summary; changing the browser
  // updates it, and Reset puts it back.
  test("keeps the options folded and sums them up in one line", async ({
    page,
  }) => {
    expected(
      "folded, summary 'Chromium' and 'Pipeline build'; environment pipeline with a hint; Firefox shows in the summary; Reset back to Chromium",
    );
    await openRunTab(page);

    // Folded, with a summary.
    const card = page.getByTestId("options-card");
    await expect(card).not.toHaveAttribute("open", "");
    await expect(page.getByTestId("options-summary")).toContainText("Chromium");
    await expect(page.getByTestId("options-summary")).toContainText(
      "Pipeline build",
    );

    // Unfolded: the environment and its hint.
    await card.locator("summary").click();
    await expect(page.getByTestId("option-environment")).toHaveValue(
      "pipeline",
    );
    await expect(page.getByTestId("option-environment-hint")).not.toBeEmpty();

    // Firefox, then Reset.
    await page.getByTestId("option-browser").selectOption("firefox");
    await expect(page.getByTestId("options-summary")).toContainText("Firefox");

    await page.getByTestId("options-reset").click();
    await expect(page.getByTestId("options-summary")).toContainText("Chromium");
  });
});
