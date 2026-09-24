import { useEffect } from "react";
import { useCartStore } from "@/stores/cartStore";
import { captureAttribution } from "@/lib/attribution";
import { getCustomerToken } from "@/lib/customer";

// Must match TOKEN_EVENT in src/lib/customer.ts
const CUSTOMER_TOKEN_EVENT = "officeneed-customer-token";

export function useCartSync() {
  const syncCart = useCartStore((state) => state.syncCart);
  const syncCustomerCart = useCartStore((state) => state.syncCustomerCart);

  useEffect(() => {
    captureAttribution();
    let lastToken: string | null = null;

    // Pull the signed-in shopper's bag from their account (cross-device).
    const syncAccount = async () => {
      const token = getCustomerToken();
      if (!token) {
        lastToken = null;
        return false;
      }
      if (token === lastToken) return false;
      lastToken = token;
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
