import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

/**
 * The shopper's coupon INTENT for this browser tab session -- never enforces
 * or calculates anything. The discount itself lives on the Shopify cart /
 * standalone checkout cart (discountCodes), and Shopify decides whether it
 * applies.
 *
 * - selectedCode: the campaign code chosen with "Apply Code" on a product
 *   page (or arriving via a discount link), carried into Buy Now for that
 *   product's own promotion.
 * - pendingLinkCode: a code from a storefront discount link
 *   (?discount=CODE, see lib/discount-link.ts) waiting to be applied to the
 *   bag -- e.g. the bag was empty when the link was opened, or the bag had no
 *   eligible item yet.
 * - pendingLinkTriedFor: the bag contents (sorted variant ids) the pending
 *   code was last tried against and didn't apply to. Kept for the session,
 *   so a reload doesn't re-try (and re-announce) it for the same bag.
 */
interface CouponState {
  selectedCode: string | null;
  pendingLinkCode: string | null;
  pendingLinkTriedFor: string | null;
  select: (code: string) => void;
  clear: () => void;
  setPendingLinkCode: (code: string) => void;
  clearPendingLinkCode: () => void;
  markPendingLinkTried: (bagKey: string) => void;
  /** The shopper declined a link's code (chose Keep): forget it entirely --
   * the pending code AND a matching selection -- so Add to Cart / Buy Now
   * can't bring it back. */
  forgetLinkCode: (code: string) => void;
  /** Sign-out / account switch: forget the previous shopper's coupon intent. */
  resetSession: () => void;
}

export const useCouponStore = create<CouponState>()(
  persist(
    (set, get) => ({
      selectedCode: null,
      pendingLinkCode: null,
      pendingLinkTriedFor: null,
      select: (code) => set({ selectedCode: code.toUpperCase() }),
      clear: () => set({ selectedCode: null }),
      setPendingLinkCode: (code) => set({ pendingLinkCode: code.toUpperCase(), pendingLinkTriedFor: null }),
      clearPendingLinkCode: () => set({ pendingLinkCode: null, pendingLinkTriedFor: null }),
      markPendingLinkTried: (bagKey) => set({ pendingLinkTriedFor: bagKey }),
      forgetLinkCode: (code) => {
        const upper = code.toUpperCase();
        set({
          pendingLinkCode: get().pendingLinkCode === upper ? null : get().pendingLinkCode,
          pendingLinkTriedFor: get().pendingLinkCode === upper ? null : get().pendingLinkTriedFor,
          selectedCode: get().selectedCode === upper ? null : get().selectedCode,
        });
      },
      resetSession: () => set({ selectedCode: null, pendingLinkCode: null, pendingLinkTriedFor: null }),
    }),
    {
      name: "officeneed-selected-coupon",
      storage: createJSONStorage(() => sessionStorage),
      partialize: (s) => ({ selectedCode: s.selectedCode, pendingLinkCode: s.pendingLinkCode, pendingLinkTriedFor: s.pendingLinkTriedFor }),
    },
  ),
);
