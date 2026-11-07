// Typed client for the existing server.js API. The React surface is served by
// the same origin (server.js at /app). Every call forwards a runKey so the
// per-runKey flag store can arm isolated drift for a single test.

// One order in the orders table.
export interface Order {
  id: string;
  customer: string;
  status: string;
  total: string;
  region: string;
}

// The orders answer: the orders, plus how the server served them (try number,
// delay, mode).
export interface OrdersResponse {
  attempt: number;
  delayMs: number;
  mode: string;
  orders: Order[];
  refreshedAt: string;
  runKey: string;
}

// One user in the users table.
export interface User {
  id: string;
  name: string;
  role: string;
  status: string;
  createdAt?: string;
}

// The users answer: the list and how many.
export interface UsersResponse {
  users: User[];
  total: number;
}

// Who is signed in to the demo, and whether the page needs a sign-in.
export interface SessionResponse {
  authenticated: boolean;
  authRequired: boolean;
  role?: string;
  user?: { id: string; name: string; role: string; email: string };
}

// The planted-bug switches armed for one runKey.
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

// The flags answer.
export interface FlagsResponse {
  runKey: string;
  flags: AppFlags;
}

// An error from the API that keeps its HTTP status and body.
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

// Every call goes through here: JSON in, JSON out, and any failed status thrown
// as an ApiError.
export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  // Send the call as JSON; a caller's own options win.
  const response = await fetch(path, {
    headers: { "content-type": "application/json" },
    ...init,
  });

  // Read the answer; an empty body is null.
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;

  // A failed call: use the server's own message, or say which status came back.
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

// The orders list, in the mode the page asked for.
export function getOrders(
  mode: string,
  runKey: string,
): Promise<OrdersResponse> {
  return request<OrdersResponse>(`/api/orders?${query({ mode, runKey })}`);
}

// The users list.
export function getUsers(runKey: string): Promise<UsersResponse> {
  return request<UsersResponse>(`/api/users?${query({ runKey })}`);
}

// Add a user with a name and a role.
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

// Who is signed in to the demo.
export function getSession(runKey: string): Promise<SessionResponse> {
  return request<SessionResponse>(`/api/session?${query({ runKey })}`);
}

// The flags armed for this runKey.
export function getFlags(runKey: string): Promise<FlagsResponse> {
  return request<FlagsResponse>(`/api/test/flags?${query({ runKey })}`);
}

// The server's existing demo login. It sets an httpOnly session cookie, which
// the browser sends back on every same-origin request.
export interface LoginResponse {
  message: string;
  user: { id: string; name: string; role: string; email: string };
}

// Log in with an email and a password.
export function login(email: string, password: string): Promise<LoginResponse> {
  return request<LoginResponse>("/api/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

// Log out of the demo.
export function logout(): Promise<{ message: string }> {
  return request<{ message: string }>("/api/logout", { method: "POST" });
}

// One product in the shop.
export interface Product {
  id: string;
  name: string;
  category: string;
  price: number;
  currency: string;
  stock: number;
  status: string;
}

// The products answer: the list and how many.
export interface ProductsResponse {
  products: Product[];
  total: number;
}

// Every product.
export function getProducts(): Promise<ProductsResponse> {
  return request<ProductsResponse>("/api/products");
}

// One product, by its id.
export function getProduct(id: string): Promise<{ product: Product }> {
  return request<{ product: Product }>(`/api/products/${id}`);
}
