import { useEffect } from "react";
import { useCartStore } from "@/stores/cartStore";
import { captureAttribution } from "@/lib/attribution";

export function useCartSync() {
  const syncCart = useCartStore((state) => state.syncCart);

  useEffect(() => {
    captureAttribution();
    syncCart();
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") syncCart();
    };
    // Another tab changed the bag: pull its state into this tab.
    const handleStorage = (e: StorageEvent) => {
      if (e.key === "shopify-cart") void useCartStore.persist.rehydrate();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("storage", handleStorage);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("storage", handleStorage);
    };
  }, [syncCart]);
}
