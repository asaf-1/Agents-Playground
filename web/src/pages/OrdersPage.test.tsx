import { describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { OrdersPage } from "./OrdersPage";
import { renderWithProviders } from "../../test/utils";
import { server } from "../../test/setup";

describe("OrdersPage", () => {
  it("renders seeded orders returned by the API", async () => {
    renderWithProviders(<OrdersPage />);

    await waitFor(() =>
      expect(screen.getByTestId("orders-table")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("orders-table")).toHaveTextContent("ORD-1001");
  });

  it("shows the error + retry state when the orders API fails", async () => {
    server.use(
      http.get("/api/orders", () =>
        HttpResponse.json(
          { message: "Orders upstream failed." },
          { status: 500 },
        ),
      ),
    );

    renderWithProviders(<OrdersPage />);

    await waitFor(() =>
      expect(screen.getByTestId("orders-error")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("orders-retry")).toBeInTheDocument();
  });
});
