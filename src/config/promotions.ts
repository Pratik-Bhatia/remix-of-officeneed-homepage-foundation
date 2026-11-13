import type { MainCategory } from "@/lib/taxonomy";

/**
 * The single place the promoted Shopify discount codes are configured. These
 * are public marketing codes (not secrets) that already exist in Shopify --
 * this file never creates or changes a discount.
 *
 * `collectionHandles` mirrors EXACTLY the "Applies to: specific collections"
 * list of each discount in Shopify Admin (handles verified against the live
 * Storefront collection list). It is deliberately NOT derived from the site
 * taxonomy: a taxonomy category is a navigation grouping, not the discount's
 * own configuration (e.g. "Corporate Gifting" includes Electronics and
 * "Fragrance Gifting" includes Body Deodorant, neither of which these codes
 * cover). If a discount's collections change in Shopify, update them here.
 *
 * This list only decides where an offer is ADVERTISED and which items are
 * worth asking Shopify about. Whether a code actually applies -- including
 * OFFICENEED20's one-use-per-customer limit -- is always Shopify's answer
 * (cart discountCodes.applicable + per-line discountAllocations).
 */
export interface CategoryPromotion {
  category: MainCategory;
  /** Short customer-facing name of the category. */
  label: string;
  code: string;
  /** Whole-number percentage, for the offer headline ("10% OFF"). Display only. */
  percentOff: number;
  /** What the code covers, for "Eligible <eligibleLabel> only." helper copy. */
  eligibleLabel: string;
  /** Shopify collection handles the discount applies to (see header comment). */
  collectionHandles: readonly string[];
  /** Customer-facing usage terms, when the discount has any. */
  terms?: string;
  /** Mirrors the discount's Shopify "Combinations" setting. false = it can't
   * be combined with other discounts, so applying it while another code is
   * on the bag always means a replace (the shopper is asked first). */
  combinesWithOtherDiscounts: boolean;
  /** Mirrors a "Limit to one use per customer" usage limit in Shopify. */
  oncePerCustomer: boolean;
}

/**
 * Order matters only for display and for getPromotionForProduct's tie-break:
 * a product in BOTH lists gets the FIRST match. As of the last catalogue check
 * no product belongs to both. In the cart, every applicable offer is shown and
 * the shopper chooses -- nothing is auto-picked there.
 */
export const CATEGORY_PROMOTIONS: readonly CategoryPromotion[] = [
  {
    category: "Fragrance Gifting",
    label: "Fragrance",
    code: "OFFICENEED20",
    percentOff: 20,
    eligibleLabel: "fragrances",
    collectionHandles: ["perfumes", "european-perfume", "eastern-perfume", "perfume-gift-set-1"],
    terms: "One use per customer.",
    combinesWithOtherDiscounts: false,
    oncePerCustomer: true,
  },
  {
    category: "Corporate Gifting",
    label: "Corporate Gifting",
    code: "OFFICENEED10",
    percentOff: 10,
    eligibleLabel: "corporate gifting products",
    collectionHandles: [
      "bags",
      "diaries",
      "luxury-pens",
      "drinkware-utensils",
      "gift-sets",
      "corporate-gifting",
      "metal-pen",
      "keychains",
      "mobile-stand",
    ],
    combinesWithOtherDiscounts: false,
    oncePerCustomer: false,
  },
];

/** Whether a product's Shopify collection handles intersect a promotion's list. */
export function productMatchesPromotion(collectionHandles: readonly string[] | undefined, promo: CategoryPromotion): boolean {
  if (!collectionHandles?.length) return false;
  return collectionHandles.some((h) => promo.collectionHandles.includes(h));
}

/** All promotions a product's collections fall under (usually 0 or 1). */
export function getPromotionsForProduct(collectionHandles: readonly string[] | undefined): CategoryPromotion[] {
  return CATEGORY_PROMOTIONS.filter((p) => productMatchesPromotion(collectionHandles, p));
}

/** The promotion a product qualifies for, from its Shopify collection handles. */
export function getPromotionForProduct(collectionHandles: readonly string[] | undefined): CategoryPromotion | null {
  return CATEGORY_PROMOTIONS.find((p) => productMatchesPromotion(collectionHandles, p)) ?? null;
}

export function getPromotionByCode(code: string): CategoryPromotion | null {
  const want = code.trim().toUpperCase();
  return CATEGORY_PROMOTIONS.find((p) => p.code === want) ?? null;
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
 * route plus real Shopify collection handles matched against each discount's
 * own collection list -- never titles or keywords -- and returns [] (bar
 * hidden) whenever the page can't be confidently tied to a promotion, so a
 * code is never shown somewhere it doesn't belong.
 */
export function getPromotionsForPage(ctx: PromoPageContext): readonly CategoryPromotion[] {
  const path = ctx.pathname.replace(/\/+$/, "") || "/";
  if (path === "/") return CATEGORY_PROMOTIONS;
  if (path === "/products") {
    if (ctx.query?.trim()) return [];
    if (!ctx.collection) return CATEGORY_PROMOTIONS;
    return CATEGORY_PROMOTIONS.filter((p) => p.collectionHandles.includes(ctx.collection!));
  }
  if (path.startsWith("/products/")) {
    const promo = getPromotionForProduct(ctx.productHandles);
    return promo ? [promo] : [];
  }
  return [];
}
