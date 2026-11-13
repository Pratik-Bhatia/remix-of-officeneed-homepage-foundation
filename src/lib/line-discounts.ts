import type { CartItem } from "@/stores/cartStore";

/**
 * The single place Shopify's per-line discount allocations (CartItem.
 * lineDiscounts, copied from CartLine.discountAllocations) are summed. These
 * only ADD UP Shopify's own amounts -- nothing here calculates a discount.
 * Used by the cart summary, the cart row and the coupon card, so they can
 * never disagree.
 */

const round2 = (n: number) => Math.round(n * 100) / 100;
const sameCode = (a: string | null | undefined, b: string) => !!a && a.toUpperCase() === b.toUpperCase();

/** Shopify's total discount on one line; optionally only one code's share. */
export function lineDiscountTotal(item: Pick<CartItem, "lineDiscounts">, code?: string): number {
  let total = 0;
  for (const d of item.lineDiscounts ?? []) {
    if (code !== undefined && !sameCode(d.code, code)) continue;
    total += parseFloat(d.amount.amount) || 0;
  }
  return round2(total);
}

/** Shopify's savings from one code across the whole cart. */
export function codeSavings(items: ReadonlyArray<Pick<CartItem, "lineDiscounts">>, code: string): number {
  return round2(items.reduce((sum, item) => sum + lineDiscountTotal(item, code), 0));
}

/** How many cart lines Shopify discounted with this code. */
export function linesDiscountedBy(items: ReadonlyArray<Pick<CartItem, "lineDiscounts">>, code: string): number {
  return items.filter((item) => (item.lineDiscounts ?? []).some((d) => sameCode(d.code, code))).length;
}
