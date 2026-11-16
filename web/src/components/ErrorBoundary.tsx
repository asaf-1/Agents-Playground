// The safety net around every page. If a page throws while it draws, or its
// code fails to download, this shows what happened and a way out instead of
// a blank app. It sits inside the frame, so the sidebar and the top bar stay.

// React's class component (only a class can catch a render error), and its
// types.
import { Component, type ReactNode } from "react";
// The router's link, for the way home.
import { Link } from "react-router-dom";
// A stop sign for the error, and a circular arrow for Reload.
import { OctagonAlert, RotateCw } from "lucide-react";
// The page heading.
import { PageHeader } from "./ui";

// What it wraps, and the value that clears it when it changes (the address:
// opening another page gives that page a fresh start).
type Props = { children: ReactNode; resetKey: string };
// The error caught, or null while every page draws fine.
type State = { error: Error | null };

// Catches what the pages below it throw. React logs each caught error to the
// console itself, so nothing here logs it again.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  // A page threw: keep the error, so the next draw shows the error screen.
  static getDerivedStateFromError(error: unknown): State {
    return {
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }

  // The address changed while the error screen was up: try the new page.
  // While nothing is wrong this does nothing, so no page is drawn again.
  componentDidUpdate(previous: Props) {
    if (this.state.error && previous.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  // The pages, or the error screen.
  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    // The heading, the one-line message (never a stack), and two ways out:
    // load the page again, or go home.
    return (
      <section data-testid="app-error" className="page">
        <PageHeader eyebrow="Error" title="Something went wrong on this page" />

        {/* What went wrong, and the two buttons. */}
        <div className="card card-pad lost">
          <span className="hub-icon lost-icon-error">
            <OctagonAlert aria-hidden="true" />
          </span>
          <p className="account-title">This page stopped working.</p>
          <p
            className="lost-message"
            role="alert"
            data-testid="app-error-message"
          >
            {error.message || "An unknown error."}
          </p>
          <p className="muted">
            Reloading fetches the page again. The rest of the site still works.
          </p>
          <div className="btn-row">
            <button
              type="button"
              className="btn btn-primary"
              data-testid="app-error-reload"
              onClick={() => window.location.reload()}
            >
              <RotateCw aria-hidden="true" />
              Reload the page
            </button>
            <Link className="btn" data-testid="app-error-home" to="/">
              Back to home
            </Link>
          </div>
        </div>
      </section>
    );
  }
}
