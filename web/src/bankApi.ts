// Typed client for Playground Bank's /api/bank/* endpoints. The session lives in
// an httpOnly cookie, so scripts never see the token; the browser sends it.
import { ApiError, request } from "./api";

export type BankRole = "customer" | "support" | "admin";
export type BankStatus = "active" | "locked";

export interface BankUser {
  id: string;
  email: string;
  fullName: string;
  role: BankRole;
  status: BankStatus;
  isDemo: boolean;
  createdAt: string;
}

export interface BankProfile {
  phone: string;
  addressLine: string;
  city: string;
  postalCode: string;
  country: string;
  updatedAt: string;
}

export const CURRENCIES = ["USD", "EUR", "GBP", "ILS"] as const;
export type Currency = (typeof CURRENCIES)[number];

export const LOCALES = [
  { value: "en-US", label: "English (United States)" },
  { value: "en-GB", label: "English (United Kingdom)" },
  { value: "de-DE", label: "Deutsch (Deutschland)" },
] as const;
export type Locale = (typeof LOCALES)[number]["value"];

export interface BankSettings {
  currency: Currency;
  locale: Locale;
  emailAlerts: boolean;
  statementEmails: boolean;
}

export interface BankAccount {
  user: BankUser;
  profile: BankProfile;
  settings: BankSettings;
}

export interface BankUsersResponse {
  users: BankUser[];
  total: number;
}

export const ROLE_LABELS: Record<BankRole, string> = {
  customer: "Customer",
  support: "Support",
  admin: "Admin",
};

export const STATUS_LABELS: Record<BankStatus, string> = {
  active: "Active",
  locked: "Locked",
};

export const COUNTRIES = [
  "Australia",
  "Brazil",
  "Canada",
  "France",
  "Germany",
  "India",
  "Israel",
  "Italy",
  "Japan",
  "Mexico",
  "Netherlands",
  "Spain",
  "Sweden",
  "Switzerland",
  "United Kingdom",
  "United States",
];

function send(method: string, body: unknown): RequestInit {
  return { method, body: JSON.stringify(body) };
}

// null when nobody is signed in, instead of an error.
export async function getMe(): Promise<BankAccount | null> {
  try {
    return await request<BankAccount>("/api/bank/me");
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      return null;
    }
    throw error;
  }
}

export function registerAccount(input: {
  fullName: string;
  email: string;
  password: string;
  acceptTerms: boolean;
}): Promise<BankAccount> {
  return request("/api/bank/register", send("POST", input));
}

export function bankLogin(
  email: string,
  password: string,
): Promise<BankAccount> {
  return request("/api/bank/login", send("POST", { email, password }));
}

export function bankLogout(): Promise<{ message: string }> {
  return request("/api/bank/logout", send("POST", {}));
}

export function updateProfile(
  fields: Partial<Omit<BankProfile, "updatedAt"> & { fullName: string }>,
): Promise<BankAccount> {
  return request("/api/bank/me/profile", send("PATCH", fields));
}

export function updateSettings(settings: BankSettings): Promise<BankAccount> {
  return request("/api/bank/me/settings", send("PUT", settings));
}

export function listBankUsers(): Promise<BankUsersResponse> {
  return request("/api/bank/admin/users");
}

export function updateBankUser(
  id: string,
  change: { role?: BankRole; status?: BankStatus },
): Promise<{ user: BankUser }> {
  return request(
    `/api/bank/admin/users/${encodeURIComponent(id)}`,
    send("PATCH", change),
  );
}

// The per-field messages a 400 answer carries, keyed by field name.
export function fieldErrors(error: unknown): Record<string, string> {
  if (
    error instanceof ApiError &&
    error.body &&
    typeof error.body === "object"
  ) {
    const errors = (error.body as { errors?: Record<string, string> }).errors;
    return errors ?? {};
  }
  return {};
}

export function formatDate(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(
    new Date(iso),
  );
}
