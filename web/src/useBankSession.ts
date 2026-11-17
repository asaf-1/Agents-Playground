// Who is signed in to Playground Bank, plus two helpers: put a fresh account
// straight into the cache, and check a ?next= address.

// The data cache, and the bank's "who am I" call.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getMe, type BankAccount } from "./bankApi";

// The cache key for the signed-in account.
export const BANK_ME_KEY = ["bank", "me"] as const;

// Who is signed in to Playground Bank. One shared query, so the menu, the
// sidebar and every page agree.
export function useBankSession() {
  // Ask once and keep the answer for 30 seconds; no retry, because "nobody" is
  // an answer too.
  const query = useQuery({
    queryKey: BANK_ME_KEY,
    queryFn: getMe,
    retry: false,
    staleTime: 30_000,
  });
  // The account, its user, and whether the first answer is still on its way.
  return {
    account: query.data ?? null,
    user: query.data?.user ?? null,
    isLoading: query.isPending,
  };
}

// Every bank answer except "who am I": the accounts, money, cart, notices, keys
// and devices of whoever is signed in. Their keys carry no user, so they must
// be emptied when the person changes.
const OTHER_BANK_QUERIES = {
  queryKey: ["bank"],
  predicate: (query: { queryKey: readonly unknown[] }) =>
    query.queryKey[1] !== "me",
};

// After log-in, sign-up, log-out or a save, the answer already holds the whole
// account (or nobody), so put it straight into the cache instead of asking the
// server again.
export function useSetBankAccount() {
  const queryClient = useQueryClient();
  return (account: BankAccount | null) => {
    // Who was signed in until now.
    const before = queryClient.getQueryData<BankAccount | null>(BANK_ME_KEY);
    queryClient.setQueryData(BANK_ME_KEY, account);
    // A different person, or nobody: stop the last person's requests that are
    // still on their way and empty every bank answer, so a page shows
    // "loading" instead of their numbers. Marking them stale was not enough:
    // the old answer stayed on screen until the new one came (feedback-fixes
    // plan, Part 3; react-bank-switch-account.spec.ts).
    if ((before?.user.id ?? null) !== (account?.user.id ?? null)) {
      void queryClient.cancelQueries(OTHER_BANK_QUERIES);
      void queryClient.resetQueries(OTHER_BANK_QUERIES);
      return;
    }
    // The same person after a save: refresh the rest, in case it changed.
    void queryClient.invalidateQueries(OTHER_BANK_QUERIES);
  };
}

// Only a same-site path like "/settings" is allowed as a ?next= target, so a
// link can't send people to another site after they log in.
export function safeNext(next: string | null): string | null {
  // Refuse an empty value, one that doesn't start with /, a // (another site)
  // and a backslash.
  if (
    !next ||
    !next.startsWith("/") ||
    next.startsWith("//") ||
    next.includes("\\")
  ) {
    return null;
  }
  return next;
}
