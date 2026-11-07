// The Profile page's actions, for the healing page object in
// pom/ProfilePage.ts.

// The shape of a page profile.
import type { PageProfile } from "./types";

// The names of the page's actions.
export type ProfileActionKey = "editProfile" | "saveProfile";

// Each action: its first locator, and the words the healer looks for when that
// locator fails.
export const profilePageProfile: PageProfile<ProfileActionKey> = {
  pageLabel: "Profile",
  actions: {
    // Starts editing the profile.
    editProfile: {
      description: "Edit profile button",
      intentTokens: ["edit", "profile", "update"],
      primary: { kind: "testId", value: "edit-profile-btn" },
      targetType: "button",
    },
    // Saves the profile.
    saveProfile: {
      description: "Save profile button",
      intentTokens: ["save", "profile", "confirm"],
      primary: { kind: "testId", value: "save-profile-btn" },
      targetType: "button",
    },
  },
};
