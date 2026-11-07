// Vitest's test tools.
import { afterEach, describe, expect, it } from "vitest";
// Testing Library: unmount, find things, wait for them, and look inside one element.
import { cleanup, screen, waitFor, within } from "@testing-library/react";
// Testing Library's realistic clicks and typing.
import userEvent from "@testing-library/user-event";
// MSW's tools for a one-off API answer.
import { http, HttpResponse } from "msw";
// The page under test.
import { UsersPage } from "./UsersPage";
// Renders a page with the app's providers (router, query client).
import { renderWithProviders } from "../../test/utils";
// The shared MSW server, to swap answers for a test.
import { server } from "../../test/setup";
// Adds lines to the [RESULT] block printed after each test.
import { expected, fact } from "../../test/resultBlock";

// The ⋯ menu on the back-office Users page. The users list is shared server
// state that other suites count, so these run against MSW instead of the real
// server: nothing here can change a user anyone else sees.
describe("UsersPage row actions", () => {
  // Each test leaves a dialog open; unmount it so the next starts clean.
  afterEach(cleanup);

  // View, from Ada's ⋯ menu, opens her details.
  it("View opens the user's details", async () => {
    expected("the details dialog shows USR-001, Ada Lovelace, Admin");
    const user = userEvent.setup();
    renderWithProviders(<UsersPage />);

    // Open the ⋯ menu on USR-001 and choose View.
    await user.click(await screen.findByTestId("user-actions-USR-001"));
    await user.click(await screen.findByTestId("user-view-USR-001"));

    // The dialog shows her id, name and role.
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

  // Edit sends the new role and status, and the row shows them afterwards.
  it("Edit sends the new role and status, and the row shows them", async () => {
    expected(
      "one PATCH with role Editor and status Inactive; the dialog closes; the row reads Editor and Inactive",
    );
    // A users list and an edit endpoint of this test's own, which remember
    // what was sent.
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

    // Open Edit, pick Editor and Inactive, and save.
    await user.click(await screen.findByTestId("user-actions-USR-001"));
    await user.click(await screen.findByTestId("user-edit-USR-001"));
    await screen.findByTestId("user-edit-dialog");
    await user.selectOptions(screen.getByTestId("user-edit-role"), "Editor");
    await user.selectOptions(
      screen.getByTestId("user-edit-status"),
      "Inactive",
    );
    await user.click(screen.getByTestId("user-edit-save"));

    // The dialog closes, one edit was sent, and the row shows it.
    await waitFor(() =>
      expect(screen.queryByTestId("user-edit-dialog")).not.toBeInTheDocument(),
    );
    fact("edits", edits);
    expect(edits).toEqual([{ role: "Editor", status: "Inactive" }]);
    const row = screen.getByTestId("user-row-USR-001");
    await waitFor(() => expect(row).toHaveTextContent("Editor"));
    expect(row).toHaveTextContent("Inactive");
  });

  // When the server refuses an edit, the dialog shows the server's own message.
  it("Edit shows the server's answer when it refuses", async () => {
    expected(
      "with a 403 from the edit: the dialog says 'You do not have permission to edit users.'",
    );
    // This test's edit answer: a 403.
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

    // Open Edit and save without changes.
    await user.click(await screen.findByTestId("user-actions-USR-001"));
    await user.click(await screen.findByTestId("user-edit-USR-001"));
    await user.click(await screen.findByTestId("user-edit-save"));

    // The server's words.
    expect(await screen.findByTestId("user-edit-error")).toHaveTextContent(
      "You do not have permission to edit users.",
    );
  });
});
