// Hooks for the bank's money: the account list, a refresh after any change, and
// links that keep the runKey.

// The data cache, and the call that lists the accounts.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listMoneyAccounts } from "./bankApi";

// Every money query lives under this key, so one invalidation refreshes the
// overview, an account page and the activity list together.
export const MONEY_KEY = ["bank", "money"] as const;

// Balances are kept for a minute; every change to money refreshes them
// straight away instead (useRefreshMoney).
export function useMoneyAccounts(runKey: string, enabled: boolean) {
  return useQuery({
    queryKey: [...MONEY_KEY, "accounts", runKey],
    queryFn: () => listMoneyAccounts(runKey),
    staleTime: 60_000,
    enabled,
  });
}

// Refreshes every money query at once, after any transfer or payment.
export function useRefreshMoney() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: MONEY_KEY });
}

// Links between bank pages keep a test's runKey, so a bug armed for one test
// stays armed as it clicks through.
export function bankPath(path: string, runKey: string): string {
  // The shared "app" key needs nothing added.
  if (runKey === "app") {
    return path;
  }
  // Add the runKey with ? or &, whichever the path needs.
  const join = path.includes("?") ? "&" : "?";
  return `${path}${join}runKey=${encodeURIComponent(runKey)}`;
}
