import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createUser, type User, type UsersResponse } from "../api";

const schema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters."),
  role: z.enum(["Viewer", "Editor", "Admin"]),
});

type FormValues = z.infer<typeof schema>;

export function CreateUserDialog({
  runKey,
  a11yBug,
}: {
  runKey: string;
  a11yBug: boolean;
}) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

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
    onError: (_error, _values, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["users", runKey], context.previous);
      }
    },
    onSuccess: () => {
      reset();
      setOpen(false);
    },
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

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button data-testid="users-create-open">New user</button>
      </Dialog.Trigger>
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
          <form
            data-testid="users-create-form"
            onSubmit={handleSubmit((values) => mutation.mutate(values))}
          >
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

            {mutation.isError && (
              <p data-testid="users-create-server-error" role="alert">
                {(mutation.error as Error).message}
              </p>
            )}

            <button
              data-testid="users-create-submit"
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
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
