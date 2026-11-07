// The "log in to see this page" card, with Log in and Sign up buttons.

// The router's link, and the log-in icon.
import { Link } from "react-router-dom";
import { LogIn } from "lucide-react";

// Shown on pages that need a Playground Bank account, instead of the page.
export function SignInPrompt({
  next,
  title = "Log in to see this page",
}: {
  next: string;
  title?: string;
}) {
  return (
    <div className="card card-pad prompt-card" data-testid="signin-prompt">
      <span className="account-icon">
        <LogIn aria-hidden="true" />
      </span>
      {/* The title, and a line about the demo accounts. */}
      <div>
        <p className="account-title">{title}</p>
        <p className="muted">
          Use a demo account, or create your own in a few seconds.
        </p>
      </div>
      {/* Log in comes back to this page afterwards; Sign up opens the form. */}
      <div className="btn-row">
        <Link
          className="btn btn-primary"
          data-testid="signin-prompt-login"
          to={`/login?next=${encodeURIComponent(next)}`}
        >
          Log in
        </Link>
        <Link className="btn" data-testid="signin-prompt-signup" to="/signup">
          Sign up
        </Link>
      </div>
    </div>
  );
}
