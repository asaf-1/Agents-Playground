// Vitest's test tools.
import { describe, expect, it } from "vitest";
// Testing Library: find things on the rendered page, and wait for them.
import { screen, waitFor } from "@testing-library/react";
// MSW's tools for a one-off API answer.
import { http, HttpResponse } from "msw";
// The page under test.
import { OrdersPage } from "./OrdersPage";
// Renders a page with the app's providers (router, query client).
import { renderWithProviders } from "../../test/utils";
// The shared MSW server, to swap one answer for a test.
import { server } from "../../test/setup";
// Adds lines to the [RESULT] block printed after each test.
import { expected, fact } from "../../test/resultBlock";

describe("OrdersPage", () => {
  // With the default answer, the table shows the seeded orders.
  it("renders seeded orders returned by the API", async () => {
    expected("the orders table appears with ORD-1001");
    renderWithProviders(<OrdersPage />);

    // Wait for the table, then look for the first order.
    await waitFor(() =>
      expect(screen.getByTestId("orders-table")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("orders-table")).toHaveTextContent("ORD-1001");
  });

  // When the API fails, the page shows its error and a Retry button.
  it("shows the error + retry state when the orders API fails", async () => {
    expected("with a 500 from /api/orders: the error and the Retry button");
    // This test's orders answer: a 500.
    fact("api", "GET /api/orders -> 500 (this test only)");
    server.use(
      http.get("/api/orders", () =>
        HttpResponse.json(
          { message: "Orders upstream failed." },
          { status: 500 },
        ),
      ),
    );

    renderWithProviders(<OrdersPage />);

    // The error state, with a way to try again.
    await waitFor(() =>
      expect(screen.getByTestId("orders-error")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("orders-retry")).toBeInTheDocument();
  });
});
