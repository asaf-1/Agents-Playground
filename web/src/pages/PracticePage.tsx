import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "../components/ui";
import { PRACTICE_KEY } from "../components/PracticeSwitch";
import { getPractice, type PracticeBug } from "../practiceApi";

// One bug: where to go, what to try, and a reveal you open only when you want
// to stop guessing.
function BugCard({ bug }: { bug: PracticeBug }) {
  const [shown, setShown] = useState(false);

  return (
    <li className="card card-pad bug-card" data-testid={`bug-${bug.flag}`}>
      <div className="bug-head">
        <h3>{bug.title}</h3>
        <span
          className={`bug-verdict bug-${bug.verdict.toLowerCase()}`}
          data-testid={`bug-verdict-${bug.flag}`}
        >
          {bug.verdict}
        </span>
      </div>
      <p className="bug-where">
        <strong>Where:</strong> {bug.where}
      </p>
      <p className="bug-hint">{bug.hint}</p>

      <button
        type="button"
        className="btn btn-reveal"
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
    </li>
  );
}

// What to practise on, and what each planted bug actually is once you give up.
export function PracticePage() {
  const practice = useQuery({ queryKey: PRACTICE_KEY, queryFn: getPractice });

  const bugs = practice.data?.bugs ?? [];
  const on = practice.data?.on ?? false;

  // Grouped by family, so the page reads as kinds of fault rather than a list.
  const kinds = [...new Set(bugs.map((bug) => bug.kind))];

  return (
    <section data-testid="practice-page" className="page">
      <PageHeader
        eyebrow="Practice"
        title="What to look for"
        description={
          <p className="page-sub">
            {practice.data?.total ?? 0} faults are planted in this site on
            purpose. Turn practice mode on and they all come alive — for you
            alone. Nobody else browsing the site sees any of them.
          </p>
        }
      />

      <div
        className={`practice-state ${on ? "is-on" : "is-off"}`}
        data-testid="practice-state"
        role="status"
      >
        {on ? (
          <p>
            <strong>Practice mode is on.</strong> Every fault below is live in
            your browser. Switch it off in the top bar whenever you want the
            site to behave again.
          </p>
        ) : (
          <p>
            <strong>Practice mode is off.</strong> The site is behaving
            correctly. Turn it on from the top bar to start hunting — and expect
            to start over next time you visit, which is the point.
          </p>
        )}
      </div>

      <div className="card card-pad practice-how">
        <h2>How to use this</h2>
        <ol>
          <li>Turn practice mode on in the top bar.</li>
          <li>
            Pick a fault below, go where it says, and try to catch it without
            reading the answer.
          </li>
          <li>
            Reveal the answer when you want to check yourself, or when you are
            stuck.
          </li>
        </ol>
        <p className="muted">
          Most are marked <strong>REPORT</strong>: a real fault you would raise
          against the site. One is marked <strong>HEAL</strong> — nothing is
          broken for a person, and it is the test that should adapt. Telling
          those two apart is the skill worth practising.
        </p>
      </div>

      {practice.isLoading && (
        <p className="muted" data-testid="practice-loading">
          Loading the list…
        </p>
      )}

      {kinds.map((kind) => (
        <div key={kind}>
          <h2 className="section-title">{kind}</h2>
          <ul className="bug-list" data-testid={`bug-group-${kind}`}>
            {bugs
              .filter((bug) => bug.kind === kind)
              .map((bug) => (
                <BugCard key={bug.flag} bug={bug} />
              ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
