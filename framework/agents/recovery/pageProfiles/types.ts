// The shapes of a page profile: for each action a page offers, how to find its
// control first and which words describe it, so the healer can find it again
// when the first way fails.

// The kinds of control the healer knows: button, link, input, select...
import type { LocatorTargetType } from "../types";

// How to find a control first: by role and name, by CSS selector, or by
// data-testid.
export type PrimaryLocatorProfile =
  | {
      kind: "role";
      name: string;
      role: string;
    }
  | {
      kind: "selector";
      value: string;
    }
  | {
      kind: "testId";
      value: string;
    };

// One action on a page: a description, the words for what it does, its first
// locator, the kind of control, and how long to wait before healing.
export type PageActionProfile = {
  description: string;
  intentTokens: string[];
  primary: PrimaryLocatorProfile;
  targetType: LocatorTargetType;
  timeoutMs?: number;
};

// A page: its label and its actions by name.
export type PageProfile<TActionKey extends string = string> = {
  actions: Record<TActionKey, PageActionProfile>;
  pageLabel: string;
};
