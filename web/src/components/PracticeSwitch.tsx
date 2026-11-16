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

  // Off until the server says otherwise. Some are on when the Practice page
  // picked a few; all are on when every bug is armed.
  const armed = practice.data?.armed.length ?? 0;
  const all = practice.data?.on ?? false;
  const any = armed > 0;
  // The word in the switch: on, how many are on, or off.
  const state = all ? "on" : any ? `${armed} on` : "off";

  // Any on: switch them all off. None on: switch them all on. Then clear the
  // cache and reload the page.
  const toggling = useMutation({
    mutationFn: () => setPractice(!any),
    onSuccess: () => {
      queryClient.invalidateQueries();
      window.location.reload();
    },
  });

  // A switch for screen readers, locked while it loads or flips, with a tooltip
  // that says what it means.
  return (
    <button
      type="button"
      className={`practice-switch${any ? " is-on" : ""}`}
      role="switch"
      aria-checked={any}
      aria-label="Practice mode"
      data-testid="practice-switch"
      disabled={practice.isLoading || toggling.isPending}
      onClick={() => toggling.mutate()}
      title={
        all
          ? "Practice mode is on: every planted bug is live for you"
          : any
            ? `Practice mode: ${armed} of ${practice.data?.total ?? 0} planted bugs are live for you. Press to turn them all off`
            : "Practice mode is off: the site behaves correctly"
      }
    >
      <Bug aria-hidden="true" />
      <span className="practice-switch-text">
        Practice mode{" "}
        <strong data-testid="practice-switch-state">{state}</strong>
      </span>
    </button>
  );
}
