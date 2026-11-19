// The Practice mode switch in the top bar.

// The data cache, the bug icon, and the practice-mode calls.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bug } from "lucide-react";
import { getPractice, setPractice } from "../practiceApi";

// The cache key for practice mode.
export const PRACTICE_KEY = ["practice"] as const;

// The switch in the top bar. On, every planted bug is armed for this visitor
// and nobody else; off, the site is clean. When the Practice page has armed
// only some, it says how many, and a press turns them all off.
//
// Turning it either way reloads the page. Half of the bugs change what the
// server answers, and the pages already hold cached answers from before the
// switch, so a reload is the honest way to make the whole site agree.
export function PracticeSwitch() {
  // Ask whether practice mode is on; the answer is kept for 10 seconds.
  const queryClient = useQueryClient();
  const practice = useQuery({
    queryKey: PRACTICE_KEY,
    queryFn: getPractice,
    staleTime: 10_000,
  });

  // The switch knows the state only when an answer came and the last check
  // didn't fail. Until then it is locked, so a press never acts on a guess:
  // before this, a failed check read as "off", and a press turned every bug on.
  const known = practice.data !== undefined && !practice.isError;
  // Some are on when the Practice page picked a few; all are on when every bug
  // is armed.
  const armed = practice.data?.armed.length ?? 0;
  const all = practice.data?.on ?? false;
  const any = armed > 0;
  // The word in the switch: checking while the first answer is on its way,
  // unknown when the server didn't answer, otherwise on, how many, or off.
  const state = practice.isPending
    ? "checking"
    : !known
      ? "unknown"
      : all
        ? "on"
        : any
          ? `${armed} on`
          : "off";

  // Any on: switch them all off. None on: switch them all on. Then clear the
  // cache and reload the page. The way it was pressed (on or off) is kept, for
  // the message if it fails.
  const toggling = useMutation({
    mutationFn: (turnOn: boolean) => setPractice(turnOn),
    onSuccess: () => {
      queryClient.invalidateQueries();
      window.location.reload();
    },
  });
  // A failed press: the switch keeps its last confirmed state, and this says
  // so until the next press.
  const failure = toggling.isError
    ? `Couldn't turn practice mode ${toggling.variables ? "on" : "off"}. Try again.`
    : null;

  // The tooltip: what the state means, or why the switch is locked.
  const title = practice.isPending
    ? "Practice mode: checking whether it is on"
    : !known
      ? "Practice mode: the server didn't answer, so it isn't known whether any bugs are on. Reload the page to try again"
      : all
        ? "Practice mode is on: every planted bug is live for you"
        : any
          ? `Practice mode: ${armed} of ${practice.data?.total ?? 0} planted bugs are live for you. Press to turn them all off`
          : "Practice mode is off: the site behaves correctly";

  // A switch for screen readers, locked while it checks, while the state is
  // unknown, or while it flips; then, after a failed press, the message under
  // it, read out by screen readers.
  return (
    <span className="practice-switch-wrap">
      <button
        type="button"
        className={`practice-switch${known && any ? " is-on" : ""}${practice.isError ? " is-unknown" : ""}`}
        role="switch"
        aria-checked={any}
        aria-label="Practice mode"
        data-testid="practice-switch"
        disabled={!known || toggling.isPending}
        onClick={() => toggling.mutate(!any)}
        title={title}
      >
        <Bug aria-hidden="true" />
        <span className="practice-switch-text">
          Practice mode{" "}
          <strong data-testid="practice-switch-state">{state}</strong>
        </span>
      </button>
      {failure && (
        <span
          role="alert"
          className="practice-switch-error"
          data-testid="practice-switch-error"
        >
          {failure}
        </span>
      )}
    </span>
  );
}
