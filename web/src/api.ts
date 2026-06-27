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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
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

function query(params: Record<string, string>): string {
  return new URLSearchParams(params).toString();
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

export function getSession(runKey: string): Promise<SessionResponse> {
  return request<SessionResponse>(`/api/session?${query({ runKey })}`);
}

export function getFlags(runKey: string): Promise<FlagsResponse> {
  return request<FlagsResponse>(`/api/test/flags?${query({ runKey })}`);
}
