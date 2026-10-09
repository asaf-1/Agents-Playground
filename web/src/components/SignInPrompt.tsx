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
      <div>
        <p className="account-title">{title}</p>
        <p className="muted">
          Use a demo account, or create your own in a few seconds.
        </p>
      </div>
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
