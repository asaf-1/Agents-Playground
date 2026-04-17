import { RecoveryRouter } from "../../../framework/agents/recovery/RecoveryRouter";
import {
  createScenarioReport,
  serializeError,
  startScenarioTrace,
  writeScenarioArtifacts
} from "../../../framework/reporting/scenarioArtifacts";
import { expect, test } from "../../../framework/fixtures/baseTest";

test("heals dropdown, menu, modal, row-action, and section-scoped field locators on the User Manager page", async ({
  context,
  page,
  userManagerPage
}) => {
  const scenario = "advanced-locator-healing";
  const report = createScenarioReport(scenario);
  const router = new RecoveryRouter(page);
  let scenarioError: unknown;

  await startScenarioTrace(context);

  try {
    await page.request.post("/api/test/reset-users");
    await userManagerPage.goto();
    await userManagerPage.waitForUsersLoaded();

    const failures: string[] = [];

    try {
      await page.locator("select#team-role-filter").selectOption("Admin", { timeout: 400 });
      failures.push("The stale role filter selector unexpectedly resolved.");
    } catch (error) {
      failures.push(serializeError(error));
    }

    const dropdownRecovery = await router.recover({
      failureEvidence: {
        errorMessage: failures[0],
        staleSelector: "select#team-role-filter",
        targetType: "select"
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
            targetType: "select"
          }
        }
      ]
    });

    expect(dropdownRecovery.finalStatus).toBe("recovered");
    await expect(page.getByTestId("role-filter")).toHaveValue("Admin");
    await expect(userManagerPage.userRows).toHaveCount(1);
    await page.getByTestId("role-filter").selectOption("All");

    try {
      await page.locator('button:has-text("Team Actions")').click({ timeout: 400 });
      failures.push("The stale Team Actions button selector unexpectedly resolved.");
    } catch (error) {
      failures.push(serializeError(error));
    }

    const menuRecovery = await router.recover({
      failureEvidence: {
        errorMessage: failures[1],
        staleSelector: 'button:has-text("Team Actions")',
        targetType: "button"
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
            targetType: "button"
          }
        }
      ]
    });

    expect(menuRecovery.finalStatus).toBe("recovered");
    await expect(page.getByTestId("bulk-actions-menu")).toBeVisible();

    try {
      await page.locator('[role="menuitem"]:has-text("Invite Member")').click({ timeout: 400 });
      failures.push("The stale Invite Member menu selector unexpectedly resolved.");
    } catch (error) {
      failures.push(serializeError(error));
    }

    const menuItemRecovery = await router.recover({
      failureEvidence: {
        errorMessage: failures[2],
        staleSelector: '[role="menuitem"]:has-text("Invite Member")',
        targetType: "menuitem"
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
            targetType: "menuitem"
          }
        }
      ]
    });

    expect(menuItemRecovery.finalStatus).toBe("recovered");
    await expect(page.getByTestId("invite-dialog")).toBeVisible();

    try {
      await page.locator('input[placeholder="Invite teammate"]').fill("qa@agentic.local", { timeout: 400 });
      failures.push("The stale invite email field selector unexpectedly resolved.");
    } catch (error) {
      failures.push(serializeError(error));
    }

    const modalFieldRecovery = await router.recover({
      failureEvidence: {
        errorMessage: failures[3],
        staleSelector: 'input[placeholder="Invite teammate"]',
        targetType: "input"
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
            targetType: "input"
          }
        }
      ]
    });

    expect(modalFieldRecovery.finalStatus).toBe("recovered");
    await expect(page.getByTestId("invite-email")).toHaveValue("qa@agentic.local");

    try {
      await page.locator('button:has-text("Send Access")').click({ timeout: 400 });
      failures.push("The stale modal confirm selector unexpectedly resolved.");
    } catch (error) {
      failures.push(serializeError(error));
    }

    const modalActionRecovery = await router.recover({
      failureEvidence: {
        errorMessage: failures[4],
        staleSelector: 'button:has-text("Send Access")',
        targetType: "button"
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
            targetType: "button"
          }
        }
      ]
    });

    expect(modalActionRecovery.finalStatus).toBe("recovered");
    await expect(page.getByTestId("selected-user-output")).toContainText("Prepared invite");

    try {
      await page.locator('tr:has-text("Bob Harbor") button:has-text("Inspect")').click({ timeout: 400 });
      failures.push("The stale row action selector unexpectedly resolved.");
    } catch (error) {
      failures.push(serializeError(error));
    }

    const rowActionRecovery = await router.recover({
      failureEvidence: {
        errorMessage: failures[5],
        staleSelector: 'tr:has-text("Bob Harbor") button:has-text("Inspect")',
        targetType: "button"
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
            staleSelector: 'tr:has-text("Bob Harbor") button:has-text("Inspect")',
            targetType: "button"
          }
        }
      ]
    });

    expect(rowActionRecovery.finalStatus).toBe("recovered");
    await expect(page.getByTestId("selected-user-output")).toContainText("Viewing Bob Harbor");

    report.initialFailure = failures.join(" | ");
    report.evidence = {
      dropdownRecovery,
      menuItemRecovery,
      menuRecovery,
      modalActionRecovery,
      modalFieldRecovery,
      rowActionRecovery
    };
    report.agentDecision =
      "Recovered six stale User Manager locators covering a role filter select, a bulk actions trigger, a menu item, a modal field, a modal action, and a row-scoped table action.";
    report.finalStatus = "recovered";
    report.suggestedPermanentFix =
      "Prefer role filters, dialog controls, row actions, and form fields that carry durable test ids plus label and section context so locator healing remains a fallback path.";
    report.engine = "deterministic";
  } catch (error) {
    scenarioError = error;
    report.finalStatus = "failed";
    report.agentDecision ||= "The advanced locator healing scenario failed before all User Manager recovery branches completed.";
    report.initialFailure ||= serializeError(error);
  } finally {
    await writeScenarioArtifacts({
      context,
      page,
      report,
      scenario
    });
  }

  if (scenarioError) {
    throw scenarioError;
  }
});
