/** Playwright's test tools with the framework's page objects and the [RESULT] block. */
import {
  expect,
  expected,
  fact,
  test,
} from "../../../framework/fixtures/appTest";

/** The Orders page loads, its page contract passes, and it shows a count. */
test("Orders page loads and passes its page contract", async ({
  ordersPage,
}) => {
  expected("heading visible, the page contract valid, an orders count shown");
  await ordersPage.goto();
  await expect(ordersPage.heading).toBeVisible();
  const validation = await ordersPage.expectLoaded();
  fact("contract", validation.valid);
  expect(validation.valid).toBe(true);
  await expect(ordersPage.ordersCount).toBeVisible();
});

/** The Admin page loads, its contract passes, and Clear empties its log. */
test("Admin page loads, clears its log, and passes contract", async ({
  adminPage,
  page,
}) => {
  expected(
    "heading visible, the page contract valid, the action count 0 after Clear",
  );
  await adminPage.goto();
  await expect(adminPage.heading).toBeVisible();
  const validation = await adminPage.expectLoaded();
  fact("contract", validation.valid);
  expect(validation.valid).toBe(true);
  await adminPage.clearLog();
  await expect(adminPage.actionCount).toHaveText("0");
});

/** The Profile page loads, its contract passes, and Edit then Save works. */
test("Profile page loads, enters edit mode, and saves", async ({
  profilePage,
}) => {
  expected(
    "heading visible, the page contract valid, 'Saved profile' after Edit and Save",
  );
  await profilePage.goto();
  await expect(profilePage.heading).toBeVisible();
  const validation = await profilePage.expectLoaded();
  fact("contract", validation.valid);
  expect(validation.valid).toBe(true);
  await profilePage.edit();
  await profilePage.save();
  await expect(profilePage.status).toContainText("Saved profile");
});

/** The Settings page loads, its contract passes, and saving the dark theme shows it. */
test("Settings page loads and persists saved values in status", async ({
  settingsPage,
}) => {
  expected(
    "heading visible, the page contract valid, 'Theme: dark' after saving",
  );
  await settingsPage.goto();
  await expect(settingsPage.heading).toBeVisible();
  const validation = await settingsPage.expectLoaded();
  fact("contract", validation.valid);
  expect(validation.valid).toBe(true);
  await settingsPage.themeSelect.selectOption("dark");
  await settingsPage.save();
  await expect(settingsPage.status).toContainText("Theme: dark");
});
