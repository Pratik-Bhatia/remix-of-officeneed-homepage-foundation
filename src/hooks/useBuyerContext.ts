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
 *
 * IMPORTANT -- confirmed live via Shopify's own Storefront API schema
 * introspection and a freshly-issued, genuinely valid token: `BuyerInput`
 * (the type `@inContext(buyer:...)` takes) requires `customerAccessToken`
 * as a mandatory field, and that field's description is explicit --
 * "The customer access token retrieved from the Customer Accounts API."
 * That is Shopify's newer OAuth-based customer accounts, NOT the classic
 * `customerAccessTokenCreate` token this app uses everywhere (see
 * src/lib/customer.ts). Passing the classic token there is unconditionally
 * rejected ("The token provided is not valid") for every signed-in
 * customer, B2B or not -- there is no valid buyer this app can construct
 * today, since it deliberately kept classic customer accounts rather than
 * migrating to the Customer Account API (see src/lib/b2b.functions.ts's
 * header comment for that architectural decision).
 *
 * This is why a non-null return here broke EVERY catalog/search/PDP query
 * for EVERY signed-in customer: `@inContext(buyer: $buyer)` threw on the
 * invalid token, so fetchProducts/fetchProductByHandle/etc. threw too.
 * Returning null keeps every current customer (B2C and B2B alike) on the
 * exact same anonymous query logged-out visitors use -- correct for B2C,
 * and simply not-yet-contextualized for B2B until Customer Account API
 * OAuth is implemented (a separate, deliberate migration, not a bug fix).
 * b2bStore/resolveB2BSession/@inContext/STOREFRONT_QUERY_BUYER etc. are
 * left fully in place for that future work -- nothing architectural here
 * was removed, only the one call site that was building an input Shopify
 * can never accept.
 */
export function useBuyerContext(): BuyerContext {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- kept so this hook still re-renders when either changes, ready for when a valid Customer Account API token becomes available.
  const token = useReactiveCustomerToken();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const companyLocationId = useB2BStore((s) => s.companyLocationId);
  return null;
}
