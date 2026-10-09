import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { bankLogin } from "../bankApi";
import { Badge, PageHeader } from "../components/ui";
import { safeNext, useSetBankAccount } from "../useBankSession";

const schema = z.object({
  email: z.string().trim().min(1, "Enter your email."),
  password: z.string().min(1, "Enter your password."),
});

type FormValues = z.infer<typeof schema>;

const DEMO_ACCOUNTS = [
  { email: "maya@playgroundbank.test", role: "Customer", note: "A customer" },
  {
    email: "sam@playgroundbank.test",
    role: "Support",
    note: "Sees bank users, read-only",
  },
  {
    email: "alex@playgroundbank.test",
    role: "Admin",
    note: "Changes roles, locks accounts",
  },
  {
    email: "lee@playgroundbank.test",
    role: "Locked",
    note: "Locked on purpose",
  },
];

// Signs in to Playground Bank. After log-in it goes back to the page that
// asked (?next=), or to the profile.
export function LoginPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const setAccount = useSetBankAccount();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  });

  const mutation = useMutation({
    mutationFn: (values: FormValues) =>
      bankLogin(values.email, values.password),
    onSuccess: (account) => {
      setAccount(account);
      navigate(safeNext(params.get("next")) ?? "/profile");
    },
  });

  return (
    <section data-testid="login-page" className="page">
      <PageHeader
        eyebrow="You"
        title="Log in"
        description={
          <p className="page-sub">
            Sign in to your Playground Bank account, or use a demo one. Each
            demo account has a different role.
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

          <p className="form-footer">
            New here?{" "}
            <Link data-testid="login-signup-link" to="/signup">
              Create an account
            </Link>
          </p>
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
          <p className="muted demo-footnote">
            Demo accounts are read-only. Sign up to try editing a profile.
          </p>
        </aside>
      </div>
    </section>
  );
}
