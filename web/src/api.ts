// Typed client for the existing server.js API. The React surface is served by
// the same origin (server.js at /app), so all calls are same-origin.

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

export function getOrders(
  mode: string,
  runKey: string,
): Promise<OrdersResponse> {
  const params = new URLSearchParams({ mode, runKey });
  return request<OrdersResponse>(`/api/orders?${params.toString()}`);
}

export function getUsers(): Promise<UsersResponse> {
  return request<UsersResponse>("/api/users");
}

export function createUser(input: {
  name: string;
  role: string;
}): Promise<{ message: string; user: User }> {
  return request("/api/users", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function getSession(): Promise<SessionResponse> {
  return request<SessionResponse>("/api/session");
}
