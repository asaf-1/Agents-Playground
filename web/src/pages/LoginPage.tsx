import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { login } from "../api";
import { Badge, PageHeader } from "../components/ui";

const schema = z.object({
  email: z.string().trim().min(1, "Enter your email."),
  password: z.string().min(1, "Enter your password."),
});

type FormValues = z.infer<typeof schema>;

const DEMO_ACCOUNTS = [
  { email: "alice@demo.local", role: "Admin", note: "Full access" },
  { email: "bob@demo.local", role: "Editor", note: "Can edit, cannot delete" },
  { email: "carol@demo.local", role: "Viewer", note: "Inactive on purpose" },
];

// Signs in through the server's existing demo accounts (real roles, kept in
// memory). Saved accounts arrive with the database in a later phase.
export function LoginPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  });

  const mutation = useMutation({
    mutationFn: (values: FormValues) => login(values.email, values.password),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["session"] });
      navigate("/account");
    },
  });

  return (
    <section data-testid="login-page" className="page">
      <PageHeader
        eyebrow="You"
        title="Log in"
        description={
          <p className="page-sub">
            Sign in with a demo account. Each one has a different role.
          </p>
        }
      />

      <div className="auth-grid">
        <form
          data-testid="login-form"
          className="card card-pad"
          onSubmit={handleSubmit((values) => mutation.mutate(values))}
        >
          <div className="field">
            <label htmlFor="login-email">Email</label>
            <input
              id="login-email"
              data-testid="login-email"
              type="email"
              autoComplete="username"
              {...register("email")}
            />
            {errors.email && (
              <p data-testid="login-email-error" role="alert">
                {errors.email.message}
              </p>
            )}
          </div>

          <div className="field">
            <label htmlFor="login-password">Password</label>
            <input
              id="login-password"
              data-testid="login-password"
              type="password"
              autoComplete="current-password"
              {...register("password")}
            />
            {errors.password && (
              <p data-testid="login-password-error" role="alert">
                {errors.password.message}
              </p>
            )}
          </div>

          {mutation.isError && (
            <p data-testid="login-error" role="alert" className="callout">
              {(mutation.error as Error).message}
            </p>
          )}

          <button
            data-testid="login-submit"
            className="btn btn-primary btn-block"
            type="submit"
            disabled={mutation.isPending}
          >
            {mutation.isPending ? "Signing in…" : "Log in"}
          </button>
        </form>

        <aside
          className="card card-pad demo-accounts"
          data-testid="login-demo-accounts"
        >
          <h2>Demo accounts</h2>
          <p className="muted">
            Password for every account: <code className="mono">demo1234</code>
          </p>
          <div className="demo-list">
            {DEMO_ACCOUNTS.map((account) => (
              <div className="demo-row" key={account.email}>
                <div>
                  <p className="mono">{account.email}</p>
                  <p className="muted">{account.note}</p>
                </div>
                <Badge value={account.role} />
              </div>
            ))}
          </div>
        </aside>
      </div>
    </section>
  );
}
