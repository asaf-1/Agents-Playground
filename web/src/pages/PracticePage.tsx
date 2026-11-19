// The Practice page: the planted bugs to hunt, how to use the page, which
// bugs are on, the customer's progress, and the customer's own clock.

// React state, the data cache, and the router's link.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
// The icons: turn a bug on, I found it, Start over, and the progress cup.
import { CircleCheckBig, Crosshair, RotateCcw, Trophy } from "lucide-react";
// The clock calls, the page heading, and practice mode's key and calls.
import { advanceClock, getClock, resetClock } from "../bankApi";
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
// The test's runKey, who is signed in, and the money key.
import { useRunKey } from "../useAppFlags";
import { useBankSession } from "../useBankSession";
import { MONEY_KEY } from "../useMoney";

// The three levels, in order, with what each means. The page's instructions
// and its filter both read this list.
const LEVELS: { id: Level; label: string; meaning: string }[] = [
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
function levelLabel(level: Level): string {
  return LEVELS.find((entry) => entry.id === level)?.label ?? level;
}

// The customer's own calendar. Scheduled payments (Bill pay) run when the
// customer's day reaches theirs, so moving it forward shows a payment due
// tomorrow happening now. It is per customer: nobody else's day moves, and a
// demo account stays on the real date because it is shared.
function ClockCard() {
  // The runKey, who is signed in, the cache, and the clock's key.
  const runKey = useRunKey();
  const { user } = useBankSession();
  const queryClient = useQueryClient();
  const clockKey = ["bank", "clock", runKey] as const;
  // The customer's clock.
  const clock = useQuery({
    queryKey: clockKey,
    queryFn: () => getClock(runKey),
    enabled: Boolean(user),
  });
  // Refresh the clock, then every money query.
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: clockKey });
    // Money, bills and schedules may all have changed when the day moved.
    await queryClient.invalidateQueries({ queryKey: MONEY_KEY });
  };
  // Move a day forward, or back to today.
  const advance = useMutation({
    mutationFn: () => advanceClock(1, runKey),
    onSuccess: refresh,
  });
  const reset = useMutation({
    mutationFn: () => resetClock(runKey),
    onSuccess: refresh,
  });
  // Demo accounts can't move the clock; any error from moving it.
  const canMove = Boolean(user && !user.isDemo);
  const error = (advance.error ?? reset.error) as Error | null;

  // The card: a sign-in note, or today's date, how it works, the buttons and
  // any error.
  return (
    <div className="card card-pad" data-testid="clock-card" id="clock">
      <h2>Your clock</h2>
      {/* Signed out: a note. */}
      {!user && (
        <p className="muted" data-testid="clock-note">
          Log in to see your own calendar. Scheduled payments on{" "}
          <Link to="/bank/bills">Bill pay</Link> run on it.
        </p>
      )}
      {/* Today for them, the real date, and the buttons. */}
      {user && clock.data && (
        <>
          {/* Today, and how far it is ahead of the real date. */}
          <p data-testid="clock-today">
            Today for you is <strong>{clock.data.today}</strong>
            {clock.data.offsetDays > 0 ? (
              <>
                ,{" "}
                <span data-testid="clock-offset">
                  {clock.data.offsetDays}{" "}
                  {clock.data.offsetDays === 1 ? "day" : "days"} ahead
                </span>{" "}
                of the real date, {clock.data.realToday}.
              </>
            ) : (
              <>, the real date.</>
            )}
          </p>
          <p className="muted">
            Scheduled payments on <Link to="/bank/bills">Bill pay</Link> are
            paid when your day reaches theirs. Move it forward to watch one
            happen now; nobody else's calendar moves.
          </p>
          {/* Advance a day and Back to today, or a note for demo accounts. */}
          {canMove ? (
            <div className="btn-row">
              <button
                type="button"
                className="btn btn-primary"
                data-testid="clock-advance"
                disabled={advance.isPending}
                onClick={() => advance.mutate()}
              >
                {advance.isPending ? "Moving…" : "Advance a day"}
              </button>
              <button
                type="button"
                className="btn btn-sm"
                data-testid="clock-reset"
                disabled={reset.isPending || clock.data.offsetDays === 0}
                onClick={() => reset.mutate()}
              >
                Back to today
              </button>
            </div>
          ) : (
            <p className="muted" data-testid="clock-note">
              Demo accounts stay on the real date, because they are shared. Sign
              up to move your own clock.
            </p>
          )}
          {/* What went wrong. */}
          {error && (
            <p role="alert" className="callout" data-testid="clock-error">
              {error.message}
            </p>
          )}
        </>
      )}
    </div>
  );
}

// What a bug card needs besides the bug: whether it is on and found, whether
// ticks can be saved, what to do when a button is pressed, and whether a
// change is on its way (the buttons wait for it).
type BugCardProps = {
  bug: PracticeBug;
  armed: boolean;
  found: boolean;
  canSave: boolean;
  switching: boolean;
  marking: boolean;
  onToggle: () => void;
  onFound: () => void;
};

// One bug: its level and verdict, whether it is live, where to go, what to
// try, Turn on or off, a reveal you open only when you want to stop guessing,
// and I found it for an account that keeps its progress.
function BugCard({
  bug,
  armed,
  found,
  canSave,
  switching,
  marking,
  onToggle,
  onFound,
}: BugCardProps) {
  // Whether the answer is shown.
  const [shown, setShown] = useState(false);

  // The card: title and verdict, the tags, where, the hint, the buttons, and
  // the answer when it is shown.
  return (
    <li
      className={`card card-pad bug-card${armed ? " is-armed" : ""}${found ? " is-found" : ""}`}
      data-testid={`bug-${bug.flag}`}
    >
      <div className="bug-head">
        <h3>{bug.title}</h3>
        <span
          className={`bug-verdict bug-${bug.verdict.toLowerCase()}`}
          data-testid={`bug-verdict-${bug.flag}`}
        >
          {bug.verdict}
        </span>
      </div>

      {/* Its level, and Live while it is switched on. */}
      <div className="bug-tags">
        <span
          className={`bug-level bug-level-${bug.level}`}
          data-testid={`bug-level-${bug.flag}`}
        >
          {levelLabel(bug.level)}
        </span>
        {armed && (
          <span className="bug-live" data-testid={`bug-live-${bug.flag}`}>
            Live
          </span>
        )}
        {found && (
          <span
            className="bug-found-tag"
            data-testid={`bug-found-tag-${bug.flag}`}
          >
            Found
          </span>
        )}
      </div>

      <p className="bug-where">
        <strong>Where:</strong> {bug.where}
      </p>
      <p className="bug-hint">{bug.hint}</p>

      {/* Turn it on or off, show the answer, and tick it found. */}
      <div className="bug-actions">
        <button
          type="button"
          className={`btn btn-sm${armed ? " btn-armed" : ""}`}
          aria-pressed={armed}
          data-testid={`bug-toggle-${bug.flag}`}
          disabled={switching}
          onClick={onToggle}
        >
          <Crosshair aria-hidden="true" />
          {armed ? "Turn off" : "Turn on"}
        </button>
        <button
          type="button"
          className="btn btn-sm btn-reveal"
          aria-expanded={shown}
          data-testid={`bug-reveal-${bug.flag}`}
          onClick={() => setShown((was) => !was)}
        >
          {shown ? "Hide the answer" : "Reveal the answer"}
        </button>
        {/* Only an account that keeps its progress gets the tick; everyone
            else is told why in the progress card. */}
        {canSave && (
          <button
            type="button"
            className={`btn btn-sm${found ? " btn-found" : ""}`}
            aria-pressed={found}
            data-testid={`bug-found-${bug.flag}`}
            disabled={marking}
            onClick={onFound}
          >
            <CircleCheckBig aria-hidden="true" />
            {found ? "Found" : "I found it"}
          </button>
        )}
      </div>

      {shown && (
        <p className="bug-reveal" data-testid={`bug-answer-${bug.flag}`}>
          {bug.reveal}
        </p>
      )}
    </li>
  );
}

// The statement every visitor reads: only an account of one's own keeps
// progress. Shown in the instructions, word for word as Asaf asked, with a
// link to sign up for anyone whose ticks are not kept (a visitor, or a demo
// account), and a line saying so for a customer whose ticks are.
function SaveNote({ canSave }: { canSave: boolean }) {
  return (
    <p className="practice-save-note" data-testid="practice-save-note">
      <strong>Progress is saved only on an account you sign up for.</strong> The
      demo accounts are shared by everyone, so they, like visitors who are not
      signed in, can turn faults on and off, but their ticks are not kept.{" "}
      {canSave ? (
        <span data-testid="practice-save-yours">
          This is your own account, so your ticks are kept.
        </span>
      ) : (
        <>
          <Link to="/signup" data-testid="practice-save-signup">
            Sign up for your own account
          </Link>{" "}
          to keep yours.
        </>
      )}
    </p>
  );
}

// The warning every visitor reads before making an account of their own
// (feedback-fixes plan, Part 4): the demo staff log-ins are public, and by
// design staff can see a signed-up customer and change their role, status and
// cards. Shown to everyone, whoever is signed in. The bank sends no email at
// all (checked 2026-11-16), so the last sentence is true.
function OwnAccountNote() {
  return (
    <p className="practice-save-note" data-testid="practice-own-account-note">
      <strong>Other visitors can see and change your own account.</strong>{" "}
      Anyone can sign in as the demo staff, Alex (Admin) and Sam (Support). They
      can see your name, email, profile, accounts and cards, and the Admin can
      change your role, lock your account or freeze your cards. Use a made-up
      name and an email you don't mind others seeing; nothing is ever sent to
      it.
    </p>
  );
}

// The customer's progress, or why there is none to keep.
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

// What to practise on, and what each planted bug actually is once you give up.
export function PracticePage() {
  // The cache, who is signed in, which level is shown, and whether Start over
  // is asking to be sure.
  const queryClient = useQueryClient();
  const { user } = useBankSession();
  const [level, setLevel] = useState<Level | "all">("all");
  const [confirming, setConfirming] = useState(false);

  // Is practice mode on, and which bugs does it arm?
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

  // The bugs, how many, which are on, and which are found.
  const bugs = practice.data?.bugs ?? [];
  const total = practice.data?.total ?? 0;
  const armed = new Set(practice.data?.armed ?? []);
  const on = practice.data?.on ?? false;
  const found = new Set((progress.data?.found ?? []).map((f) => f.flag));

  // The bugs at the level picked, grouped by family, so the page reads as
  // kinds of fault rather than a list.
  const shown = level === "all" ? bugs : bugs.filter((b) => b.level === level);
  const kinds = [...new Set(shown.map((bug) => bug.kind))];

  // Switch bugs on or off: the server arms exactly the new set. Every cached
  // answer is then asked for again, so the pages agree with what is armed.
  const pick = useMutation({
    mutationFn: (flags: string[]) => pickPractice(flags),
    onSuccess: () => queryClient.invalidateQueries(),
  });
  // One bug on or off.
  const toggleBug = (flag: string) => {
    const next = new Set(armed);
    if (next.has(flag)) next.delete(flag);
    else next.add(flag);
    pick.mutate([...next]);
  };
  // A whole group on (when any of it is off) or off (when all of it is on).
  const toggleGroup = (flags: string[]) => {
    const allOn = flags.every((flag) => armed.has(flag));
    const next = new Set(armed);
    for (const flag of flags) {
      if (allOn) next.delete(flag);
      else next.add(flag);
    }
    pick.mutate([...next]);
  };

  // Tick a bug found, or take the tick off; the answer is the new progress.
  const mark = useMutation({
    mutationFn: (flag: string) =>
      found.has(flag) ? unmarkFound(flag) : markFound(flag),
    onSuccess: (data) => {
      if (user) queryClient.setQueryData(progressKey(user.id), data);
    },
  });

  // Start over: every bug off, and the ticks cleared on an account that keeps
  // them.
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

  // The heading, the state, how to use it, the progress and controls, the
  // clock, then the bugs by kind.
  return (
    <section data-testid="practice-page" className="page">
      <PageHeader
        eyebrow="Practice"
        title="Practice guide"
        description={
          <p className="page-sub">
            {loaded ? `${total} faults are` : "Faults are"} planted in this site
            on purpose. Turn them all on, or only the ones you want to practise,
            and they come alive for you alone. Nobody else browsing the site
            sees any of them.
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
              Only those, marked Live below, are live in your browser; the rest
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
              buttons that act on it wait until it answers again. */}
          {loaded && failed && (
            <div className="practice-stale" data-testid="practice-stale">
              <p>
                <strong>Not up to date: the server didn't answer.</strong> This
                is its last answer. Turn on and Turn off wait until it answers
                again.
              </p>
              {retry}
            </div>
          )}
        </div>
      )}

      {/* How to use the page: every control, in the order you use them. */}
      <div className="card card-pad practice-how" data-testid="practice-how">
        <h2>How to use this</h2>
        <ol>
          <li>
            <strong>Choose what to hunt.</strong> Practice mode in the top bar
            turns on {loaded ? `all ${total} faults` : "every fault"} at once.
            To practise only some, press <strong>Turn on</strong> on a fault, or{" "}
            <strong>Turn on all</strong> beside a group. Only you see them, and
            they switch off when you close the browser.
          </li>
          <li>
            <strong>Pick a level.</strong> Every fault is marked Easy, Medium or
            Hard (what each means is below), and the filter in Your progress
            shows one level at a time.
          </li>
          <li>
            <strong>Go and look.</strong> Open the page in <em>Where</em>,
            follow the hint, and try to catch the fault without reading the
            answer.
          </li>
          <li>
            <strong>Check yourself.</strong> Press{" "}
            <strong>Reveal the answer</strong> when you think you have it, or
            when you are stuck.
          </li>
          <li>
            <strong>Tick it off.</strong> Press <strong>I found it</strong> on
            each fault you catch. Your progress counts them, and the tick is
            your own word: the site cannot tell that you found it.
          </li>
          <li>
            <strong>Start over</strong> whenever you like: it turns every fault
            off and, on your own account, clears your ticks.
          </li>
        </ol>

        {/* What the levels mean. */}
        <dl className="practice-levels" data-testid="practice-levels">
          {LEVELS.map((entry) => (
            <div key={entry.id}>
              <dt>
                <span className={`bug-level bug-level-${entry.id}`}>
                  {entry.label}
                </span>
              </dt>
              <dd>{entry.meaning}</dd>
            </div>
          ))}
        </dl>

        <p className="muted">
          Most are marked <strong>REPORT</strong>: a real fault you would raise
          against the site. One is marked <strong>HEAL</strong> — nothing is
          broken for a person, and it is the test that should adapt. Telling
          those two apart is the skill worth practising.
        </p>

        <SaveNote canSave={canSave} />
        <OwnAccountNote />
      </div>

      {/* The customer's clock. */}
      <ClockCard />

      {/* The customer's progress, the level filter and Start over, right
          above the faults the filter shows. */}
      <div
        className="card card-pad practice-progress-card"
        data-testid="practice-progress-card"
      >
        <h2>
          <Trophy aria-hidden="true" />
          Your progress
        </h2>
        <ProgressLine
          canSave={canSave}
          signedIn={Boolean(user)}
          progress={progress.data}
          total={loaded ? total : null}
        />

        {/* Show one level, or all of them, once the list has arrived (before
            that its counts would all read 0). */}
        {loaded && (
          <div
            className="segmented"
            role="group"
            aria-label="Show faults by level"
            data-testid="practice-level-filter"
          >
            {(["all", ...LEVELS.map((entry) => entry.id)] as const).map(
              (id) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={level === id}
                  data-testid={`practice-level-${id}`}
                  onClick={() => setLevel(id)}
                >
                  {id === "all" ? "All" : levelLabel(id)} (
                  {id === "all"
                    ? bugs.length
                    : bugs.filter((b) => b.level === id).length}
                  )
                </button>
              ),
            )}
          </div>
        )}

        {/* Start over, after a second press to be sure. */}
        {confirming ? (
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
        ) : (
          <button
            type="button"
            className="btn"
            data-testid="practice-start-over"
            onClick={() => setConfirming(true)}
          >
            <RotateCcw aria-hidden="true" />
            Start over
          </button>
        )}

        {/* What went wrong. */}
        {error && (
          <p role="alert" className="callout" data-testid="practice-error">
            {error.message}
          </p>
        )}
      </div>

      {/* Loading. */}
      {practice.isLoading && (
        <p className="muted" data-testid="practice-loading">
          Loading the list…
        </p>
      )}

      {/* Each kind of bug at the level shown, with Turn on all and its cards. */}
      {kinds.map((kind) => {
        const group = shown.filter((bug) => bug.kind === kind);
        const allOn = group.every((bug) => armed.has(bug.flag));
        return (
          <div key={kind}>
            <div className="practice-group-head">
              <h2 className="section-title">{kind}</h2>
              {/* Locked while switching, and while the list is not up to
                  date: it would act on an old answer. */}
              <button
                type="button"
                className="btn btn-sm"
                data-testid={`bug-group-toggle-${kind}`}
                disabled={pick.isPending || failed}
                onClick={() => toggleGroup(group.map((bug) => bug.flag))}
              >
                {allOn ? "Turn off all" : `Turn on all ${group.length}`}
              </button>
            </div>
            <ul className="bug-list" data-testid={`bug-group-${kind}`}>
              {group.map((bug) => (
                <BugCard
                  key={bug.flag}
                  bug={bug}
                  armed={armed.has(bug.flag)}
                  found={found.has(bug.flag)}
                  canSave={canSave}
                  switching={pick.isPending || failed}
                  marking={mark.isPending}
                  onToggle={() => toggleBug(bug.flag)}
                  onFound={() => mark.mutate(bug.flag)}
                />
              ))}
            </ul>
          </div>
        );
      })}
    </section>
  );
}
