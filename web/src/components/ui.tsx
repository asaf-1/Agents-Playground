// Small pieces every page uses: a coloured badge, an avatar, and the page
// heading.

// React's types for a style and for anything it can draw.
import type { CSSProperties, ReactNode } from "react";

// The badge colours.
export type Tone =
  "success" | "info" | "warning" | "danger" | "violet" | "neutral";

// Status words the API already returns, mapped to a badge color.
const TONES: Record<string, Tone> = {
  Queued: "warning",
  Processing: "info",
  Ready: "success",
  Admin: "violet",
  Editor: "info",
  Viewer: "neutral",
  Customer: "info",
  Support: "neutral",
  Active: "success",
  Inactive: "danger",
  Locked: "danger",
  Demo: "warning",
  "Saving…": "info",
  Available: "success",
  Backordered: "warning",
  Soon: "violet",
  Pending: "warning",
  Approved: "success",
  Rejected: "danger",
  Waiting: "warning",
  Paid: "success",
  Declined: "danger",
  Cancelled: "neutral",
  Open: "warning",
  Answered: "info",
  Solved: "success",
  // The shop's order steps, and the books check.
  Placed: "warning",
  Packed: "info",
  Shipped: "violet",
  Delivered: "success",
  Refunded: "neutral",
  Balanced: "success",
  "Out of balance": "danger",
};

// The colour for a status word; neutral for one not in the list.
export function toneFor(value: string): Tone {
  return TONES[value] ?? "neutral";
}

// The badge text is the value itself, so a cell that holds a badge keeps
// exactly the text it had before.
export function Badge({ value, tone }: { value: string; tone?: Tone }) {
  return (
    <span className={`badge badge-${tone ?? toneFor(value)}`}>{value}</span>
  );
}

// Initials are drawn by CSS from a data attribute, not as text, so a table
// cell with an avatar still reads as just the name.
export function Avatar({ name, seed }: { name: string; seed: string }) {
  // Up to two initials, from the first letters of the name's words.
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
  // A colour from the seed, so the same person always gets the same one.
  const hue =
    ([...seed].reduce((sum, char) => sum + char.charCodeAt(0), 0) * 47) % 360;
  return (
    <span
      className="avatar"
      data-initials={initials}
      style={{ "--avatar-hue": hue } as CSSProperties}
      aria-hidden="true"
    />
  );
}

// Every page heading carries data-testid="app-heading"; this keeps it to
// exactly one per page.
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  // The heading, with the page's buttons on the right when it has any.
  return (
    <header className="page-header">
      <div className="page-title">
        <p className="eyebrow">{eyebrow}</p>
        <h1 data-testid="app-heading">{title}</h1>
        {description}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}
