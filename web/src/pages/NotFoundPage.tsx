// The page for an address the app has no page for: the address that was
// asked for, and three ways back.

// The router's link, and the address the visitor is on.
import { Link, useLocation } from "react-router-dom";
// A crossed-out map pin for "no page here", and the arrow on each link.
import { MapPinOff } from "lucide-react";
import { ArrowRightIcon } from "../components/icons";
// The page heading.
import { PageHeader } from "../components/ui";

// The ways back, in the order a lost visitor most likely wants them. The
// labels are the sidebar's own names for the same pages.
const WAYS_BACK = [
  { to: "/", label: "Home", testId: "not-found-home" },
  { to: "/bank", label: "Bank", testId: "not-found-bank" },
  { to: "/practice", label: "Practice guide", testId: "not-found-practice" },
];

// Shown for every address under /app that no route matches. The frame around
// it (the sidebar and the top bar) stays, so the menu is a way back too.
export function NotFoundPage() {
  // The address as the visitor typed it: the router's path is inside /app.
  const { pathname, search } = useLocation();
  const asked = `/app${pathname === "/" ? "" : pathname}${search}`;

  // The heading, then the box with the address and the ways back.
  return (
    <section data-testid="not-found-page" className="page">
      <PageHeader eyebrow="Error 404" title="Page not found" />

      {/* The address that has no page, and the links back. */}
      <div className="card card-pad lost">
        <span className="hub-icon">
          <MapPinOff aria-hidden="true" />
        </span>
        <p className="account-title">
          There's no page at{" "}
          <code className="lost-path" data-testid="not-found-path">
            {asked}
          </code>
        </p>
        <p className="muted">
          The link may be old, or the address mistyped. Pick a way back:
        </p>
        <div className="hub-links">
          {WAYS_BACK.map((way) => (
            <Link
              key={way.to}
              className="link-arrow"
              data-testid={way.testId}
              to={way.to}
            >
              {way.label}
              <ArrowRightIcon />
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
