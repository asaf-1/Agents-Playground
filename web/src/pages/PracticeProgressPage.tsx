// Your progress: every planted fault as one line of a checklist, grouped by
// level, with a round tick to mark it found, an On/Off switch, and the line
// opening to show where to look, the hint and the answer. Above it: which
// faults are on, how to use the page, the count, a dot per fault, and tabs.
// The Practice guide (PracticePage.tsx) explains it all; this is where the
// hunt is done and tracked.

// React state and effects, the data cache, and the router's link.
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
// The icons: not found, found, a level's fold, Turn on all, and Start over.
import {
  ChevronDown,
  Circle,
  CircleCheckBig,
  Crosshair,
  RotateCcw,
} from "lucide-react";
// The page heading, practice mode's key and calls, and the levels.
import { PageHeader } from "../components/ui";
import { PRACTICE_KEY } from "../components/PracticeSwitch";
import {
  clearProgress,
  getPractice,
  getProgress,
  markFound,
  pickPractice,
  progressKey,
  setPractice,
  unmarkFound,
  type Level,
  type PracticeBug,
  type PracticeProgress,
} from "../practiceApi";
import { LEVELS } from "../practiceLevels";
// Who is signed in.
import { useBankSession } from "../useBankSession";

// Which faults the list shows: the ones left to find, the ones found, the
// ones switched on, or all of them.
type Show = "todo" | "found" | "on" | "all";

// The tabs, in order. To find and Found need ticks, so only an account that
// keeps them gets those two.
const SHOWS: { id: Show; label: string; needsTicks: boolean }[] = [
  { id: "todo", label: "To find", needsTicks: true },
  { id: "found", label: "Found", needsTicks: true },
  { id: "on", label: "On now", needsTicks: false },
  { id: "all", label: "All", needsTicks: false },
];

// The customer's progress as a count and a bar, or why there is none to keep.
function ProgressLine({
  canSave,
  signedIn,
  progress,
  total,
}: {
  canSave: boolean;
  signedIn: boolean;
  progress: PracticeProgress | undefined;
  /** How many faults there are; null until the list has arrived. */
  total: number | null;
}) {
  // Not signed in: how to start keeping it.
  if (!signedIn) {
    return (
      <p className="muted" data-testid="practice-progress-note">
        <Link to="/login">Log in</Link> or <Link to="/signup">sign up</Link> to
        save your progress. You can still turn faults on and off without an
        account.
      </p>
    );
  }
  // A demo account: shared, so nothing is kept.
  if (!canSave) {
    return (
      <p className="muted" data-testid="practice-progress-note">
        This is a demo account, shared by everyone, so your ticks cannot be kept
        here. <Link to="/signup">Sign up</Link> for your own account to save
        your progress.
      </p>
    );
  }
  // Their own account: how many found, as words and a bar.
  if (!progress) {
    return <p className="state">Loading your progress…</p>;
  }
  const count = progress.found.length;
  // "3 of 44 found", or only "3 found" until the list says how many there are.
  return (
    <div className="practice-progress">
      <p data-testid="practice-progress">
        <strong>{total === null ? count : `${count} of ${total}`}</strong> found
      </p>
      <div className="practice-bar" aria-hidden="true">
        <span style={{ width: `${total ? (count / total) * 100 : 0}%` }} />
      </div>
    </div>
  );
}

// What one line needs besides its fault: whether it is on, found and open,
// whether ticks are kept, whether a change is on its way, and what to do when
// a part of it is pressed.
type FaultLineProps = {
  bug: PracticeBug;
  armed: boolean;
  found: boolean;
  open: boolean;
  canSave: boolean;
  switching: boolean;
  marking: boolean;
  onToggle: () => void;
  onFound: () => void;
  onOpen: () => void;
};

// One fault as one line: the tick, the title with its kind and verdict (the
// whole of it opens the line), and the On/Off switch. Open, it shows where to
// look, the hint, and the answer behind its own button.
function FaultLine({
  bug,
  armed,
  found,
  open,
  canSave,
  switching,
  marking,
  onToggle,
  onFound,
  onOpen,
}: FaultLineProps) {
  // Whether the answer is shown.
  const [shown, setShown] = useState(false);

  return (
    <li
      id={`fault-${bug.flag}`}
      className={`bug-row${armed ? " is-armed" : ""}${found ? " is-found" : ""}${open ? " is-open" : ""}`}
      data-testid={`bug-${bug.flag}`}
    >
      <div className="bug-row-main">
        {/* The tick: one press marks it found, another takes the mark off.
            Only an account that keeps its progress gets it; the note above
            the list says why everyone else has none. */}
        {canSave ? (
          <button
            type="button"
            className="bug-tick"
            aria-pressed={found}
            aria-label={`I found it: ${bug.title}`}
            title={found ? "Found. Press to take the tick off" : "I found it"}
            data-testid={`bug-found-${bug.flag}`}
            disabled={marking}
            onClick={onFound}
          >
            {found ? (
              <CircleCheckBig aria-hidden="true" />
            ) : (
              <Circle aria-hidden="true" />
            )}
          </button>
        ) : (
          <span className="bug-tick-space" aria-hidden="true" />
        )}

        {/* The title, its kind and verdict; pressing it opens the line. */}
        <button
          type="button"
          className="bug-open"
          aria-expanded={open}
          aria-controls={`bug-details-${bug.flag}`}
          data-testid={`bug-open-${bug.flag}`}
          onClick={onOpen}
        >
          <span className="bug-row-text">
            <span className="bug-row-title">{bug.title}</span>
            <span className="bug-row-meta">
              <span className="bug-kind">{bug.kind}</span>
              <span
                className={`bug-verdict bug-${bug.verdict.toLowerCase()}`}
                data-testid={`bug-verdict-${bug.flag}`}
              >
                {bug.verdict}
              </span>
            </span>
          </span>
          <ChevronDown className="bug-open-chevron" aria-hidden="true" />
        </button>

        {/* On or off for this visitor alone. Locked while a switch is on its
            way, and while the list is not up to date. */}
        <button
          type="button"
          role="switch"
          aria-checked={armed}
          aria-label={`Live for you: ${bug.title}`}
          title={armed ? "On for you. Press to turn it off" : "Turn it on"}
          className="bug-switch"
          data-testid={`bug-toggle-${bug.flag}`}
          disabled={switching}
          onClick={onToggle}
        >
          <span className="bug-switch-track" aria-hidden="true">
            <span className="bug-switch-knob" />
          </span>
          <span className="bug-switch-text" aria-hidden="true">
            {armed ? "On" : "Off"}
          </span>
        </button>
      </div>

      {/* Opened: where to look, what to try, and the answer on request. */}
      <div
        className="bug-details"
        id={`bug-details-${bug.flag}`}
        data-testid={`bug-details-${bug.flag}`}
        hidden={!open}
      >
        <p className="bug-where">
          <strong>Where:</strong> {bug.where}
        </p>
        <p className="bug-hint">
          <strong>Try:</strong> {bug.hint}
        </p>
        <button
          type="button"
          className="btn btn-sm btn-reveal"
          aria-expanded={shown}
          data-testid={`bug-reveal-${bug.flag}`}
          onClick={() => setShown((was) => !was)}
        >
          {shown ? "Hide the answer" : "Reveal the answer"}
        </button>
        {shown && (
          <p className="bug-reveal" data-testid={`bug-answer-${bug.flag}`}>
            {bug.reveal}
          </p>
        )}
      </div>
    </li>
  );
}

// The page: which faults are on, how to use it, the count and dots, the tabs,
// then the faults by level.
export function PracticeProgressPage() {
  // The cache, who is signed in, which tab is shown, which levels are folded
  // away, which lines are open, the line a dot asked for, and whether Start
  // over is asking to be sure.
  const queryClient = useQueryClient();
  const { user } = useBankSession();
  const [show, setShow] = useState<Show>("all");
  const [folded, setFolded] = useState<Set<Level>>(() => new Set());
  const [opened, setOpened] = useState<Set<string>>(() => new Set());
  const [jumpTo, setJumpTo] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  // Is practice mode on, and which faults does it arm?
  const practice = useQuery({ queryKey: PRACTICE_KEY, queryFn: getPractice });
  // An account of one's own keeps its progress; a demo account is shared.
  const canSave = Boolean(user && !user.isDemo);
  const progress = useQuery({
    queryKey: progressKey(user?.id ?? "nobody"),
    queryFn: getProgress,
    enabled: canSave,
  });

  // Whether the page has an answer, and whether the last ask failed. With no
  // answer the page never guesses (no "off", no counts); after a failed
  // refresh it keeps the last answer and says it is not up to date.
  const loaded = practice.data !== undefined;
  const failed = practice.isError;

  // The faults, how many, which are on, and which are found.
  const bugs = practice.data?.bugs ?? [];
  const total = practice.data?.total ?? 0;
  const armed = new Set(practice.data?.armed ?? []);
  const on = practice.data?.on ?? false;
  const found = new Set((progress.data?.found ?? []).map((f) => f.flag));

  // The tabs this visitor gets, and the one in use: a tab that needs ticks
  // falls back to All when the account keeps none (after signing out).
  const shows = SHOWS.filter((entry) => canSave || !entry.needsTicks);
  const current = shows.some((entry) => entry.id === show) ? show : "all";
  // Whether a fault belongs in a tab.
  const inShow = (bug: PracticeBug, id: Show) =>
    id === "todo"
      ? !found.has(bug.flag)
      : id === "found"
        ? found.has(bug.flag)
        : id === "on"
          ? armed.has(bug.flag)
          : true;
  const shown = bugs.filter((bug) => inShow(bug, current));

  // Switch faults on or off: the server arms exactly the new set. Every
  // cached answer is then asked for again, so the pages agree with what is
  // armed.
  const pick = useMutation({
    mutationFn: (flags: string[]) => pickPractice(flags),
    onSuccess: () => queryClient.invalidateQueries(),
  });
  // One fault on or off.
  const toggleBug = (flag: string) => {
    const next = new Set(armed);
    if (next.has(flag)) next.delete(flag);
    else next.add(flag);
    pick.mutate([...next]);
  };
  // The lines shown in a level on (when any is off) or off (when all are on).
  const toggleGroup = (flags: string[]) => {
    const allOn = flags.every((flag) => armed.has(flag));
    const next = new Set(armed);
    for (const flag of flags) {
      if (allOn) next.delete(flag);
      else next.add(flag);
    }
    pick.mutate([...next]);
  };

  // Tick a fault found, or take the tick off; the answer is the new progress.
  const mark = useMutation({
    mutationFn: (flag: string) =>
      found.has(flag) ? unmarkFound(flag) : markFound(flag),
    onSuccess: (data) => {
      if (user) queryClient.setQueryData(progressKey(user.id), data);
    },
  });

  // Start over: every fault off, and the ticks cleared on an account that
  // keeps them.
  const startOver = useMutation({
    mutationFn: async () => {
      await setPractice(false);
      if (canSave) await clearProgress();
    },
    onSuccess: () => {
      setConfirming(false);
      queryClient.invalidateQueries();
    },
  });

  // Anything that went wrong while switching, ticking or starting over.
  const error = (pick.error ?? mark.error ?? startOver.error) as Error | null;

  // Open or close one line.
  const toggleOpen = (flag: string) =>
    setOpened((was) => {
      const next = new Set(was);
      if (next.has(flag)) next.delete(flag);
      else next.add(flag);
      return next;
    });
  // Fold a level away, or open it again.
  const toggleFold = (level: Level) =>
    setFolded((was) => {
      const next = new Set(was);
      if (next.has(level)) next.delete(level);
      else next.add(level);
      return next;
    });

  // A dot was pressed: show its line wherever it is (All when the tab hides
  // it, its level unfolded), open it, and go to it once it is drawn.
  const showFault = (bug: PracticeBug) => {
    if (!inShow(bug, current)) setShow("all");
    setFolded((was) => {
      const next = new Set(was);
      next.delete(bug.level);
      return next;
    });
    setOpened((was) => new Set(was).add(bug.flag));
    setJumpTo(bug.flag);
  };
  // After the line is drawn: scroll it into view and put focus on it.
  useEffect(() => {
    if (!jumpTo) return;
    const line = document.getElementById(`fault-${jumpTo}`);
    line?.scrollIntoView({ block: "center" });
    line?.querySelector<HTMLElement>(".bug-open")?.focus({
      preventScroll: true,
    });
    setJumpTo(null);
  }, [jumpTo]);

  // Ask the server again, after a failed load or refresh.
  const retry = (
    <button
      type="button"
      className="btn btn-sm"
      data-testid="practice-retry"
      disabled={practice.isFetching}
      onClick={() => practice.refetch()}
    >
      {practice.isFetching ? "Trying again…" : "Try again"}
    </button>
  );

  // The heading, the state, how to use it, the count and dots, the tabs, then
  // the faults by level.
  return (
    <section data-testid="practice-progress-page" className="page">
      <PageHeader
        eyebrow="Practice"
        title="Your progress"
        description={
          <p className="page-sub">
            Every planted fault on one list. Tick each one you catch, and the
            dots fill in as you go. New here? The{" "}
            <Link to="/practice">Practice guide</Link> explains it all.
          </p>
        }
      />

      {/* Couldn't load, with nothing to show: say so, and never guess. */}
      {!loaded && failed ? (
        <div
          className="practice-state is-failed"
          data-testid="practice-load-error"
          role="alert"
        >
          <p>
            <strong>
              Couldn't load your practice settings. Nothing was changed.
            </strong>{" "}
            The server didn't answer, so this page can't tell which faults are
            on.
          </p>
          <div className="btn-row">{retry}</div>
        </div>
      ) : (
        /* Practice mode: checking, all on, some on, or off; and, after a
           failed refresh, the last answer marked not up to date. */
        <div
          className={`practice-state ${!loaded ? "is-unknown" : armed.size > 0 ? "is-on" : "is-off"}`}
          data-testid="practice-state"
          role="status"
        >
          {!loaded ? (
            <p>
              <strong>Checking your practice settings…</strong>
            </p>
          ) : on ? (
            <p>
              <strong>Practice mode is on.</strong> All {total} faults below are
              live in your browser. Switch them off in the top bar, or one by
              one below, whenever you want the site to behave again.
            </p>
          ) : armed.size > 0 ? (
            <p>
              <strong>
                {armed.size} of {total} faults are on.
              </strong>{" "}
              Only those, switched On below, are live in your browser; the rest
              of the site behaves correctly.
            </p>
          ) : (
            <p>
              <strong>Practice mode is off.</strong> The site is behaving
              correctly. Turn every fault on from the top bar, or pick the ones
              you want below. Faults you turn on switch off when you close the
              browser, so each visit starts clean.
            </p>
          )}
          {/* A refresh failed: this is the server's last answer, and the
              switches that act on it wait until it answers again. */}
          {loaded && failed && (
            <div className="practice-stale" data-testid="practice-stale">
              <p>
                <strong>Not up to date: the server didn't answer.</strong> This
                is its last answer. The On/Off switches wait until it answers
                again.
              </p>
              {retry}
            </div>
          )}
        </div>
      )}

      {/* How to use the page: every control on it, in the order you use
          them. */}
      <div className="card card-pad progress-how" data-testid="progress-how">
        <h2>How this list works</h2>
        <ul>
          <li>
            <strong>Off/On</strong> beside a fault turns it on for you alone;{" "}
            <strong>Turn on all</strong> does a whole level. They switch off
            when you close the browser.
          </li>
          <li>
            <strong>Press a fault's line</strong> to open it: where to look,
            what to try, and <strong>Reveal the answer</strong>.
          </li>
          <li>
            <strong>The circle</strong> marks a fault you caught; press it again
            to take the tick off. The dots fill in green as you go.
          </li>
          <li>
            <strong>To find, Found, On now, All</strong> choose what the list
            shows; a level's heading folds it away.
          </li>
          <li>
            <strong>Start over</strong> turns every fault off and clears your
            ticks.
          </li>
        </ul>
      </div>

      {/* The count, Start over, and a dot per fault by level. */}
      <div
        className="card card-pad practice-progress-card"
        data-testid="practice-progress-card"
      >
        <div className="progress-card-head">
          <h2>How far you are</h2>
          {/* Start over, after a second press to be sure. */}
          {!confirming && (
            <button
              type="button"
              className="btn btn-sm"
              data-testid="practice-start-over"
              onClick={() => setConfirming(true)}
            >
              <RotateCcw aria-hidden="true" />
              Start over
            </button>
          )}
        </div>
        <ProgressLine
          canSave={canSave}
          signedIn={Boolean(user)}
          progress={progress.data}
          total={loaded ? total : null}
        />

        {/* Start over, asking first. */}
        {confirming && (
          <div className="practice-confirm" data-testid="practice-confirm">
            <p>
              Turn every fault off
              {canSave && found.size > 0
                ? ` and clear your ${found.size} ${found.size === 1 ? "tick" : "ticks"}`
                : ""}
              ?
            </p>
            <div className="btn-row">
              <button
                type="button"
                className="btn btn-primary"
                data-testid="practice-start-over-yes"
                disabled={startOver.isPending}
                onClick={() => startOver.mutate()}
              >
                {startOver.isPending ? "Starting over…" : "Yes, start over"}
              </button>
              <button
                type="button"
                className="btn"
                data-testid="practice-start-over-cancel"
                onClick={() => setConfirming(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* A dot per fault, a line per level, once the list has arrived
            (before that every count would read 0). Green is found, amber is
            on; a dot opens its fault. */}
        {loaded && (
          <div className="practice-tracker" data-testid="practice-tracker">
            {LEVELS.map((level) => {
              const inLevel = bugs.filter((bug) => bug.level === level.id);
              const foundIn = inLevel.filter((bug) => found.has(bug.flag));
              return (
                <div className="tracker-row" key={level.id}>
                  <span className={`bug-level bug-level-${level.id}`}>
                    {level.label}
                  </span>
                  <div className="tracker-dots">
                    {inLevel.map((bug) => {
                      // What the dot stands for, read out and on hover.
                      const label = `${bug.title}: ${found.has(bug.flag) ? "found" : "not found yet"}${armed.has(bug.flag) ? ", on" : ""}. Show it`;
                      return (
                        <button
                          type="button"
                          key={bug.flag}
                          className={`tracker-dot${found.has(bug.flag) ? " is-found" : ""}${armed.has(bug.flag) ? " is-armed" : ""}`}
                          data-testid={`practice-dot-${bug.flag}`}
                          aria-label={label}
                          title={label}
                          onClick={() => showFault(bug)}
                        />
                      );
                    })}
                  </div>
                  <span
                    className="tracker-count"
                    data-testid={`practice-level-count-${level.id}`}
                  >
                    {canSave
                      ? `${foundIn.length} of ${inLevel.length} found`
                      : `${inLevel.length} faults`}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* What went wrong. */}
        {error && (
          <p role="alert" className="callout" data-testid="practice-error">
            {error.message}
          </p>
        )}
      </div>

      {/* Which faults the list shows, with how many each tab holds. */}
      {loaded && (
        <div
          className="segmented progress-tabs"
          role="group"
          aria-label="Show faults"
          data-testid="practice-show"
        >
          {shows.map((entry) => (
            <button
              key={entry.id}
              type="button"
              aria-pressed={current === entry.id}
              data-testid={`practice-show-${entry.id}`}
              onClick={() => setShow(entry.id)}
            >
              {entry.label} (
              {bugs.filter((bug) => inShow(bug, entry.id)).length})
            </button>
          ))}
        </div>
      )}

      {/* Loading. */}
      {practice.isLoading && (
        <p className="muted" data-testid="practice-loading">
          Loading the list…
        </p>
      )}

      {/* The tab holds nothing: say why, rather than show an empty page. */}
      {loaded && shown.length === 0 && (
        <p className="muted" data-testid="practice-show-empty">
          {current === "todo"
            ? "Nothing left to find: you ticked every fault."
            : current === "found"
              ? "Nothing ticked yet. Press the circle beside a fault you caught."
              : current === "on"
                ? "No fault is on. Switch one On, or turn practice mode on in the top bar."
                : "No faults."}
        </p>
      )}

      {/* The faults the tab shows, a group per level: its heading folds it,
          says how many are found, and turns its lines on or off. */}
      {LEVELS.map((level) => {
        const group = shown.filter((bug) => bug.level === level.id);
        if (group.length === 0) return null;
        const inLevel = bugs.filter((bug) => bug.level === level.id);
        const foundIn = inLevel.filter((bug) => found.has(bug.flag)).length;
        const isFolded = folded.has(level.id);
        const allOn = group.every((bug) => armed.has(bug.flag));
        return (
          <div className="progress-group" key={level.id}>
            <div className="progress-group-head">
              <h2 className="section-title">
                <button
                  type="button"
                  className="progress-group-fold"
                  aria-expanded={!isFolded}
                  aria-controls={`bug-group-${level.id}`}
                  data-testid={`bug-group-fold-${level.id}`}
                  onClick={() => toggleFold(level.id)}
                >
                  <ChevronDown
                    className="progress-group-chevron"
                    aria-hidden="true"
                  />
                  {level.label}
                  <span className="progress-group-count">
                    {canSave
                      ? `${foundIn} of ${inLevel.length} found`
                      : `${inLevel.length} faults`}
                  </span>
                </button>
              </h2>
              {/* Locked while switching, and while the list is not up to
                  date: it would act on an old answer. */}
              <button
                type="button"
                className="btn btn-sm"
                data-testid={`bug-group-toggle-${level.id}`}
                disabled={pick.isPending || failed}
                onClick={() => toggleGroup(group.map((bug) => bug.flag))}
              >
                <Crosshair aria-hidden="true" />
                {allOn ? "Turn off all" : `Turn on all ${group.length}`}
              </button>
            </div>
            <ul
              className="bug-list"
              id={`bug-group-${level.id}`}
              data-testid={`bug-group-${level.id}`}
              hidden={isFolded}
            >
              {group.map((bug) => (
                <FaultLine
                  key={bug.flag}
                  bug={bug}
                  armed={armed.has(bug.flag)}
                  found={found.has(bug.flag)}
                  open={opened.has(bug.flag)}
                  canSave={canSave}
                  switching={pick.isPending || failed}
                  marking={mark.isPending}
                  onToggle={() => toggleBug(bug.flag)}
                  onFound={() => mark.mutate(bug.flag)}
                  onOpen={() => toggleOpen(bug.flag)}
                />
              ))}
            </ul>
          </div>
        );
      })}
    </section>
  );
}
