// The Practice guide: what the planted faults are, how to hunt them on Your
// progress, what the levels and verdicts mean, who keeps progress, and what
// Your date in the top bar does. A guide only; the faults themselves, their
// switches and ticks are on Your progress (PracticeProgressPage.tsx).

// The data cache and the router's link.
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
// The icon on the way to Your progress.
import { Trophy } from "lucide-react";
// The page heading, practice mode's key and call, and the levels.
import { PageHeader } from "../components/ui";
import { PRACTICE_KEY } from "../components/PracticeSwitch";
import { getPractice } from "../practiceApi";
import { LEVELS } from "../practiceLevels";
// Who is signed in.
import { useBankSession } from "../useBankSession";

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

// What Your date in the top bar does, the third purple note under the two
// above: it decides when bills are paid, so it is framed like them. One
// short line per part, and the way to get one for whoever has none.
function DateNote({
  signedIn,
  canSave,
}: {
  signedIn: boolean;
  canSave: boolean;
}) {
  return (
    <div
      className="practice-save-note practice-date-note"
      data-testid="practice-date-note"
    >
      <p>
        <strong>Your date is your own calendar day.</strong> Once you sign in it
        is at the top of every page; move it forward to make what is due happen
        now.
      </p>
      <ul>
        <li>
          <strong>The time and your date</strong> show in the top bar. The time
          is in UTC, because the bank's day changes at midnight UTC.
        </li>
        <li>
          <strong>+1 day</strong> moves your date one day forward. Bills
          scheduled on <Link to="/bank/bills">Bill pay</Link> are paid when your
          date reaches their day, and a card's daily limit counts that day.
        </li>
        <li>
          <strong>The back arrow</strong> shows once your date is ahead, and
          takes it back to the real date.
        </li>
        <li>
          <strong>Only yours moves.</strong> Nobody else's date changes. Demo
          accounts stay on the real date, because they are shared.
        </li>
      </ul>
      {/* Who has no date to move yet: a visitor, or a demo account. */}
      {!signedIn && (
        <p>
          <Link to="/login">Log in</Link> or <Link to="/signup">sign up</Link>{" "}
          to get yours.
        </p>
      )}
      {signedIn && !canSave && (
        <p>
          <Link to="/signup">Sign up</Link> to move your own.
        </p>
      )}
    </div>
  );
}

// What to practise on, how, and what the words on Your progress mean.
export function PracticePage() {
  // Who is signed in, and how many faults there are (for the counts in the
  // text; until the answer arrives the text names no number).
  const { user } = useBankSession();
  const practice = useQuery({ queryKey: PRACTICE_KEY, queryFn: getPractice });
  const loaded = practice.data !== undefined;
  const total = practice.data?.total ?? 0;
  // An account of one's own keeps its progress; a demo account is shared.
  const canSave = Boolean(user && !user.isDemo);

  // The heading, the way to Your progress, how to use it, the levels and
  // verdicts, who keeps progress, and Your date.
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

      {/* The way to the list itself. */}
      <Link
        to="/practice/progress"
        className="card card-pad practice-go"
        data-testid="practice-go-progress"
      >
        <Trophy aria-hidden="true" />
        <span>
          <strong>Open Your progress</strong>
          <span className="muted">
            {" "}
            · every fault on one list, ticked as you find them
          </span>
        </span>
      </Link>

      {/* How to hunt: every control on Your progress, in the order you use
          them. */}
      <div className="card card-pad practice-how" data-testid="practice-how">
        <h2>How to use this</h2>
        <ol>
          <li>
            <strong>Open Your progress.</strong> It is under Practice guide in
            the menu: every fault is one line there, grouped Easy, Medium and
            Hard.
          </li>
          <li>
            <strong>Choose what to hunt.</strong> Practice mode in the top bar
            turns on {loaded ? `all ${total} faults` : "every fault"} at once.
            To practise only some, use a fault's <strong>Off/On</strong> switch,
            or <strong>Turn on all</strong> beside a level. Only you see them,
            and they switch off when you close the browser.
          </li>
          <li>
            <strong>Go and look.</strong> Press a fault's line to open it, go to
            the page in <em>Where</em>, follow the hint, and try to catch the
            fault without reading the answer.
          </li>
          <li>
            <strong>Check yourself.</strong> Press{" "}
            <strong>Reveal the answer</strong> when you think you have it, or
            when you are stuck.
          </li>
          <li>
            <strong>Tick it off.</strong> Press the circle beside each fault you
            catch. The dots at the top of Your progress fill in, and{" "}
            <strong>To find</strong> shows what is left. The tick is your own
            word: the site cannot tell that you found it.
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
        <DateNote signedIn={Boolean(user)} canSave={canSave} />
      </div>
    </section>
  );
}
