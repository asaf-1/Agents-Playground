// The Log in page: the form, and the demo accounts to try.

// The form and its rules (Zod), the data cache, and the router.
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
// The log-in call, the badge and page heading, and the session helpers.
import { bankLogin } from "../bankApi";
import { Badge, PageHeader } from "../components/ui";
import { safeNext, useSetBankAccount } from "../useBankSession";

// The form's rules: both fields filled in.
const schema = z.object({
  email: z.string().trim().min(1, "Enter your email."),
  password: z.string().min(1, "Enter your password."),
});

// The form's values.
type FormValues = z.infer<typeof schema>;

// The demo accounts listed beside the form, one per role.
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
  // The router, the ?next= address, and the way to store the account.
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const setAccount = useSetBankAccount();

  // The form, checked against the rules.
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  });

  // Log in; on success, store the account and go to ?next= (when it is safe) or
  // the profile.
  const mutation = useMutation({
    mutationFn: (values: FormValues) =>
      bankLogin(values.email, values.password),
    onSuccess: (account) => {
      setAccount(account);
      navigate(safeNext(params.get("next")) ?? "/profile");
    },
  });

  // The heading, then the form and the demo accounts side by side.
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
        {/* The form: email, password, any error, Log in, a sign-up link. */}
        <form
          data-testid="login-form"
          className="card card-pad"
          onSubmit={handleSubmit((values) => mutation.mutate(values))}
        >
          {/* The email, with its error. */}
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

          {/* The password, with its error. */}
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

          {/* The server's answer, such as a wrong password. */}
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

        {/* The demo accounts and their shared password. */}
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
