import { describe, expect, it } from "vitest";
import { formatShortDate } from "./format";

describe("formatShortDate", () => {
  const iso = "2026-01-15T12:00:00Z";

  it("uses en-US slash separators when not buggy", () => {
    const out = formatShortDate(iso, false);
    expect(out).toMatch(/\//);
    expect(out).not.toMatch(/\./);
  });

  it("uses de-DE dot separators when the locale bug is armed", () => {
    const out = formatShortDate(iso, true);
    expect(out).toMatch(/\./);
    expect(out).not.toMatch(/\//);
  });
});
