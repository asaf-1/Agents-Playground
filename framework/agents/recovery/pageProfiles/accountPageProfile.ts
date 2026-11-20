// The sign-in status page's actions (/app/account): the back-office sign-in
// form and Sign out, for the healing page object in pom/AccountPage.ts.

// The shape of a page profile.
import type { PageProfile } from "./types";

// The names of the page's actions.
export type AccountPageActionKey = "email" | "password" | "signIn" | "signOut";

// Each action: its first locator, and the words the healer looks for when that
// locator fails.
export const accountPageProfile: PageProfile<AccountPageActionKey> = {
  pageLabel: "Sign-in status",
  actions: {
    // The back-office email field.
    email: {
      description: "Back-office email field",
      intentTokens: ["email"],
      primary: {
        kind: "testId",
        value: "backoffice-email",
      },
      targetType: "input",
    },
    // The back-office password field.
    password: {
      description: "Back-office password field",
      intentTokens: ["password"],
      primary: {
        kind: "testId",
        value: "backoffice-password",
      },
      targetType: "input",
    },
    // Sign in to the back office.
    signIn: {
      description: "Sign in to the back office button",
      intentTokens: ["sign", "in", "back", "office"],
      primary: {
        kind: "testId",
        value: "backoffice-submit",
      },
      targetType: "button",
    },
    // Sign out of the back office.
    signOut: {
      description: "Back-office Sign out button",
      intentTokens: ["sign", "out"],
      primary: {
        kind: "testId",
        value: "backoffice-signout",
      },
      targetType: "button",
    },
  },
};
