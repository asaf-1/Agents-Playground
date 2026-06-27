import { QueryClient } from "@tanstack/react-query";

// One retry so the orders "flaky" mode (one 503 then success) recovers
// automatically — a realistic data-layer behavior for the framework to observe.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 5_000,
    },
  },
});
