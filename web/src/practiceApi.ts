// Practice mode: one switch that arms every planted bug for this visitor only.
//
// The server tells the visitor apart by a run key in a session cookie, so the
// bugs follow them around the site and end when the browser closes. Nothing is
// stored: turn it on, practise, leave, start over next time.
import { request } from "./api";

export type Verdict = "REPORT" | "HEAL";

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

export interface PracticeState {
  on: boolean;
  runKey: string | null;
  bugs: PracticeBug[];
  total: number;
}

export function getPractice(): Promise<PracticeState> {
  return request("/api/practice");
}

export function setPractice(
  on: boolean,
): Promise<{ on: boolean; runKey: string; total: number }> {
  return request("/api/practice", {
    method: "POST",
    body: JSON.stringify({ on }),
  });
}
