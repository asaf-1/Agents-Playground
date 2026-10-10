import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { fieldErrors, registerAccount } from "../bankApi";
import { PageHeader } from "../components/ui";
import { safeNext, useSetBankAccount } from "../useBankSession";

const PASSWORD_RULE =
  "Use at least 8 characters, with at least one letter and one number.";

// The same rules the server checks, so most mistakes show before sending.
const schema = z
  .object({
    fullName: z
      .string()
      .trim()
      .min(2, "Enter your full name (2 to 80 characters).")
      .max(80, "Enter your full name (2 to 80 characters)."),
    email: z
      .string()
      .trim()
      .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Enter a valid email address."),
    password: z
      .string()
      .min(8, PASSWORD_RULE)
      .max(128, PASSWORD_RULE)
      .regex(/[A-Za-z]/, PASSWORD_RULE)
      .regex(/\d/, PASSWORD_RULE),
    confirmPassword: z.string(),
    acceptTerms: z.boolean().refine((value) => value, {
      message: "Accept the terms to create an account.",
    }),
  })
  .refine((values) => values.password === values.confirmPassword, {
    path: ["confirmPassword"],
    message: "The passwords don't match.",
  });

type FormValues = z.infer<typeof schema>;
type FieldName = keyof FormValues;

const FIELDS: { name: FieldName; label: string; type: string; auto: string }[] =
  [
    { name: "fullName", label: "Full name", type: "text", auto: "name" },
    { name: "email", label: "Email", type: "email", auto: "email" },
    {
      name: "password",
      label: "Password",
      type: "password",
      auto: "new-password",
    },
    {
      name: "confirmPassword",
      label: "Confirm password",
      type: "password",
      auto: "new-password",
    },
  ];

export function SignUpPage() {
  const navigate = useNavigate();
  const setAccount = useSetBankAccount();
  // ?next=/bank/transfer brings people back to where they started.
  const [params] = useSearchParams();
  const next = safeNext(params.get("next"));

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      fullName: "",
      email: "",
      password: "",
      confirmPassword: "",
      acceptTerms: false,
    },
  });

  const mutation = useMutation({
    mutationFn: (values: FormValues) =>
      registerAccount({
        fullName: values.fullName,
        email: values.email,
        password: values.password,
        acceptTerms: values.acceptTerms,
      }),
    onSuccess: (account) => {
      setAccount(account);
      if (next) {
        navigate(next);
      } else {
        navigate("/profile", { state: { welcome: true } });
      }
    },
    onError: (error) => {
      for (const [name, message] of Object.entries(fieldErrors(error))) {
        setError(name as FieldName, { message });
      }
    },
  });

  return (
    <section data-testid="signup-page" className="page">
      <PageHeader
        eyebrow="You"
        title="Create your account"
        description={
          <p className="page-sub">
            A Playground Bank account takes a few seconds. Fake money only.
          </p>
        }
      />

      <form
        data-testid="signup-form"
        className="card card-pad form-card"
        onSubmit={handleSubmit((values) => mutation.mutate(values))}
        noValidate
      >
        <div className="form-grid">
          {FIELDS.map((field) => (
            <div
              className={
                field.name === "fullName" || field.name === "email"
                  ? "field field-wide"
                  : "field"
              }
              key={field.name}
            >
              <label htmlFor={`signup-${field.name}`}>{field.label}</label>
              <input
                id={`signup-${field.name}`}
                data-testid={`signup-${field.name}`}
                type={field.type}
                autoComplete={field.auto}
                aria-invalid={errors[field.name] ? true : undefined}
                {...register(field.name)}
              />
              {errors[field.name] && (
                <p data-testid={`signup-${field.name}-error`} role="alert">
                  {errors[field.name]?.message}
                </p>
              )}
            </div>
          ))}
        </div>

        <label className="check-field" htmlFor="signup-acceptTerms">
          <input
            id="signup-acceptTerms"
            data-testid="signup-acceptTerms"
            type="checkbox"
            {...register("acceptTerms")}
          />
          <span>
            I understand Playground Bank is a practice site: the money is fake
            and some bugs are planted on purpose.
          </span>
        </label>
        {errors.acceptTerms && (
          <p data-testid="signup-acceptTerms-error" role="alert">
            {errors.acceptTerms.message}
          </p>
        )}

        {mutation.isError && (
          <p data-testid="signup-error" role="alert" className="callout">
            {(mutation.error as Error).message}
          </p>
        )}

        <button
          data-testid="signup-submit"
          className="btn btn-primary btn-block"
          type="submit"
          disabled={mutation.isPending}
        >
          {mutation.isPending ? "Creating your account…" : "Create account"}
        </button>

        <p className="form-footer">
          Already have an account?{" "}
          <Link data-testid="signup-login-link" to="/login">
            Log in
          </Link>
        </p>
      </form>
    </section>
  );
}
