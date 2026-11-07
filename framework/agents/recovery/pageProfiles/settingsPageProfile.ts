// The Settings page's actions, for the healing page object in
// pom/SettingsPage.ts.

// The shape of a page profile.
import type { PageProfile } from "./types";

// The names of the page's actions.
export type SettingsActionKey = "selectTheme" | "saveSettings";

// Each action: its first locator, and the words the healer looks for when that
// locator fails.
export const settingsPageProfile: PageProfile<SettingsActionKey> = {
  pageLabel: "Settings",
  actions: {
    // The theme picker.
    selectTheme: {
      description: "Theme select",
      intentTokens: ["theme", "appearance", "settings"],
      primary: { kind: "testId", value: "settings-theme" },
      targetType: "select",
    },
    // Saves the settings.
    saveSettings: {
      description: "Save settings button",
      intentTokens: ["save", "settings", "confirm"],
      primary: { kind: "testId", value: "save-settings-btn" },
      targetType: "button",
    },
  },
};
