import type { PageProfile } from "./types";

export type ProfileActionKey = "editProfile" | "saveProfile";

export const profilePageProfile: PageProfile<ProfileActionKey> = {
  pageLabel: "Profile",
  actions: {
    editProfile: {
      description: "Edit profile button",
      intentTokens: ["edit", "profile", "update"],
      primary: { kind: "testId", value: "edit-profile-btn" },
      targetType: "button",
    },
    saveProfile: {
      description: "Save profile button",
      intentTokens: ["save", "profile", "confirm"],
      primary: { kind: "testId", value: "save-profile-btn" },
      targetType: "button",
    },
  },
};
