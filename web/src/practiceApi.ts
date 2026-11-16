// Practice mode: one switch that arms every planted bug for this visitor only,
// or the Practice page's own pick of them, and a signed-up customer's progress.
//
// The server tells the visitor apart by a run key in a session cookie, so the
// bugs follow them around the site and end when the browser closes. Which
// bugs are on is never stored: turn them on, practise, leave, start over next
// time. What a signed-up customer has found is stored, on their account; the
// demo accounts are shared, so theirs never is.

// The shared call helper.
import { request } from "./api";

// How a bug should be handled: filed as a fault, or healed in the test.
export type Verdict = "REPORT" | "HEAL";

// How hard a bug is to find: in the browser on one page, in the browser with
// care, or only with requests sent by hand.
export type Level = "easy" | "medium" | "hard";

// One planted bug, as the practice page lists it.
export interface PracticeBug {
  /** The runtime flag, and this row's id. */
  flag: string;
  title: string;
  where: string;
  kind: string;
  /** REPORT is a real fault to file; HEAL means the test should adapt. */
  verdict: Verdict;
  /** What to try, without giving it away. */
  hint: string;
  /** What is actually wrong, and why it is easy to miss. */
  reveal: string;
  /** How hard it is to find. */
  level: Level;
}

// Practice mode for this visitor: on (every bug) or not, their runKey, the
// bugs, and which of them are armed.
export interface PracticeState {
  on: boolean;
  runKey: string | null;
  bugs: PracticeBug[];
  total: number;
  /** The flags armed for this visitor, in catalogue order. */
  armed: string[];
}

// What the server answers when bugs are switched.
export interface PracticeToggle {
  on: boolean;
  runKey: string;
  total: number;
  armed: string[];
}

// Is practice mode on, and which bugs are armed?
export function getPractice(): Promise<PracticeState> {
  return request("/api/practice");
}

// Turn every bug on or off; the answer gives the runKey it uses.
export function setPractice(on: boolean): Promise<PracticeToggle> {
  return request("/api/practice", {
    method: "POST",
    body: JSON.stringify({ on }),
  });
}

// Arm exactly these bugs, and switch every other one off.
export function pickPractice(flags: string[]): Promise<PracticeToggle> {
  return request("/api/practice", {
    method: "POST",
    body: JSON.stringify({ flags }),
  });
}

// --- Progress: what a signed-up customer has marked found -------------------

// One fault marked found, and when.
export interface FoundFault {
  flag: string;
  foundAt: string;
}

// The customer's progress: what they found, out of how many, and whether it
// is kept (false for a shared demo account).
export interface PracticeProgress {
  found: FoundFault[];
  total: number;
  saved: boolean;
}

// The cache key for one customer's progress.
export function progressKey(userId: string) {
  return ["bank", "practice-progress", userId] as const;
}

// What the signed-in customer has found.
export function getProgress(): Promise<PracticeProgress> {
  return request("/api/bank/practice/progress");
}

// Mark one fault found.
export function markFound(flag: string): Promise<PracticeProgress> {
  return request(`/api/bank/practice/progress/${encodeURIComponent(flag)}`, {
    method: "PUT",
  });
}

// Take the mark off one fault.
export function unmarkFound(flag: string): Promise<PracticeProgress> {
  return request(`/api/bank/practice/progress/${encodeURIComponent(flag)}`, {
    method: "DELETE",
  });
}

// Clear every mark, for Start over.
export function clearProgress(): Promise<PracticeProgress> {
  return request("/api/bank/practice/progress", { method: "DELETE" });
}
