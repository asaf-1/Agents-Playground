import type { LocatorTargetType } from "../types";

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

export type PageActionProfile = {
  description: string;
  intentTokens: string[];
  primary: PrimaryLocatorProfile;
  targetType: LocatorTargetType;
  timeoutMs?: number;
};

export type PageProfile<TActionKey extends string = string> = {
  actions: Record<TActionKey, PageActionProfile>;
  pageLabel: string;
};
