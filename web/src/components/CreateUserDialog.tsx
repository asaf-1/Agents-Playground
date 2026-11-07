// The "New user" dialog on the Users page: a name and a role, shown in the
// table at once.

// React state, Radix's dialog, the form and its rules (Zod), and the data
// cache.
import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
// The create call and the users types, and the plus icon.
import { createUser, type User, type UsersResponse } from "../api";
import { PlusIcon } from "./icons";

// The form's rules: a name of 2 or more characters, and one of three roles.
const schema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters."),
  role: z.enum(["Viewer", "Editor", "Admin"]),
});

// The form's values, as the rules describe them.
type FormValues = z.infer<typeof schema>;

export function CreateUserDialog({
  runKey,
  a11yBug,
}: {
  runKey: string;
  a11yBug: boolean;
}) {
  // Whether the dialog is open, and the shared data cache.
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  // The form, checked against the rules, starting empty as a Viewer.
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", role: "Viewer" },
  });

  // Optimistic create: the new row is added immediately and rolled back on
  // error. With the userCreateConflict flag armed the server returns 409, so
  // the optimistic row appears and then disappears (REPORT material).
  const mutation = useMutation({
    mutationFn: (values: FormValues) => createUser(values, runKey),
    // Before the call: stop any refresh, keep the list as it was, and add a
    // "Saving…" row.
    onMutate: async (values) => {
      await queryClient.cancelQueries({ queryKey: ["users", runKey] });
      const previous = queryClient.getQueryData<UsersResponse>([
        "users",
        runKey,
      ]);
      const optimistic: User = {
        id: `optimistic-${values.name}`,
        name: values.name,
        role: values.role,
        status: "Saving…",
      };
      queryClient.setQueryData<UsersResponse>(["users", runKey], (old) =>
        old
          ? { ...old, users: [...old.users, optimistic], total: old.total + 1 }
          : old,
      );
      return { previous };
    },
    // On an error, put the list back as it was.
    onError: (_error, _values, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["users", runKey], context.previous);
      }
    },
    // On success, clear the form and close the dialog.
    onSuccess: () => {
      reset();
      setOpen(false);
    },
    // Either way, ask the server for the real list.
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["users", runKey] });
    },
  });

  // INTENTIONAL DEFECT hook: with a11yBug armed the name input loses its label
  // association (no <label>, no id, no aria-label), so it has no accessible
  // name — an axe violation a correct test should flag (REPORT).
  const labelledInputProps = a11yBug
    ? {}
    : { id: "user-name", "aria-label": "Name" };

  // The button that opens the dialog, and the dialog with its form.
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button data-testid="users-create-open" className="btn btn-primary">
          <PlusIcon />
          New user
        </button>
      </Dialog.Trigger>
      {/* The dark backdrop and the dialog, on top of the page. */}
      <Dialog.Portal>
        <Dialog.Overlay
          className="dialog-overlay"
          data-testid="users-create-overlay"
        />
        <Dialog.Content
          className="dialog-content"
          data-testid="users-create-dialog"
        >
          <Dialog.Title>Create user</Dialog.Title>
          <Dialog.Description>
            Add a user through the RBAC-gated POST /api/users endpoint.
          </Dialog.Description>
          {/* The form; Create sends it. */}
          <form
            data-testid="users-create-form"
            onSubmit={handleSubmit((values) => mutation.mutate(values))}
          >
            {/* The name, with its label unless the bug is armed, and its
                error. */}
            <div className="field">
              {!a11yBug && <label htmlFor="user-name">Name</label>}
              <input
                data-testid="users-create-name"
                {...labelledInputProps}
                {...register("name")}
              />
              {errors.name && (
                <p data-testid="users-create-name-error" role="alert">
                  {errors.name.message}
                </p>
              )}
            </div>

            {/* The role. */}
            <div className="field">
              <label htmlFor="user-role">Role</label>
              <select
                id="user-role"
                data-testid="users-create-role"
                {...register("role")}
              >
                <option value="Viewer">Viewer</option>
                <option value="Editor">Editor</option>
                <option value="Admin">Admin</option>
              </select>
            </div>

            {/* The server's error, such as a 409. */}
            {mutation.isError && (
              <p data-testid="users-create-server-error" role="alert">
                {(mutation.error as Error).message}
              </p>
            )}

            {/* Create (locked while saving) and Cancel. */}
            <div className="dialog-actions">
              <button
                data-testid="users-create-submit"
                className="btn btn-primary"
                type="submit"
                disabled={mutation.isPending}
              >
                {mutation.isPending ? "Saving…" : "Create"}
              </button>
              <Dialog.Close asChild>
                <button data-testid="users-create-cancel" type="button">
                  Cancel
                </button>
              </Dialog.Close>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
