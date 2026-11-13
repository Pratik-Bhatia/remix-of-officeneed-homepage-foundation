import { useEffect, useRef, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { toast } from "sonner";
import { getPromotionByCode } from "@/config/promotions";
import { parseDiscountLink } from "@/lib/discount-link";
import { useCartStore } from "@/stores/cartStore";
import { useCouponStore } from "@/stores/couponStore";
import { DiscountConflictDialog, sameCodes, type DiscountConflict } from "@/components/officeneed/DiscountConflictDialog";

/**
 * Handles storefront discount links (https://officeneed.store/?discount=CODE,
 * see lib/discount-link.ts). Mounted once at the root, so it works on every
 * page. The code is applied to the shopper's real Shopify cart through
 * applyDiscountCodeChecked -- Shopify validates it, and an existing code is
 * never replaced without the shopper confirming (same Keep/Replace dialog
 * as the bag). If the bag is empty (or has no eligible item yet) the code is
 * kept for this tab session and applied as soon as it can be.
 */
export function DiscountLinkHandler() {
  const search = useRouterState({ select: (s) => s.location.searchStr });
  const pending = useCouponStore((s) => s.pendingLinkCode);
  const setPending = useCouponStore((s) => s.setPendingLinkCode);
  const clearPending = useCouponStore((s) => s.clearPendingLinkCode);
  const forgetLinkCode = useCouponStore((s) => s.forgetLinkCode);
  const triedFor = useCouponStore((s) => s.pendingLinkTriedFor);
  const markTried = useCouponStore((s) => s.markPendingLinkTried);
  const selectCode = useCouponStore((s) => s.select);
  const cartId = useCartStore((s) => s.cartId);
  const items = useCartStore((s) => s.items);
  const discountCodes = useCartStore((s) => s.discountCodes);
  const applyChecked = useCartStore((s) => s.applyDiscountCodeChecked);
  const replaceCode = useCartStore((s) => s.replaceDiscountCode);

  const [conflict, setConflict] = useState<DiscountConflict | null>(null);
  const [replacing, setReplacing] = useState(false);
  const attempting = useRef(false);

  // 1. Capture ?discount=CODE (on arrival and on later in-app navigations).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const { code, present, cleanedSearch } = parseDiscountLink(window.location.search);
    if (!present) return;
    // Remove it from the address bar so a reload or a shared URL doesn't re-apply it.
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${cleanedSearch}${window.location.hash}`);
    if (!code) {
      toast.error("That discount link isn't valid.");
      return;
    }
    setPending(code); // also resets "already tried for this bag"
    // A configured promotion also counts as the shopper's selected coupon,
    // so Buy Now carries it for that promotion's own products.
    if (getPromotionByCode(code)) selectCode(code);
    const hasBag = !!useCartStore.getState().cartId && useCartStore.getState().items.length > 0;
    if (!hasBag) toast.info(`${code} will be applied when you add an item to your bag.`);
  }, [search, setPending, selectCode]);

  // 2. Apply it as soon as there's a bag (and again if the bag changes after
  // Shopify said it doesn't apply to the current items).
  const bagKey = items.map((i) => i.variantId).sort().join(",");
  useEffect(() => {
    if (!pending || !cartId || items.length === 0 || attempting.current || conflict) return;
    // Already tried against exactly this bag (persisted for the session, so
    // a reload doesn't re-try or re-announce it): wait for the bag to change.
    if (triedFor === bagKey) return;
    attempting.current = true;
    void (async () => {
      const code = pending;
      const r = await applyChecked(code);
      attempting.current = false;
      if (r.status === "applied") {
        clearPending();
        toast.success(`${code} applied to your bag.`);
      } else if (r.status === "already-applied") {
        clearPending();
      } else if (r.status === "conflict") {
        setConflict({ code: r.code, existing: r.existing, candidateSavings: r.candidateSavings, currencyCode: r.currencyCode });
      } else if (r.status === "not-applicable") {
        markTried(bagKey);
        toast.info(`${r.message} We'll apply ${code} if you add an eligible item.`);
      } else {
        markTried(bagKey); // transient error: retry when the bag changes
      }
    })();
  }, [pending, cartId, bagKey, items.length, conflict, triedFor, applyChecked, clearPending, markTried]);

  const onKeep = () => {
    if (conflict) {
      toast.info(`Kept ${conflict.existing.map((e) => e.code).join(" + ")}.`);
      // Bug K: the shopper declined this link's code -- forget it entirely
      // (pending AND the selection the link set), so Add to Cart / Buy Now
      // can't bring it back.
      forgetLinkCode(conflict.code);
    }
    setConflict(null);
  };

  const onReplace = async () => {
    if (!conflict) return;
    // The bag's codes changed while the dialog was open: re-check instead of
    // replacing something the shopper didn't see.
    if (!sameCodes(conflict.existing.map((e) => e.code), discountCodes.map((d) => d.code))) {
      const fresh = await applyChecked(conflict.code);
      if (fresh.status === "conflict") {
        setConflict({ code: fresh.code, existing: fresh.existing, candidateSavings: fresh.candidateSavings, currencyCode: fresh.currencyCode });
        return;
      }
      setConflict(null);
      clearPending();
      if (fresh.status === "applied") toast.success(`${conflict.code} applied to your bag.`);
      return;
    }
    setReplacing(true);
    const r = await replaceCode(conflict.code);
    setReplacing(false);
    setConflict(null);
    clearPending();
    if (r.status === "applied") toast.success(r.message);
    else toast.error(r.message);
  };

  return <DiscountConflictDialog conflict={conflict} busy={replacing} onKeep={onKeep} onReplace={onReplace} />;
}
