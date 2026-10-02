import { useEffect, useState } from "react";
import { getCustomerToken } from "@/lib/customer";
import { useB2BStore } from "@/stores/b2bStore";
import type { BuyerContext } from "@/lib/shopify";

// Must match TOKEN_EVENT in src/lib/customer.ts.
const CUSTOMER_TOKEN_EVENT = "officeneed-customer-token";

/** Lightweight reactive read of just the token (no customer profile/orders
 * fetch -- unlike useCustomer(), safe to call from many components at once). */
function useReactiveCustomerToken(): string | null {
  const [token, setToken] = useState<string | null>(() => getCustomerToken());
  useEffect(() => {
    const sync = () => setToken(getCustomerToken());
    sync();
    window.addEventListener(CUSTOMER_TOKEN_EVENT, sync);
    return () => window.removeEventListener(CUSTOMER_TOKEN_EVENT, sync);
  }, []);
  return token;
}

/**
 * The buyer context to pass into any buyer-aware Shopify query
 * (fetchProducts/fetchAllProducts/fetchProductByHandle/fetchRelatedProducts).
 * `companyLocationId` only ever comes from the server-resolved b2bStore --
 * never accept one from a client-controlled source.
 */
export function useBuyerContext(): BuyerContext {
  const token = useReactiveCustomerToken();
  const companyLocationId = useB2BStore((s) => s.companyLocationId);
  if (!token) return null;
  return companyLocationId ? { customerAccessToken: token, companyLocationId } : { customerAccessToken: token };
}
