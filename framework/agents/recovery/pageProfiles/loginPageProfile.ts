import type { PageProfile } from "./types";

export type LoginActionKey = "email" | "password" | "submit";

export const loginPageProfile: PageProfile<LoginActionKey> = {
  pageLabel: "Login",
  actions: {
    email: {
      description: "Email field",
      intentTokens: ["email", "username", "login"],
      primary: { kind: "testId", value: "login-email" },
      targetType: "input"
    },
    password: {
      description: "Password field",
      intentTokens: ["password", "secret", "login"],
      primary: { kind: "testId", value: "login-password" },
      targetType: "input"
    },
    // Primary is the role+name locator on purpose: when the loginSubmitLabel drift renames
    // the button to "Authenticate", this stale "Sign In" locator fails and the healer recovers
    // via the intent tokens (which include "authenticate").
    submit: {
      description: "Sign in button",
      intentTokens: ["sign in", "log in", "submit", "authenticate"],
      primary: { kind: "role", role: "button", name: "Sign In" },
      targetType: "button"
    }
  }
};
