import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { COUNTRIES, fieldErrors, updateProfile } from "../bankApi";
import { SignInPrompt } from "../components/SignInPrompt";
import { PageHeader } from "../components/ui";
import { useBankSession, useSetBankAccount } from "../useBankSession";

// Mirrors the server's rules; empty optional fields are allowed.
const schema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, "Enter your full name (2 to 80 characters).")
    .max(80, "Enter your full name (2 to 80 characters)."),
  phone: z
    .string()
    .trim()
    .max(30, "Use digits, spaces, +, ( ) or - (up to 30).")
    .regex(/^(\+?[\d\s()-]+)?$/, "Use digits, spaces, +, ( ) or - (up to 30)."),
  addressLine: z
    .string()
    .trim()
    .max(120, "Keep the address under 120 characters."),
  city: z.string().trim().max(60, "Keep the city under 60 characters."),
  postalCode: z
    .string()
    .trim()
    .max(20, "Use letters, digits, spaces or - (up to 20).")
    .regex(/^[A-Za-z0-9 -]*$/, "Use letters, digits, spaces or - (up to 20)."),
  country: z.string(),
});

type FormValues = z.infer<typeof schema>;
type FieldName = keyof FormValues;

const TEXT_FIELDS: {
  name: Exclude<FieldName, "country">;
  label: string;
  auto: string;
  wide?: boolean;
}[] = [
  { name: "fullName", label: "Full name", auto: "name", wide: true },
  { name: "phone", label: "Phone", auto: "tel" },
  { name: "postalCode", label: "Postal code", auto: "postal-code" },
  { name: "addressLine", label: "Address", auto: "street-address", wide: true },
  { name: "city", label: "City", auto: "address-level2" },
];

export function EditProfilePage() {
  const { account, isLoading } = useBankSession();
  const setAccount = useSetBankAccount();
  const navigate = useNavigate();

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  // Fill the form once the account has loaded.
  useEffect(() => {
    if (account) {
      reset({
        fullName: account.user.fullName,
        phone: account.profile.phone,
        addressLine: account.profile.addressLine,
        city: account.profile.city,
        postalCode: account.profile.postalCode,
        country: account.profile.country,
      });
    }
  }, [account, reset]);

  const mutation = useMutation({
    mutationFn: (values: FormValues) => updateProfile(values),
    onSuccess: (updated) => {
      setAccount(updated);
      navigate("/profile", { state: { saved: true } });
    },
    onError: (error) => {
      for (const [name, message] of Object.entries(fieldErrors(error))) {
        setError(name as FieldName, { message });
      }
    },
  });

  return (
    <section data-testid="edit-profile-page" className="page">
      <PageHeader
        eyebrow="You"
        title="Edit profile"
        description={
          <p className="page-sub">
            Your name and contact details. Only you can see them.
          </p>
        }
      />

      {!isLoading && !account && (
        <SignInPrompt
          next="/profile/edit"
          title="Log in to edit your profile"
        />
      )}

      {account && (
        <form
          data-testid="edit-profile-form"
          className="card card-pad form-card"
          onSubmit={handleSubmit((values) => mutation.mutate(values))}
          noValidate
        >
          <div className="form-grid">
            {TEXT_FIELDS.map((field) => (
              <div
                className={field.wide ? "field field-wide" : "field"}
                key={field.name}
              >
                <label htmlFor={`edit-${field.name}`}>{field.label}</label>
                <input
                  id={`edit-${field.name}`}
                  data-testid={`edit-profile-${field.name}`}
                  type="text"
                  autoComplete={field.auto}
                  aria-invalid={errors[field.name] ? true : undefined}
                  {...register(field.name)}
                />
                {errors[field.name] && (
                  <p
                    data-testid={`edit-profile-${field.name}-error`}
                    role="alert"
                  >
                    {errors[field.name]?.message}
                  </p>
                )}
              </div>
            ))}

            <div className="field">
              <label htmlFor="edit-country">Country</label>
              <select
                id="edit-country"
                data-testid="edit-profile-country"
                autoComplete="country-name"
                {...register("country")}
              >
                <option value="">Choose a country</option>
                {COUNTRIES.map((country) => (
                  <option key={country} value={country}>
                    {country}
                  </option>
                ))}
              </select>
              {errors.country && (
                <p data-testid="edit-profile-country-error" role="alert">
                  {errors.country.message}
                </p>
              )}
            </div>
          </div>

          {mutation.isError && (
            <p
              data-testid="edit-profile-error"
              role="alert"
              className="callout"
            >
              {(mutation.error as Error).message}
            </p>
          )}

          <div className="btn-row">
            <button
              data-testid="edit-profile-save"
              className="btn btn-primary"
              type="submit"
              disabled={mutation.isPending}
            >
              {mutation.isPending ? "Saving…" : "Save changes"}
            </button>
            <Link
              className="btn"
              data-testid="edit-profile-cancel"
              to="/profile"
            >
              Cancel
            </Link>
          </div>
        </form>
      )}
    </section>
  );
}
