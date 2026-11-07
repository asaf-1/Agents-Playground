// Practice mode: one switch that arms every planted bug for this visitor only.
//
// The server tells the visitor apart by a run key in a session cookie, so the
// bugs follow them around the site and end when the browser closes. Nothing is
// stored: turn it on, practise, leave, start over next time.

// The shared call helper.
import { request } from "./api";

// How a bug should be handled: filed as a fault, or healed in the test.
export type Verdict = "REPORT" | "HEAL";

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
}

// Practice mode for this visitor: on or off, their runKey, and the bugs it
// arms.
export interface PracticeState {
  on: boolean;
  runKey: string | null;
  bugs: PracticeBug[];
  total: number;
}

// Is practice mode on, and which bugs does it arm?
export function getPractice(): Promise<PracticeState> {
  return request("/api/practice");
}

// Turn practice mode on or off; the answer gives the runKey it uses.
export function setPractice(
  on: boolean,
): Promise<{ on: boolean; runKey: string; total: number }> {
  return request("/api/practice", {
    method: "POST",
    body: JSON.stringify({ on }),
  });
}
