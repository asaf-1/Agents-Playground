// The login page's actions, for the healing page object in pom/LoginPage.ts.

// The shape of a page profile.
import type { PageProfile } from "./types";

// The names of the page's actions.
export type LoginActionKey = "email" | "password" | "submit";

// Each action: its first locator, and the words the healer looks for when that
// locator fails.
export const loginPageProfile: PageProfile<LoginActionKey> = {
  pageLabel: "Login",
  actions: {
    // The email field.
    email: {
      description: "Email field",
      intentTokens: ["email", "username", "login"],
      primary: { kind: "testId", value: "login-email" },
      targetType: "input",
    },
    // The password field.
    password: {
      description: "Password field",
      intentTokens: ["password", "secret", "login"],
      primary: { kind: "testId", value: "login-password" },
      targetType: "input",
    },
    // Primary is the role+name locator on purpose: when the loginSubmitLabel drift renames
    // the button to "Authenticate", this stale "Sign In" locator fails and the healer recovers
    // via the intent tokens (which include "authenticate").
    submit: {
      description: "Sign in button",
      intentTokens: ["sign in", "log in", "submit", "authenticate"],
      primary: { kind: "role", role: "button", name: "Sign In" },
      targetType: "button",
    },
  },
};
