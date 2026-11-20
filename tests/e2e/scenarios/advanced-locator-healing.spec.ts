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
/** The type of one heal request. */
import type { LocatorHealRequest } from "../../../framework/agents/recovery/types";
/** A runKey of the test's own. */
import { uniqueRunKey } from "../../../framework/helpers/bank";

/**
 * Six stale selectors on the bank's Users page (/app/users), each a different
 * kind of control: a row's ⋯ menu button, a menu item, a select in a dialog, a
 * dialog's save button, the button that opens another dialog, and a field in
 * it. Each fails and is healed in turn. The users list is shared by every
 * test, so the page's save requests are caught by route and answered here:
 * the test checks what the page sent, and nothing on the server changes.
 * (Until 2026-11-20 this ran on the original demo site's User Manager.)
 */
test("heals row-menu, menu item, dialog select, dialog button, opener, and dialog field locators on the Users page", async ({
  context,
  page,
  usersPage,
}) => {
  expected(
    "all six heals recover: Bob Harbor's menu opens, Edit opens its dialog, the role is set to Admin, Save sends PATCH {role: Admin}, New user opens its dialog, the name field holds 'QA Agent'; report recovered",
  );
  // A report for this scenario, and one router for every heal.
  const scenario = "advanced-locator-healing";
  const report = createScenarioReport(scenario);
  const router = new RecoveryRouter(page);
  let scenarioError: unknown;

  // The edits the page sends, caught and answered here.
  const sentEdits: Array<Record<string, unknown>> = [];
  await page.route("**/api/users/USR-002**", async (route) => {
    if (route.request().method() !== "PATCH") return route.continue();
    const edit = route.request().postDataJSON() as Record<string, unknown>;
    sentEdits.push(edit);
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ message: "User updated.", id: "USR-002", edit }),
    });
  });

  // One stale locator: try it, keep the error, then heal it.
  const failures: string[] = [];
  async function staleThenHeal(
    tryStale: () => Promise<unknown>,
    request: LocatorHealRequest,
  ) {
    try {
      await tryStale();
      failures.push(`${request.staleSelector} unexpectedly resolved.`);
    } catch (error) {
      failures.push(serializeError(error));
    }
    return router.recover({
      failureEvidence: {
        errorMessage: failures[failures.length - 1],
        staleSelector: request.staleSelector,
        targetType: request.targetType,
      },
      pageLabel: "Users",
      scenario,
      strategies: [{ kind: "locator-heal", request }],
    });
  }

  try {
    // The Users page under a runKey of the test's own.
    await usersPage.goto(uniqueRunKey(scenario));
    await usersPage.waitForUsersLoaded();

    // 1. Bob Harbor's ⋯ button under an old label, found by its row.
    const rowMenuRecovery = await staleThenHeal(
      () =>
        page
          .locator('tr:has-text("Bob Harbor") button:has-text("Options")')
          .click({ timeout: 400 }),
      {
        action: "click",
        intentTokens: ["actions"],
        rowTokens: ["Bob Harbor"],
        staleSelector: 'tr:has-text("Bob Harbor") button:has-text("Options")',
        targetType: "button",
      },
    );
    fact("row menu", rowMenuRecovery.finalStatus);
    expect(rowMenuRecovery.finalStatus, "the row menu heal").toBe("recovered");
    await expect(
      page.getByTestId("user-menu-USR-002"),
      "Bob Harbor's menu is open",
    ).toBeVisible();

    // 2. The menu's Edit under an old label.
    const menuItemRecovery = await staleThenHeal(
      () =>
        page
          .locator('[role="menuitem"]:has-text("Modify")')
          .click({ timeout: 400 }),
      {
        action: "click",
        intentTokens: ["edit"],
        staleSelector: '[role="menuitem"]:has-text("Modify")',
        targetType: "menuitem",
      },
    );
    fact("menu item", menuItemRecovery.finalStatus);
    expect(menuItemRecovery.finalStatus, "the menu item heal").toBe(
      "recovered",
    );
    await expect(usersPage.editDialog, "the Edit dialog is open").toBeVisible();

    // 3. The dialog's role picker under an old id, found by its label.
    const selectRecovery = await staleThenHeal(
      () =>
        page.locator("select#member-role").selectOption("Admin", {
          timeout: 400,
        }),
      {
        action: "select",
        intentTokens: ["role"],
        labelTokens: ["Role"],
        selectValue: "Admin",
        staleSelector: "select#member-role",
        targetType: "select",
      },
    );
    fact("select", selectRecovery.finalStatus);
    expect(selectRecovery.finalStatus, "the select heal").toBe("recovered");
    await expect(
      page.getByTestId("user-edit-role"),
      "the role picked is Admin",
    ).toHaveValue("Admin");

    // 4. The dialog's Save under an old label.
    const saveRecovery = await staleThenHeal(
      () =>
        page
          .locator('button:has-text("Apply changes")')
          .click({ timeout: 400 }),
      {
        action: "click",
        intentTokens: ["save"],
        staleSelector: 'button:has-text("Apply changes")',
        targetType: "button",
      },
    );
    fact("save", saveRecovery.finalStatus);
    expect(saveRecovery.finalStatus, "the save heal").toBe("recovered");
    await expect
      .poll(() => sentEdits.length, { message: "the page sent the edit" })
      .toBe(1);
    expect(sentEdits[0].role, "with the role picked").toBe("Admin");
    await expect(usersPage.editDialog, "the dialog closed").toBeHidden();

    // 5. New user under an old label.
    const openerRecovery = await staleThenHeal(
      () =>
        page.locator('button:has-text("Add Member")').click({ timeout: 400 }),
      {
        action: "click",
        intentTokens: ["new", "user"],
        staleSelector: 'button:has-text("Add Member")',
        targetType: "button",
      },
    );
    fact("opener", openerRecovery.finalStatus);
    expect(openerRecovery.finalStatus, "the opener heal").toBe("recovered");
    await expect(
      usersPage.createDialog,
      "the Create user dialog is open",
    ).toBeVisible();

    // 6. The dialog's name field under an old placeholder, found by its label.
    const fieldRecovery = await staleThenHeal(
      () =>
        page
          .locator('input[placeholder="Full name"]')
          .fill("QA Agent", { timeout: 400 }),
      {
        action: "fill",
        fillValue: "QA Agent",
        intentTokens: ["name"],
        labelTokens: ["Name"],
        staleSelector: 'input[placeholder="Full name"]',
        targetType: "input",
      },
    );
    fact("field", fieldRecovery.finalStatus);
    expect(fieldRecovery.finalStatus, "the field heal").toBe("recovered");
    await expect(
      page.getByTestId("users-create-name"),
      "the name is in the field",
    ).toHaveValue("QA Agent");

    // What goes in the report.
    report.initialFailure = failures.join(" | ");
    report.evidence = {
      fieldRecovery,
      menuItemRecovery,
      openerRecovery,
      rowMenuRecovery,
      saveRecovery,
      selectRecovery,
      sentEdits,
    };
    report.agentDecision =
      "Recovered six stale Users locators covering a row-scoped menu button, a menu item, a dialog select, a dialog action, a dialog opener, and a dialog field.";
    report.finalStatus = "recovered";
    report.suggestedPermanentFix =
      "Prefer row actions, menu items, dialog controls and form fields that carry durable test ids plus label and row context, so locator healing stays a fallback path.";
    report.engine = "deterministic";
  } catch (error) {
    // Any failure is recorded in the report, then thrown on after it is written.
    scenarioError = error;
    report.finalStatus = "failed";
    report.agentDecision ||=
      "The advanced locator healing scenario failed before all Users recovery branches completed.";
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
