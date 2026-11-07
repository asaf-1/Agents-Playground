// Two hooks every page uses: the test's runKey from the address, and the
// planted-bug flags armed for it.

// The address's ?query part, the data cache, and the flags call.
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getFlags, type AppFlags } from "./api";

// Each page reads its runKey from the URL (?runKey=...), defaulting to "app".
// Tests navigate with a unique runKey so armed drift stays isolated to one test.
export function useRunKey(): string {
  const [params] = useSearchParams();
  return params.get("runKey") || "app";
}

// Resolved drift flags for the active runKey (defaults are non-drifted).
export function useAppFlags(runKey: string): AppFlags | undefined {
  // Ask the server for this runKey's flags, fresh every time.
  const { data } = useQuery({
    queryKey: ["flags", runKey],
    queryFn: () => getFlags(runKey),
    staleTime: 0,
  });
  return data?.flags;
}
