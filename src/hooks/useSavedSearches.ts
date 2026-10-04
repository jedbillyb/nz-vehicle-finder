import { useQuery } from "@tanstack/react-query";
import { fetchSavedSearches } from "@/lib/account";

export const SAVED_SEARCHES_KEY = ["saved-searches"];

/** The signed-in user's saved searches; null when nobody is signed in. */
export function useSavedSearches() {
  return useQuery({
    queryKey: SAVED_SEARCHES_KEY,
    queryFn: fetchSavedSearches,
    staleTime: 60 * 1000,
    retry: false,
  });
}
