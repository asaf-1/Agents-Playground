/** The router that picks and runs a recovery strategy. */
import { RecoveryRouter } from "../../../framework/agents/recovery/RecoveryRouter";
/** The scenario report: start it, and write it out at the end. */
import {
  createScenarioReport,
  serializeError,
  writeScenarioArtifacts,
} from "../../../framework/reporting/scenarioArtifacts";
/** Playwright's test tools with the framework's page objects and the [RESULT] block. */
import {
  expect,
  expected,
  fact,
  test,
} from "../../../framework/fixtures/appTest";
/** A runKey of the test's own. */
import { uniqueRunKey } from "../../../framework/helpers/bank";

/**
 * Three stale selectors on the bank's pages, each a different kind of control
 * (a button on Orders, a link on the home page, the search box on Users), each
 * fail, and the same generic router heals all three. (Until 2026-11-20 this
 * ran on the original demo site's landing page.)
 */
test("heals stale button, link, and input locators through the generic router", async ({
  context,
  homePage,
  ordersPage,
  page,
  usersPage,
}) => {
  expected(
    "the button heal presses Refresh (one more /api/orders request); the link heal opens /app/orders; the input heal searches 'Bob' and only Bob Harbor's row shows; report recovered",
  );
  // A report for this scenario, and one router for all three heals.
  const scenario = "generic-self-healing";
  const report = createScenarioReport(scenario);
  const router = new RecoveryRouter(page);
  const runKey = uniqueRunKey(scenario);
  let scenarioError: unknown;

  try {
    // 1. A button whose old label is gone: Refresh on /app/orders.
    await ordersPage.goto(runKey);
    await ordersPage.waitForOrdersLoaded(3);
    let buttonFailure = "";

    try {
      await page
        .locator('button:has-text("Reload list")')
        .click({ timeout: 400 });
      buttonFailure =
        "The stale Reload list button selector unexpectedly resolved.";
    } catch (error) {
      buttonFailure = serializeError(error);
    }

    // Heal it by intent ("refresh", "orders"); the orders are asked for again.
    let ordersRequests = 0;
    const countOrders = (sent: { url(): string }) => {
      if (sent.url().includes("/api/orders")) ordersRequests += 1;
    };
    page.on("request", countOrders);
    const buttonRecovery = await router.recover({
      failureEvidence: {
        errorMessage: buttonFailure,
        staleSelector: 'button:has-text("Reload list")',
        targetType: "button",
      },
      pageLabel: "Orders",
      scenario,
      strategies: [
        {
          kind: "locator-heal",
          request: {
            action: "click",
            intentTokens: ["refresh", "orders"],
            staleSelector: 'button:has-text("Reload list")',
            targetType: "button",
          },
        },
      ],
    });
    fact("button", buttonRecovery.finalStatus);

    expect(buttonRecovery.finalStatus, "the button heal recovered").toBe(
      "recovered",
    );
    await expect
      .poll(() => ordersRequests, { message: "Refresh asked for the orders" })
      .toBeGreaterThan(0);
    page.off("request", countOrders);

    // 2. A link whose old label is gone: the home page's way to the orders.
    await homePage.goto();
    let linkFailure = "";

    try {
      await page
        .locator('a:has-text("Merchant console")')
        .click({ timeout: 400 });
      linkFailure =
        "The stale Merchant console link selector unexpectedly resolved.";
    } catch (error) {
      linkFailure = serializeError(error);
    }

    // Heal it; it opens the Orders page.
    const linkRecovery = await router.recover({
      failureEvidence: {
        errorMessage: linkFailure,
        staleSelector: 'a:has-text("Merchant console")',
        targetType: "link",
      },
      pageLabel: "Home",
      scenario,
      strategies: [
        {
          kind: "locator-heal",
          request: {
            action: "click",
            intentTokens: ["orders", "back", "office"],
            staleSelector: 'a:has-text("Merchant console")',
            targetType: "link",
          },
        },
      ],
    });
    fact("link", linkRecovery.finalStatus);

    expect(linkRecovery.finalStatus, "the link heal recovered").toBe(
      "recovered",
    );
    await expect(page, "it opened Orders").toHaveURL(/\/app\/orders(?:\?.*)?$/);

    // 3. An input whose old placeholder is gone: the Users search box.
    await usersPage.goto(runKey);
    await usersPage.waitForUsersLoaded();
    let inputFailure = "";

    try {
      await page
        .locator('input[placeholder="Find a person"]')
        .fill("Bob", { timeout: 400 });
      inputFailure =
        "The stale Find a person input selector unexpectedly resolved.";
    } catch (error) {
      inputFailure = serializeError(error);
    }

    // Heal it and type the name; only Bob Harbor's row is left.
    const inputRecovery = await router.recover({
      failureEvidence: {
        errorMessage: inputFailure,
        staleSelector: 'input[placeholder="Find a person"]',
        targetType: "input",
      },
      pageLabel: "Users",
      scenario,
      strategies: [
        {
          kind: "locator-heal",
          request: {
            action: "fill",
            fillValue: "Bob",
            intentTokens: ["search", "users", "name"],
            staleSelector: 'input[placeholder="Find a person"]',
            targetType: "input",
          },
        },
      ],
    });
    fact("input", inputRecovery.finalStatus);

    expect(inputRecovery.finalStatus, "the input heal recovered").toBe(
      "recovered",
    );
    await expect(usersPage.search, "the name is in the search box").toHaveValue(
      "Bob",
    );
    await expect(usersPage.row("USR-002"), "Bob Harbor shows").toBeVisible();
    await expect(
      usersPage.row("USR-001"),
      "Alice is filtered out",
    ).toBeHidden();

    // What goes in the report.
    report.initialFailure = [buttonFailure, linkFailure, inputFailure].join(
      " | ",
    );
    report.evidence = {
      buttonRecovery,
      inputRecovery,
      linkRecovery,
    };
    report.agentDecision =
      "Recovered three unrelated stale locator failures through the generic router: a button click on Orders, a navigation link on the home page, and the search box fill on Users.";
    report.finalStatus = "recovered";
    report.suggestedPermanentFix =
      "Prefer durable page-object contracts built from data-testid, label, and role signals so locator healing becomes a fallback instead of the primary path.";
    report.engine = "deterministic";
  } catch (error) {
    // Any failure is recorded in the report, then thrown on after it is written.
    scenarioError = error;
    report.finalStatus = "failed";
    report.agentDecision ||=
      "The generic self-healing scenario failed before all three locator classes recovered.";
    report.initialFailure ||= serializeError(error);
  } finally {
    // Always write the report and the screenshot.
    await writeScenarioArtifacts({
      context,
      page,
      report,
      scenario,
    });
  }
  fact("report", report.finalStatus);

  if (scenarioError) {
    throw scenarioError;
  }
});
