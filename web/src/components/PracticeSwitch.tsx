// The Practice mode switch in the top bar.

// The data cache, the bug icon, and the practice-mode calls.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bug } from "lucide-react";
import { getPractice, setPractice } from "../practiceApi";

// The cache key for practice mode.
export const PRACTICE_KEY = ["practice"] as const;

// The switch in the top bar. On, every planted bug is armed for this visitor
// and nobody else; off, the site is clean.
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

  // Off until the server says otherwise.
  const on = practice.data?.on ?? false;

  // Flip it, then clear the cache and reload the page.
  const toggling = useMutation({
    mutationFn: () => setPractice(!on),
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
      className={`practice-switch${on ? " is-on" : ""}`}
      role="switch"
      aria-checked={on}
      aria-label="Practice mode"
      data-testid="practice-switch"
      disabled={practice.isLoading || toggling.isPending}
      onClick={() => toggling.mutate()}
      title={
        on
          ? "Practice mode is on: every planted bug is live for you"
          : "Practice mode is off: the site behaves correctly"
      }
    >
      <Bug aria-hidden="true" />
      <span className="practice-switch-text">
        Practice mode <strong>{on ? "on" : "off"}</strong>
      </span>
    </button>
  );
}
