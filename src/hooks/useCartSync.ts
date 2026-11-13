import { useEffect } from "react";
import { useCartStore } from "@/stores/cartStore";
import { captureAttribution } from "@/lib/attribution";
import { getCustomerToken } from "@/lib/customer";
import { useCouponStore } from "@/stores/couponStore";

// Must match TOKEN_EVENT in src/lib/customer.ts
const CUSTOMER_TOKEN_EVENT = "officeneed-customer-token";
// Must match TOKEN_KEY in src/lib/customer.ts (localStorage key).
export const CUSTOMER_TOKEN_STORAGE_KEY = "officeneed_customer_token";

/** A sign-in/out or account switch in ANOTHER tab only shows up here as a
 * storage event on the shared token key (TOKEN_EVENT is same-tab only). */
export function isCustomerTokenStorageChange(key: string | null): boolean {
  return key === CUSTOMER_TOKEN_STORAGE_KEY || key === null; // null = storage.clear()
}

export function useCartSync() {
  const syncCart = useCartStore((state) => state.syncCart);
  const syncCustomerCart = useCartStore((state) => state.syncCustomerCart);

  useEffect(() => {
    captureAttribution();
    let lastToken: string | null = null;

    // Pull the signed-in shopper's bag from their account (cross-device).
    const syncAccount = async () => {
      const token = getCustomerToken();
      if (token === lastToken) return false;
      const previousToken = lastToken;
      lastToken = token;
      // Any identity change -- signing out, OR signing in as a different
      // customer with no intermediate sign-out (e.g. a second tab that was
      // already open and still shows a stale sign-in form after another
      // tab just signed in: officeneed_customer_token is one shared
      // localStorage key, so that tab's submit overwrites it directly,
      // previousToken -> a DIFFERENT truthy token, never passing through
      // null) -- must never let the OLD identity's local cart silently
      // become the new identity's cart. clearCart() only resets local
      // state (see cartStore.ts) -- it never deletes the actual Shopify
      // cart or its Supabase saved-cart mapping, so whichever identity
      // is now active still gets its own real saved bag back via
      // syncCustomerCart below (or, for a guest, starts a fresh local one).
      if (previousToken) {
        useCartStore.getState().clearCart();
        // The previous shopper's coupon intent (a selected product-page code
        // or a pending discount link) must not carry into the next identity.
        useCouponStore.getState().resetSession();
      }
      if (!token) return false;
      await syncCustomerCart(token);
      return true;
    };

    void (async () => {
      const synced = await syncAccount();
      if (!synced) await syncCart();
    })();

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") syncCart();
    };
    const handleToken = () => void syncAccount();
    // Another tab changed the bag: pull its state into this tab.
    const handleStorage = (e: StorageEvent) => {
      if (e.key === "shopify-cart") void useCartStore.persist.rehydrate();
      if (isCustomerTokenStorageChange(e.key)) void syncAccount();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener(CUSTOMER_TOKEN_EVENT, handleToken);
    window.addEventListener("storage", handleStorage);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener(CUSTOMER_TOKEN_EVENT, handleToken);
      window.removeEventListener("storage", handleStorage);
    };
  }, [syncCart, syncCustomerCart]);
}
