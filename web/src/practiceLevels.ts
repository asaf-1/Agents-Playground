// The three levels a planted fault can have, in order, with what each means.
// The Practice guide explains them, and Your progress groups the faults by
// them, so both read this one list.

// The level type, from the practice calls.
import type { Level } from "./practiceApi";

// Each level's id, its word, and what it means.
export const LEVELS: { id: Level; label: string; meaning: string }[] = [
  {
    id: "easy",
    label: "Easy",
    meaning: "shows up in the browser, on one page, as you use it.",
  },
  {
    id: "medium",
    label: "Medium",
    meaning:
      "in the browser, with care: comparing two places, timing, a second account, or reading the raw API answer.",
  },
  {
    id: "hard",
    label: "Hard",
    meaning:
      "only with requests you send yourself (the API, GraphQL, headers), or by doing two things at the same instant.",
  },
];

// The word for a level, for its pill.
export function levelLabel(level: Level): string {
  return LEVELS.find((entry) => entry.id === level)?.label ?? level;
}
