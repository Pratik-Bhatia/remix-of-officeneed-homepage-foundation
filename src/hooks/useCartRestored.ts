import { useEffect, useState } from "react";
import { useCartStore } from "@/stores/cartStore";

/**
 * True once the persisted cart (localStorage, see cartStore's `persist`) has
 * been restored in this browser. Always false during server rendering and
 * the first client render -- the server can't read localStorage -- so
 * callers show a skeleton instead of a misleading "Your Bag is Empty" or
 * zero count, and the first client render matches the server HTML.
 */
export function useCartRestored(): boolean {
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    const persist = useCartStore.persist;
    if (persist.hasHydrated()) {
      setRestored(true);
      return;
    }
    return persist.onFinishHydration(() => setRestored(true));
  }, []);
  return restored;
}
