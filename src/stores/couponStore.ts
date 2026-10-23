import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

/**
 * Which campaign code the shopper chose with "Apply Code" on a product page.
 * This is only a pointer to their intent -- it never enforces or calculates
 * anything. The discount itself lives on the Shopify cart / standalone
 * checkout cart (discountCodes), and Shopify decides whether it applies.
 * Kept per browser tab session only.
 */
interface CouponState {
  selectedCode: string | null;
  select: (code: string) => void;
  clear: () => void;
}

export const useCouponStore = create<CouponState>()(
  persist(
    (set) => ({
      selectedCode: null,
      select: (code) => set({ selectedCode: code.toUpperCase() }),
      clear: () => set({ selectedCode: null }),
    }),
    {
      name: "officeneed-selected-coupon",
      storage: createJSONStorage(() => sessionStorage),
      partialize: (s) => ({ selectedCode: s.selectedCode }),
    },
  ),
);
