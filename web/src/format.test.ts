// Unit tests for formatShortDate: the right date format, and the planted locale
// bug.

// Vitest's test tools, and the function under test.
import { describe, expect, it } from "vitest";
import { formatShortDate } from "./format";
// Adds lines to the [RESULT] block printed after each test.
import { expected, fact } from "../test/resultBlock";

// The date formatter, with the bug off and on.
describe("formatShortDate", () => {
  // One fixed date for both tests.
  const iso = "2026-01-15T12:00:00Z";

  // Bug off: US dates, with slashes and no dots.
  it("uses en-US slash separators when not buggy", () => {
    expected("the en-US short date: slashes, no dots");
    fact("input", iso);
    const out = formatShortDate(iso, false);
    fact("date", out);
    expect(out).toMatch(/\//);
    expect(out).not.toMatch(/\./);
  });

  // Bug armed: German dates, with dots and no slashes.
  it("uses de-DE dot separators when the locale bug is armed", () => {
    expected(
      "with the locale bug armed, the de-DE short date: dots, no slashes",
    );
    fact("input", iso);
    const out = formatShortDate(iso, true);
    fact("date", out);
    expect(out).toMatch(/\./);
    expect(out).not.toMatch(/\//);
  });
});
