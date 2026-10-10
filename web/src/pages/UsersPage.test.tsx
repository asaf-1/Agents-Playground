import { afterEach, describe, expect, it } from "vitest";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { UsersPage } from "./UsersPage";
import { renderWithProviders } from "../../test/utils";
import { server } from "../../test/setup";

// The ⋯ menu on the back-office Users page. The users list is shared server
// state that other suites count, so these run against MSW instead of the real
// server: nothing here can change a user anyone else sees.
describe("UsersPage row actions", () => {
  // Each test leaves a dialog open; unmount it so the next starts clean.
  afterEach(cleanup);

  it("View opens the user's details", async () => {
    const user = userEvent.setup();
    renderWithProviders(<UsersPage />);

    await user.click(await screen.findByTestId("user-actions-USR-001"));
    await user.click(await screen.findByTestId("user-view-USR-001"));

    const dialog = await screen.findByTestId("user-details-dialog");
    expect(within(dialog).getByTestId("user-details-id")).toHaveTextContent(
      "USR-001",
    );
    expect(within(dialog).getByTestId("user-details-name")).toHaveTextContent(
      "Ada Lovelace",
    );
    expect(within(dialog).getByTestId("user-details-role")).toHaveTextContent(
      "Admin",
    );
  });

  it("Edit sends the new role and status, and the row shows them", async () => {
    const edits: unknown[] = [];
    let current = { role: "Admin", status: "Active" };
    server.use(
      http.get("/api/users", () =>
        HttpResponse.json({
          users: [{ id: "USR-001", name: "Ada Lovelace", ...current }],
          total: 1,
        }),
      ),
      http.patch("/api/users/USR-001", async ({ request }) => {
        const body = (await request.json()) as typeof current;
        edits.push(body);
        current = body;
        return HttpResponse.json({
          message: "User updated.",
          id: "USR-001",
          edit: body,
        });
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<UsersPage />);

    await user.click(await screen.findByTestId("user-actions-USR-001"));
    await user.click(await screen.findByTestId("user-edit-USR-001"));
    await screen.findByTestId("user-edit-dialog");
    await user.selectOptions(screen.getByTestId("user-edit-role"), "Editor");
    await user.selectOptions(
      screen.getByTestId("user-edit-status"),
      "Inactive",
    );
    await user.click(screen.getByTestId("user-edit-save"));

    await waitFor(() =>
      expect(screen.queryByTestId("user-edit-dialog")).not.toBeInTheDocument(),
    );
    expect(edits).toEqual([{ role: "Editor", status: "Inactive" }]);
    const row = screen.getByTestId("user-row-USR-001");
    await waitFor(() => expect(row).toHaveTextContent("Editor"));
    expect(row).toHaveTextContent("Inactive");
  });

  it("Edit shows the server's answer when it refuses", async () => {
    server.use(
      http.patch("/api/users/USR-001", () =>
        HttpResponse.json(
          {
            code: "RBAC_FORBIDDEN",
            message: "You do not have permission to edit users.",
          },
          { status: 403 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<UsersPage />);

    await user.click(await screen.findByTestId("user-actions-USR-001"));
    await user.click(await screen.findByTestId("user-edit-USR-001"));
    await user.click(await screen.findByTestId("user-edit-save"));

    expect(await screen.findByTestId("user-edit-error")).toHaveTextContent(
      "You do not have permission to edit users.",
    );
  });
});
