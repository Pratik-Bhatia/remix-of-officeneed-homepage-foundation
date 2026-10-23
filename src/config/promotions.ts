import { productBelongsToCategory, type MainCategory } from "@/lib/taxonomy";

/**
 * The single place the promoted Shopify discount codes are configured. These
 * are public marketing codes (not secrets) that already exist in Shopify --
 * this file never creates or changes a discount. Eligibility is decided by
 * the product's real Shopify collection handles via the shared taxonomy, never
 * by title/keyword matching; whether a code actually applies to a given cart
 * is always confirmed by Shopify itself (cartDiscountCodesUpdate -> applicable).
 */
export interface CategoryPromotion {
  category: MainCategory;
  /** Short customer-facing name of the category. */
  label: string;
  code: string;
  /** What the code covers, for "Eligible <eligibleLabel> only." helper copy. */
  eligibleLabel: string;
}

/**
 * Order matters: a product in BOTH categories gets the FIRST match, so
 * Fragrance (OFFICENEED20) wins over Corporate Gifting (OFFICENEED10). As of
 * the last catalogue check (330 products: 99 fragrance, 58 corporate) no
 * product belongs to both, so this rule currently affects nothing. Shopify
 * still decides what actually applies at the cart.
 */
export const CATEGORY_PROMOTIONS: readonly CategoryPromotion[] = [
  { category: "Fragrance Gifting", label: "Fragrance", code: "OFFICENEED20", eligibleLabel: "fragrances" },
  { category: "Corporate Gifting", label: "Corporate Gifting", code: "OFFICENEED10", eligibleLabel: "corporate gifting products" },
];

/** The promotion a product qualifies for, from its Shopify collection handles. */
export function getPromotionForProduct(collectionHandles: string[] | undefined): CategoryPromotion | null {
  return CATEGORY_PROMOTIONS.find((p) => productBelongsToCategory(collectionHandles, p.category)) ?? null;
}

/**
 * The code a standalone (Buy Now) cart should carry: only this product's own
 * configured promotion, and only when the shopper has asked for it -- either
 * it is currently applied (applicable) on the main cart, or it is the code they
 * selected with "Apply Code". Never another category's code. Shopify still
 * validates it (and the caller reports it if Shopify declines).
 */
export function getPromotionCodeToCarry(
  collectionHandles: string[] | undefined,
  appliedCodes: ReadonlyArray<{ code: string; applicable: boolean }>,
  selectedCode?: string | null,
): string | null {
  const promo = getPromotionForProduct(collectionHandles);
  if (!promo) return null;
  const want = promo.code.toUpperCase();
  const applied = appliedCodes.some((d) => d.applicable && d.code.toUpperCase() === want);
  const selected = !!selectedCode && selectedCode.toUpperCase() === want;
  return applied || selected ? promo.code : null;
}

export interface PromoPageContext {
  pathname: string;
  /** `?collection=` handle on the /products listing. */
  collection?: string | undefined;
  /** `?q=` search text on the /products listing. */
  query?: string | undefined;
  /** Shopify collection handles of the product on a /products/$slug page. */
  productHandles?: string[] | undefined;
}

/**
 * Which promotions the announcement bar may show on a page. Uses only the
 * route plus real Shopify collection handles through the shared taxonomy --
 * never titles or keywords -- and returns [] (bar hidden) whenever the page
 * can't be confidently tied to a promoted category, so a category-specific
 * code is never shown somewhere it doesn't belong.
 */
export function getPromotionsForPage(ctx: PromoPageContext): readonly CategoryPromotion[] {
  const path = ctx.pathname.replace(/\/+$/, "") || "/";
  if (path === "/") return CATEGORY_PROMOTIONS;
  if (path === "/products") {
    if (ctx.query?.trim()) return [];
    if (!ctx.collection) return CATEGORY_PROMOTIONS;
    return CATEGORY_PROMOTIONS.filter((p) => productBelongsToCategory([ctx.collection!], p.category));
  }
  if (path.startsWith("/products/")) {
    const promo = getPromotionForProduct(ctx.productHandles);
    return promo ? [promo] : [];
  }
  return [];
}
