/**
 * Interprets Shopify's own answer for "what does this discount code do to this
 * one product line?" -- never computes a discount itself. Shopify's Storefront
 * API can only validate a code against a cart, so the caller builds a
 * throwaway cart (cartCreate with the line + code) and passes the result here.
 *
 * Shopify reports a single boolean per code (`applicable`); it does NOT say
 * whether a non-applicable code is invalid, expired, used up, below a minimum
 * order, or just not covering this product -- so neither can this.
 */
export type CouponPreview =
  | {
      status: "applied";
      code: string;
      currencyCode: string;
      quantity: number;
      /** Line total before the discount, as calculated by Shopify. */
      originalTotal: number;
      /** Line total after the discount, as calculated by Shopify. */
      discountedTotal: number;
      savings: number;
    }
  | { status: "not-applicable"; code: string }
  | { status: "error"; message: string };

type Money = { amount: string; currencyCode?: string } | null | undefined;
export interface PreviewCartPayload {
  cart?: {
    discountCodes?: Array<{ code: string; applicable: boolean }> | null;
    lines?: { edges?: Array<{ node: { quantity: number; cost?: { subtotalAmount?: Money; totalAmount?: Money } } }> } | null;
  } | null;
  userErrors?: Array<{ message?: string; code?: string }> | null;
}

const num = (m: Money): number => (m ? parseFloat(m.amount) : NaN);

export function interpretPreviewCart(payload: PreviewCartPayload | null | undefined, code: string): CouponPreview {
  const errors = payload?.userErrors ?? [];
  if (errors.length > 0) {
    return { status: "error", message: errors[0]?.message || "This code couldn't be checked for this item." };
  }
  const cart = payload?.cart;
  if (!cart) return { status: "error", message: "This code couldn't be checked right now. Please try again." };

  const entry = (cart.discountCodes ?? []).find((d) => d.code.toUpperCase() === code.toUpperCase());
  if (!entry?.applicable) return { status: "not-applicable", code };

  const line = cart.lines?.edges?.[0]?.node;
  const original = num(line?.cost?.subtotalAmount);
  const discounted = num(line?.cost?.totalAmount);
  if (!line || !Number.isFinite(original) || !Number.isFinite(discounted)) {
    return { status: "error", message: "The code was accepted but the price couldn't be shown. Check the discount at checkout." };
  }
  const savings = Math.round((original - discounted) * 100) / 100;
  // "Applicable" with nothing actually taken off this line is not an applied discount.
  if (savings <= 0) return { status: "not-applicable", code };
  return {
    status: "applied",
    code,
    currencyCode: line.cost?.totalAmount?.currencyCode ?? line.cost?.subtotalAmount?.currencyCode ?? "INR",
    quantity: line.quantity,
    originalTotal: original,
    discountedTotal: discounted,
    savings,
  };
}
