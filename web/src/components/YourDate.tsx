// Your date, in the top bar of every page: the time now and the customer's own
// calendar day, with +1 day and Back to today. Scheduled payments (Bill pay)
// run when the customer's day reaches theirs, and a card's daily limit counts
// that day, so moving it forward shows them happening now. It is per customer:
// nobody else's day moves, and a demo account stays on the real date because
// it is shared. Signed out there is no date of one's own, so nothing shows.

// React's hooks, and the data cache.
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
// The icons: the time, the date, back to today, and a date that can't move.
import { CalendarDays, CalendarOff, Clock3, History } from "lucide-react";
// The clock calls, the test's runKey, who is signed in, and the money key.
import { advanceClock, getClock, resetClock } from "../bankApi";
import { useRunKey } from "../useAppFlags";
import { useBankSession } from "../useBankSession";
import { MONEY_KEY } from "../useMoney";

// The time now in UTC as "HH:MM", and the UTC day as "YYYY-MM-DD". The bank's
// days are UTC calendar days, so the clock is in UTC too: the time and the
// date beside it always agree. Checked every second; the page redraws only
// when the minute changes, because the same text sets no new state.
function useUtcNow(): { time: string; day: string } {
  // The ISO form of now, cut to the minute: "2026-11-20T14:32".
  const read = () => new Date().toISOString().slice(0, 16);
  const [now, setNow] = useState(read);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(read()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return { time: now.slice(11, 16), day: now.slice(0, 10) };
}

// The chip: the time, the date (and how far ahead of the real date it is),
// then +1 day and Back to today, or a note for a demo account.
export function YourDate() {
  // The runKey, who is signed in, the cache, and the clock's key.
  const runKey = useRunKey();
  const { user } = useBankSession();
  const queryClient = useQueryClient();
  const clockKey = ["bank", "clock", runKey] as const;
  // The time now, and the customer's clock (only when signed in).
  const { time, day } = useUtcNow();
  const clock = useQuery({
    queryKey: clockKey,
    queryFn: () => getClock(runKey),
    enabled: Boolean(user),
  });

  // When the real day turns over at midnight UTC, ask for the date again, so
  // the chip never shows yesterday.
  const [lastDay, setLastDay] = useState(day);
  useEffect(() => {
    if (day === lastDay) return;
    setLastDay(day);
    void queryClient.invalidateQueries({ queryKey: ["bank", "clock", runKey] });
  }, [day, lastDay, queryClient, runKey]);

  // Refresh the clock, then every money query: bills and card limits may
  // have changed when the day moved.
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: clockKey });
    await queryClient.invalidateQueries({ queryKey: MONEY_KEY });
  };
  // Move a day forward, or back to the real date.
  const advance = useMutation({
    mutationFn: () => advanceClock(1, runKey),
    onSuccess: refresh,
  });
  const reset = useMutation({
    mutationFn: () => resetClock(runKey),
    onSuccess: refresh,
  });

  // Signed out: no date of one's own.
  if (!user) return null;

  // Demo accounts can't move it; how far ahead it is; any error from moving.
  const canMove = !user.isDemo;
  const offset = clock.data?.offsetDays ?? 0;
  const ahead = offset > 0;
  const error = (advance.error ?? reset.error) as Error | null;
  const busy = advance.isPending || reset.isPending;

  // What the date means, for the tooltip.
  const dateTitle = !clock.data
    ? "Your date: loading"
    : ahead
      ? `Your date is ${clock.data.today}, ${offset} ${offset === 1 ? "day" : "days"} ahead of the real date, ${clock.data.realToday}. Scheduled payments and card limits follow it.`
      : `Your date is ${clock.data.today}, the real date. Scheduled payments and card limits follow it.`;

  // The chip, then, after a failed move, the message under it.
  return (
    <span className="your-date-wrap">
      <span
        className={`your-date${ahead ? " is-ahead" : ""}`}
        data-testid="your-date"
        role="group"
        aria-label="Your date"
      >
        {/* The time now, in UTC. */}
        <span
          className="your-date-time"
          data-testid="your-date-time"
          title="The time now, in UTC. The bank's day turns over at midnight UTC."
        >
          <Clock3 aria-hidden="true" />
          <time dateTime={`${day}T${time}Z`}>{time}</time>
          <span className="your-date-utc">UTC</span>
        </span>

        {/* The customer's date, and how far ahead of the real date it is. */}
        <span
          className="your-date-day"
          data-testid="clock-today"
          title={dateTitle}
        >
          <CalendarDays aria-hidden="true" />
          {clock.data ? clock.data.today : "…"}
          {ahead ? (
            <span className="your-date-offset" data-testid="clock-offset">
              +{offset} {offset === 1 ? "day" : "days"}
            </span>
          ) : (
            clock.data && <span className="sr-only">, the real date</span>
          )}
        </span>

        {/* +1 day and Back to today, or why a demo account can't move it. */}
        {canMove ? (
          <>
            <button
              type="button"
              className="your-date-btn"
              data-testid="clock-advance"
              disabled={busy || !clock.data}
              onClick={() => advance.mutate()}
              title="Move your date forward one day. Scheduled payments that fall due are paid."
            >
              {advance.isPending ? "Moving…" : "+1 day"}
            </button>
            {ahead && (
              <button
                type="button"
                className="your-date-btn your-date-reset"
                data-testid="clock-reset"
                disabled={busy}
                onClick={() => reset.mutate()}
                aria-label="Back to today"
                title="Back to the real date"
              >
                <History aria-hidden="true" />
              </button>
            )}
          </>
        ) : (
          <span
            className="your-date-fixed"
            data-testid="clock-note"
            title="Demo accounts stay on the real date, because they are shared. Sign up to move your own."
          >
            <CalendarOff aria-hidden="true" />
            <span className="your-date-fixed-text" aria-hidden="true">
              Demo: fixed
            </span>
            <span className="sr-only">
              Demo accounts stay on the real date, because they are shared. Sign
              up to move your own.
            </span>
          </span>
        )}
      </span>

      {/* What went wrong, read out by screen readers. */}
      {error && (
        <span
          role="alert"
          className="your-date-error"
          data-testid="clock-error"
        >
          {error.message}
        </span>
      )}
    </span>
  );
}
