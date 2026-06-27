import { http, HttpResponse } from "msw";

// Default happy-path API mocks for component tests. Individual tests override
// these with server.use(...) to drive error/edge scenarios deterministically.
export const handlers = [
  http.get("/api/orders", () =>
    HttpResponse.json({
      attempt: 1,
      delayMs: 0,
      mode: "stable",
      orders: [
        {
          id: "ORD-1001",
          customer: "Northwind QA",
          status: "Queued",
          total: "$1,420.00",
          region: "US-East",
        },
      ],
      refreshedAt: "2026-01-15T12:00:00Z",
      runKey: "test",
    }),
  ),
  http.get("/api/users", () =>
    HttpResponse.json({
      users: [
        {
          id: "USR-001",
          name: "Ada Lovelace",
          role: "Admin",
          status: "Active",
        },
      ],
      total: 1,
    }),
  ),
  http.get("/api/test/flags", () =>
    HttpResponse.json({ runKey: "test", flags: {} }),
  ),
  http.get("/api/session", () =>
    HttpResponse.json({ authenticated: false, authRequired: false }),
  ),
];
