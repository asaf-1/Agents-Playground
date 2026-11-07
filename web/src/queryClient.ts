// The one data cache every page shares (TanStack Query), and how it retries and
// refreshes.

// TanStack Query's cache.
import { QueryClient } from "@tanstack/react-query";

// One retry so the orders "flaky" mode (one 503 then success) recovers
// automatically — a realistic data-layer behavior for the framework to observe.
export const queryClient = new QueryClient({
  defaultOptions: {
    // For every query: retry once, don't refetch when the window gets focus,
    // and keep an answer fresh for 5 seconds.
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 5_000,
    },
  },
});
