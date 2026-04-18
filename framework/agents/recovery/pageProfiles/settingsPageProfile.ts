import type { PageProfile } from "./types";

export type SettingsActionKey = "selectTheme" | "saveSettings";

export const settingsPageProfile: PageProfile<SettingsActionKey> = {
  pageLabel: "Settings",
  actions: {
    selectTheme: {
      description: "Theme select",
      intentTokens: ["theme", "appearance", "settings"],
      primary: { kind: "testId", value: "settings-theme" },
      targetType: "select"
    },
    saveSettings: {
      description: "Save settings button",
      intentTokens: ["save", "settings", "confirm"],
      primary: { kind: "testId", value: "save-settings-btn" },
      targetType: "button"
    }
  }
};
