import { Link } from "react-router-dom";
import { Avatar, PageHeader } from "../components/ui";

export function AboutPage() {
  return (
    <section data-testid="app-about" className="page">
      <PageHeader
        eyebrow="About"
        title="About this surface"
        description={
          <p className="page-sub">
            Client-side routing works via the server SPA fallback.
          </p>
        }
      />

      <div className="card card-pad author-card" data-testid="about-author">
        <div className="author-head">
          <Avatar name="Asaf Nuri" seed="asaf-nuri" />
          <div>
            <p className="eyebrow">Built by</p>
            <h2 data-testid="about-author-name">Asaf Nuri</h2>
            <p className="author-title">Quality Platform Engineer</p>
          </div>
        </div>
        <div className="author-body">
          <div>
            <h3>About me</h3>
            <p>
              I build the platforms that make software testing fast and
              reliable: Playwright frameworks, CI pipelines, and AI agents that
              find, diagnose and report bugs.
            </p>
          </div>
          <div>
            <h3>Why this project</h3>
            <p>
              Playground Bank is a safe place to practice testing on a realistic
              bank and crypto app, with fake money and bugs planted on purpose.
              It&apos;s also the target my AI QA agents train on.
            </p>
          </div>
        </div>
      </div>

      <div className="card card-pad">
        <h2>Playground Bank is a practice site</h2>
        <ul className="check-list">
          <li>
            Fake money only. Nothing here is a real bank, and it never needs
            real payment details.
          </li>
          <li>
            Bugs are planted on purpose. They stay off unless a test switches
            them on for its own run.
          </li>
          <li>
            Built with Vite, React and TypeScript, and served by the same Node
            API as the classic site.
          </li>
        </ul>
        <Link className="btn" data-testid="nav-home" to="/">
          Back home
        </Link>
      </div>
    </section>
  );
}
