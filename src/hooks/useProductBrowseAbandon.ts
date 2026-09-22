import { useEffect, useRef } from "react";
import { sendProductBrowseAbandon } from "@/lib/kwikengage.functions";
import { getRememberedContactPhone } from "@/lib/contact-phone";
import { getCustomerToken } from "@/lib/customer";

/**
 * Fires a single KwikEngage WhatsApp trigger when the shopper leaves or hides
 * the product page (tab close, navigation away, backgrounding on mobile).
 */
export function useProductBrowseAbandon(product: { handle: string; title: string } | null | undefined) {
  const sentRef = useRef(false);

  useEffect(() => {
    if (!product?.handle) return;
    sentRef.current = false;

    const fire = () => {
      if (sentRef.current) return;
      const phone = getRememberedContactPhone();
      const customerToken = getCustomerToken();
      if (!phone && !customerToken) return;
      sentRef.current = true;
      void sendProductBrowseAbandon({
        data: {
          productHandle: product.handle,
          productTitle: product.title,
          productUrl: window.location.href,
          ...(phone ? { phone } : {}),
          ...(customerToken ? { customerToken } : {}),
        },
      }).catch(() => {
        /* trigger is best-effort -- never disrupt the shopper */
      });
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") fire();
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", fire);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", fire);
      // Leaving the product page by in-app navigation counts as abandoning it.
      fire();
    };
  }, [product?.handle, product?.title]);
}
