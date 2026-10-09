import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getMe, type BankAccount } from "./bankApi";

export const BANK_ME_KEY = ["bank", "me"] as const;

// Who is signed in to Playground Bank. One shared query, so the menu, the
// sidebar and every page agree.
export function useBankSession() {
  const query = useQuery({
    queryKey: BANK_ME_KEY,
    queryFn: getMe,
    retry: false,
    staleTime: 30_000,
  });
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
