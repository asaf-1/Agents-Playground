/** The router that picks and runs a recovery strategy. */
import { RecoveryRouter } from "../../../framework/agents/recovery/RecoveryRouter";
/** The scenario report: start it, record a trace, and write it out at the end. */
import {
  createScenarioReport,
  serializeError,
  startScenarioTrace,
  writeScenarioArtifacts,
} from "../../../framework/reporting/scenarioArtifacts";
/** Playwright's test tools with the framework's page objects and the [RESULT] block. */
import {
  expect,
  expected,
  fact,
  test,
} from "../../../framework/fixtures/appTest";

/**
 * Six stale selectors on User Manager, each a different kind of control (a
 * select, a menu button, a menu item, a dialog field, a dialog button and a
 * table row button), each fail and are healed in turn.
 */
test("heals dropdown, menu, modal, row-action, and section-scoped field locators on the User Manager page", async ({
  context,
  page,
  userManagerPage,
}) => {
  expected(
    "all six heals recover: role filter Admin (1 row), the bulk menu opens, the invite dialog opens, the email is filled, 'Prepared invite', 'Viewing Bob Harbor'; report recovered",
  );
  // A report for this scenario, and one router for every heal.
  const scenario = "advanced-locator-healing";
  const report = createScenarioReport(scenario);
  const router = new RecoveryRouter(page);
  let scenarioError: unknown;

  await startScenarioTrace(context);

  try {
    // A clean user list on User Manager.
    await page.request.post("/api/test/reset-users");
    await userManagerPage.goto();
    await userManagerPage.waitForUsersLoaded();

    // Each stale selector's error, in order.
    const failures: string[] = [];

    // 1. The role filter (a select) under an old id.
    try {
      await page
        .locator("select#team-role-filter")
        .selectOption("Admin", { timeout: 400 });
      failures.push("The stale role filter selector unexpectedly resolved.");
    } catch (error) {
      failures.push(serializeError(error));
    }

    // Heal it by its label and section, and pick Admin.
    const dropdownRecovery = await router.recover({
      failureEvidence: {
        errorMessage: failures[0],
        staleSelector: "select#team-role-filter",
        targetType: "select",
      },
      pageLabel: "User Manager",
      scenario,
      strategies: [
        {
          kind: "locator-heal",
          request: {
            action: "select",
            intentTokens: ["role", "filter", "admin"],
            labelTokens: ["Role", "Filter"],
            sectionTokens: ["User Manager"],
            selectValue: "Admin",
            staleSelector: "select#team-role-filter",
            targetType: "select",
          },
        },
      ],
    });
    fact("dropdown", dropdownRecovery.finalStatus);

    // Admin is picked, one user shows; put the filter back.
    expect(dropdownRecovery.finalStatus).toBe("recovered");
    await expect(page.getByTestId("role-filter")).toHaveValue("Admin");
    await expect(userManagerPage.userRows).toHaveCount(1);
    await page.getByTestId("role-filter").selectOption("All");

    // 2. The bulk actions button under an old label.
    try {
      await page
        .locator('button:has-text("Team Actions")')
        .click({ timeout: 400 });
      failures.push(
        "The stale Team Actions button selector unexpectedly resolved.",
      );
    } catch (error) {
      failures.push(serializeError(error));
    }

    // Heal it; the menu opens.
    const menuRecovery = await router.recover({
      failureEvidence: {
        errorMessage: failures[1],
        staleSelector: 'button:has-text("Team Actions")',
        targetType: "button",
      },
      pageLabel: "User Manager",
      scenario,
      strategies: [
        {
          kind: "locator-heal",
          request: {
            action: "click",
            intentTokens: ["bulk", "actions", "menu"],
            sectionTokens: ["User Manager"],
            staleSelector: 'button:has-text("Team Actions")',
            targetType: "button",
          },
        },
      ],
    });
    fact("menu", menuRecovery.finalStatus);

    expect(menuRecovery.finalStatus).toBe("recovered");
    await expect(page.getByTestId("bulk-actions-menu")).toBeVisible();

    // 3. The "invite" menu item under an old label.
    try {
      await page
        .locator('[role="menuitem"]:has-text("Invite Member")')
        .click({ timeout: 400 });
      failures.push(
        "The stale Invite Member menu selector unexpectedly resolved.",
      );
    } catch (error) {
      failures.push(serializeError(error));
    }

    // Heal it; the invite dialog opens.
    const menuItemRecovery = await router.recover({
      failureEvidence: {
        errorMessage: failures[2],
        staleSelector: '[role="menuitem"]:has-text("Invite Member")',
        targetType: "menuitem",
      },
      pageLabel: "User Manager",
      scenario,
      strategies: [
        {
          kind: "locator-heal",
          request: {
            action: "click",
            intentTokens: ["invite", "user"],
            sectionTokens: ["Invite User", "Refresh Directory"],
            staleSelector: '[role="menuitem"]:has-text("Invite Member")',
            targetType: "menuitem",
          },
        },
      ],
    });
    fact("menu item", menuItemRecovery.finalStatus);

    expect(menuItemRecovery.finalStatus).toBe("recovered");
    await expect(page.getByTestId("invite-dialog")).toBeVisible();

    // 4. The dialog's email field under an old placeholder.
    try {
      await page
        .locator('input[placeholder="Invite teammate"]')
        .fill("qa@agentic.local", { timeout: 400 });
      failures.push(
        "The stale invite email field selector unexpectedly resolved.",
      );
    } catch (error) {
      failures.push(serializeError(error));
    }

    // Heal it and type the email.
    const modalFieldRecovery = await router.recover({
      failureEvidence: {
        errorMessage: failures[3],
        staleSelector: 'input[placeholder="Invite teammate"]',
        targetType: "input",
      },
      pageLabel: "User Manager",
      scenario,
      strategies: [
        {
          kind: "locator-heal",
          request: {
            action: "fill",
            fillValue: "qa@agentic.local",
            intentTokens: ["invite", "email", "user"],
            labelTokens: ["Work", "Email"],
            placeholderTokens: ["name", "company"],
            sectionTokens: ["Invite User", "Work Email"],
            staleSelector: 'input[placeholder="Invite teammate"]',
            targetType: "input",
          },
        },
      ],
    });
    fact("modal field", modalFieldRecovery.finalStatus);

    expect(modalFieldRecovery.finalStatus).toBe("recovered");
    await expect(page.getByTestId("invite-email")).toHaveValue(
      "qa@agentic.local",
    );

    // 5. The dialog's confirm button under an old label.
    try {
      await page
        .locator('button:has-text("Send Access")')
        .click({ timeout: 400 });
      failures.push("The stale modal confirm selector unexpectedly resolved.");
    } catch (error) {
      failures.push(serializeError(error));
    }

    // Heal it; the invite is prepared.
    const modalActionRecovery = await router.recover({
      failureEvidence: {
        errorMessage: failures[4],
        staleSelector: 'button:has-text("Send Access")',
        targetType: "button",
      },
      pageLabel: "User Manager",
      scenario,
      strategies: [
        {
          kind: "locator-heal",
          request: {
            action: "click",
            intentTokens: ["send", "invite", "confirm"],
            sectionTokens: ["Invite User", "Work Email"],
            staleSelector: 'button:has-text("Send Access")',
            targetType: "button",
          },
        },
      ],
    });
    fact("modal action", modalActionRecovery.finalStatus);

    expect(modalActionRecovery.finalStatus).toBe("recovered");
    await expect(page.getByTestId("selected-user-output")).toContainText(
      "Prepared invite",
    );

    // 6. Bob Harbor's row button under an old label.
    try {
      await page
        .locator('tr:has-text("Bob Harbor") button:has-text("Inspect")')
        .click({ timeout: 400 });
      failures.push("The stale row action selector unexpectedly resolved.");
    } catch (error) {
      failures.push(serializeError(error));
    }

    // Heal it by the row's text; Bob Harbor's details show.
    const rowActionRecovery = await router.recover({
      failureEvidence: {
        errorMessage: failures[5],
        staleSelector: 'tr:has-text("Bob Harbor") button:has-text("Inspect")',
        targetType: "button",
      },
      pageLabel: "User Manager",
      scenario,
      strategies: [
        {
          kind: "locator-heal",
          request: {
            action: "click",
            intentTokens: ["view", "user", "details"],
            rowTokens: ["Bob Harbor", "Editor"],
            sectionTokens: ["User Manager"],
            staleSelector:
              'tr:has-text("Bob Harbor") button:has-text("Inspect")',
            targetType: "button",
          },
        },
      ],
    });
    fact("row action", rowActionRecovery.finalStatus);

    expect(rowActionRecovery.finalStatus).toBe("recovered");
    await expect(page.getByTestId("selected-user-output")).toContainText(
      "Viewing Bob Harbor",
    );

    // What goes in the report.
    report.initialFailure = failures.join(" | ");
    report.evidence = {
      dropdownRecovery,
      menuItemRecovery,
      menuRecovery,
      modalActionRecovery,
      modalFieldRecovery,
      rowActionRecovery,
    };
    report.agentDecision =
      "Recovered six stale User Manager locators covering a role filter select, a bulk actions trigger, a menu item, a modal field, a modal action, and a row-scoped table action.";
    report.finalStatus = "recovered";
    report.suggestedPermanentFix =
      "Prefer role filters, dialog controls, row actions, and form fields that carry durable test ids plus label and section context so locator healing remains a fallback path.";
    report.engine = "deterministic";
  } catch (error) {
    // Any failure is recorded in the report, then thrown on after it is written.
    scenarioError = error;
    report.finalStatus = "failed";
    report.agentDecision ||=
      "The advanced locator healing scenario failed before all User Manager recovery branches completed.";
    report.initialFailure ||= serializeError(error);
  } finally {
    // Always write the report and the trace.
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
