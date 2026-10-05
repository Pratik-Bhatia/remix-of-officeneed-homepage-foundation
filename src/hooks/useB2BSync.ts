import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useB2BStore } from "@/stores/b2bStore";
import { getCustomerToken } from "@/lib/customer";

// Must match TOKEN_EVENT in src/lib/customer.ts (same event useCartSync listens to).
const CUSTOMER_TOKEN_EVENT = "officeneed-customer-token";

/**
 * Keeps the B2B session (companyLocationId/status) in sync with whichever
 * customer is currently signed in, and invalidates every price-bearing
 * React Query cache on each identity transition so a cached B2B/B2C price
 * can never be served to the wrong buyer after a sign-in/sign-out in the
 * same tab. See src/lib/b2b.functions.ts and src/stores/b2bStore.ts for
 * why the lookup itself is never trusted from the client.
 */
export function useB2BSync() {
  const queryClient = useQueryClient();

  useEffect(() => {
    // `undefined` (never a real getCustomerToken() value -- that's always
    // `string | null`) means "never synced yet". Using `null` here was the
    // actual bug: getCustomerToken() also returns `null` for a genuinely
    // anonymous visitor, so `token === lastToken` (null === null) was true
    // on the very first call and the sync bailed out before ever calling
    // reset() -- b2bStore.resolved stayed false forever, and every
    // price-bearing component gated on it (ProductCard's pricePending via
    // useB2BPriceOverlayMap) was stuck on its skeleton permanently for
    // anonymous/incognito visitors. This sentinel guarantees the first
    // sync() call always proceeds, whatever token value it finds.
    let lastToken: string | null | undefined = undefined;

    const sync = async () => {
      const token = getCustomerToken();
      if (import.meta.env.DEV) {
        // Dev-only, never ships to production (tree-shaken by the
        // import.meta.env.DEV check). Booleans/status strings only -- never
        // the token itself or any customer/company data.
        console.debug("[B2BSync] token exists:", !!token, "| status before:", useB2BStore.getState().status, "| resolved before:", useB2BStore.getState().resolved);
      }
      if (token === lastToken) return;
      lastToken = token;
      if (token) {
        await useB2BStore.getState().resolve(token);
      } else {
        useB2BStore.getState().reset();
        if (import.meta.env.DEV) console.debug("[B2BSync] reset() called (no token -- anonymous)");
      }
      if (import.meta.env.DEV) {
        console.debug("[B2BSync] status after:", useB2BStore.getState().status, "| resolved after:", useB2BStore.getState().resolved);
      }
      queryClient.invalidateQueries({ queryKey: ["shopify"] });
    };

    void sync();

    const handleToken = () => void sync();
    window.addEventListener(CUSTOMER_TOKEN_EVENT, handleToken);
    return () => window.removeEventListener(CUSTOMER_TOKEN_EVENT, handleToken);
  }, [queryClient]);
}
