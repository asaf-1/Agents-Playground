// Typed client for the existing server.js API. The React surface is served by
// the same origin (server.js at /app). Every call forwards a runKey so the
// per-runKey flag store can arm isolated drift for a single test.

export interface Order {
  id: string;
  customer: string;
  status: string;
  total: string;
  region: string;
}

export interface OrdersResponse {
  attempt: number;
  delayMs: number;
  mode: string;
  orders: Order[];
  refreshedAt: string;
  runKey: string;
}

export interface User {
  id: string;
  name: string;
  role: string;
  status: string;
  createdAt?: string;
}

export interface UsersResponse {
  users: User[];
  total: number;
}

export interface SessionResponse {
  authenticated: boolean;
  authRequired: boolean;
  role?: string;
  user?: { id: string; name: string; role: string; email: string };
}

export interface AppFlags {
  userCreateConflict: boolean;
  usersA11yBug: boolean;
  usersLocaleBug: boolean;
  usersSearchStale: boolean;
  ordersRefreshLabel: string;
  authRequired: boolean;
  sessionExpired: boolean;
  // Playground Bank money; the server reads the others itself.
  bankNegativeTransfer?: boolean;
  bankDoubleSubmit?: boolean;
  bankStaleBalance?: boolean;
}

export interface FlagsResponse {
  runKey: string;
  flags: AppFlags;
}

export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    headers: { "content-type": "application/json" },
    ...init,
  });

  const text = await response.text();
  const body = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const message =
      (body && (body.message || body.title || body.code)) ||
      `Request failed with status ${response.status}`;
    throw new ApiError(response.status, message, body);
  }

  return body as T;
}

// "app" is the app's own default run key, meaning "nobody asked for a
// particular one". It is left OUT of the query string so the server falls back
// to the qa_runkey cookie -- which is how practice mode reaches these calls. A
// test that passes its own run key still wins, because an explicit parameter
// beats the cookie.
function query(params: Record<string, string>): string {
  const entries = Object.entries(params).filter(
    ([name, value]) => !(name === "runKey" && (value === "app" || !value)),
  );
  return new URLSearchParams(entries).toString();
}

export function getOrders(
  mode: string,
  runKey: string,
): Promise<OrdersResponse> {
  return request<OrdersResponse>(`/api/orders?${query({ mode, runKey })}`);
}

export function getUsers(runKey: string): Promise<UsersResponse> {
  return request<UsersResponse>(`/api/users?${query({ runKey })}`);
}

export function createUser(
  input: { name: string; role: string },
  runKey: string,
): Promise<{ message: string; user: User }> {
  return request(`/api/users?${query({ runKey })}`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

// Changes a user's role or status through the RBAC-gated PATCH /api/users/:id.
export function updateUser(
  id: string,
  change: { role?: string; status?: string },
  runKey: string,
): Promise<{ message: string; id: string }> {
  return request(`/api/users/${encodeURIComponent(id)}?${query({ runKey })}`, {
    method: "PATCH",
    body: JSON.stringify(change),
  });
}

export function getSession(runKey: string): Promise<SessionResponse> {
  return request<SessionResponse>(`/api/session?${query({ runKey })}`);
}

export function getFlags(runKey: string): Promise<FlagsResponse> {
  return request<FlagsResponse>(`/api/test/flags?${query({ runKey })}`);
}

// The server's existing demo login. It sets an httpOnly session cookie, which
// the browser sends back on every same-origin request.
export interface LoginResponse {
  message: string;
  user: { id: string; name: string; role: string; email: string };
}

export function login(email: string, password: string): Promise<LoginResponse> {
  return request<LoginResponse>("/api/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function logout(): Promise<{ message: string }> {
  return request<{ message: string }>("/api/logout", { method: "POST" });
}

export interface Product {
  id: string;
  name: string;
  category: string;
  price: number;
  currency: string;
  stock: number;
  status: string;
}

export interface ProductsResponse {
  products: Product[];
  total: number;
}

export function getProducts(): Promise<ProductsResponse> {
  return request<ProductsResponse>("/api/products");
}

export function getProduct(id: string): Promise<{ product: Product }> {
  return request<{ product: Product }>(`/api/products/${id}`);
}
