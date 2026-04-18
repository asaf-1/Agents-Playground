import { expect, test } from "../../../framework/fixtures/baseTest";

test("Orders page loads and passes its page contract", async ({ ordersPage }) => {
  await ordersPage.goto();
  await expect(ordersPage.heading).toBeVisible();
  const validation = await ordersPage.expectLoaded();
  expect(validation.valid).toBe(true);
  await expect(ordersPage.ordersCount).toBeVisible();
});

test("Admin page loads, clears its log, and passes contract", async ({ adminPage, page }) => {
  await adminPage.goto();
  await expect(adminPage.heading).toBeVisible();
  const validation = await adminPage.expectLoaded();
  expect(validation.valid).toBe(true);
  await adminPage.clearLog();
  await expect(adminPage.actionCount).toHaveText("0");
});

test("Profile page loads, enters edit mode, and saves", async ({ profilePage }) => {
  await profilePage.goto();
  await expect(profilePage.heading).toBeVisible();
  const validation = await profilePage.expectLoaded();
  expect(validation.valid).toBe(true);
  await profilePage.edit();
  await profilePage.save();
  await expect(profilePage.status).toContainText("Saved profile");
});

test("Settings page loads and persists saved values in status", async ({ settingsPage }) => {
  await settingsPage.goto();
  await expect(settingsPage.heading).toBeVisible();
  const validation = await settingsPage.expectLoaded();
  expect(validation.valid).toBe(true);
  await settingsPage.themeSelect.selectOption("dark");
  await settingsPage.save();
  await expect(settingsPage.status).toContainText("Theme: dark");
});
