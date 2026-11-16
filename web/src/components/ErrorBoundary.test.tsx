// Unit tests for the error screen around every page: a page that throws shows
// the screen, a new address clears it, and while nothing is wrong the pages
// are left alone.

// Vitest's test tools, React's state, Testing Library and the router.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useState, type ReactNode } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
// The component under test.
import { ErrorBoundary } from "./ErrorBoundary";
// Adds lines to the [RESULT] block printed after each test.
import { expected, fact } from "../../test/resultBlock";

// A page that throws while it draws, as a broken page would.
function BrokenPage(): never {
  throw new Error("The ledger is missing.");
}

// A page with a counter, to see whether it is drawn from scratch again.
function CounterPage() {
  const [count, setCount] = useState(0);
  return (
    <button type="button" onClick={() => setCount(count + 1)}>
      Pressed {count}
    </button>
  );
}

// The error screen around a page, inside a router (its Home link needs one).
function inFrame(page: ReactNode, address: string) {
  return (
    <MemoryRouter>
      <ErrorBoundary resetKey={address}>{page}</ErrorBoundary>
    </MemoryRouter>
  );
}

describe("ErrorBoundary", () => {
  // React prints each error it catches; keep the test output to the blocks.
  // Vitest's globals are off, so each test's page is removed by hand after it.
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  // A page that throws: the heading, its message, Reload and Back to home.
  it("shows the error screen with the page's message", () => {
    expected(
      "the heading 'Something went wrong on this page', the message 'The ledger is missing.', Reload and Back to home",
    );
    render(inFrame(<BrokenPage />, "/bank"));

    expect(screen.getByTestId("app-heading")).toHaveTextContent(
      "Something went wrong on this page",
    );
    expect(screen.getByTestId("app-error-message")).toHaveTextContent(
      "The ledger is missing.",
    );
    expect(screen.getByTestId("app-error-reload")).toBeInTheDocument();
    expect(screen.getByTestId("app-error-home")).toHaveAttribute("href", "/");
    fact("message", screen.getByTestId("app-error-message").textContent);
  });

  // Opening another page clears the screen and draws that page.
  it("clears itself when the address changes", () => {
    expected(
      "the screen on /bank; on /about with a working page: the page, and no screen",
    );
    const view = render(inFrame(<BrokenPage />, "/bank"));
    expect(screen.getByTestId("app-error")).toBeInTheDocument();

    view.rerender(inFrame(<CounterPage />, "/about"));
    expect(screen.queryByTestId("app-error")).not.toBeInTheDocument();
    expect(screen.getByRole("button")).toHaveTextContent("Pressed 0");
    fact("addresses", ["/bank", "/about"]);
  });

  // While nothing is wrong, a new address leaves the page as it is: the
  // counter keeps its count.
  it("leaves a working page alone when the address changes", () => {
    expected("pressed twice, then a new address: still 'Pressed 2'");
    const view = render(inFrame(<CounterPage />, "/markets/BTC"));
    fireEvent.click(screen.getByRole("button"));
    fireEvent.click(screen.getByRole("button"));

    view.rerender(inFrame(<CounterPage />, "/markets/ETH"));
    expect(screen.getByRole("button")).toHaveTextContent("Pressed 2");
    fact("addresses", ["/markets/BTC", "/markets/ETH"]);
  });
});
