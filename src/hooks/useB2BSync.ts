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
    let lastToken: string | null = null;

    const sync = async () => {
      const token = getCustomerToken();
      if (token === lastToken) return;
      lastToken = token;
      if (token) {
        await useB2BStore.getState().resolve(token);
      } else {
        useB2BStore.getState().reset();
      }
      queryClient.invalidateQueries({ queryKey: ["shopify"] });
    };

    void sync();

    const handleToken = () => void sync();
    window.addEventListener(CUSTOMER_TOKEN_EVENT, handleToken);
    return () => window.removeEventListener(CUSTOMER_TOKEN_EVENT, handleToken);
  }, [queryClient]);
}
