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

// After log-in, sign-up or a save, the answer already holds the whole account,
// so put it straight into the cache instead of asking the server again.
export function useSetBankAccount() {
  const queryClient = useQueryClient();
  // Store the account, then refresh every other bank query, since they may
  // belong to someone else now.
  return (account: BankAccount | null) => {
    queryClient.setQueryData(BANK_ME_KEY, account);
    void queryClient.invalidateQueries({
      queryKey: ["bank"],
      predicate: (query) => query.queryKey[1] !== "me",
    });
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
