/**
 * Storefront-owned discount links: https://officeneed.store/?discount=CODE
 * (works on any page, e.g. /products/x?discount=CODE).
 *
 * Why not Shopify's own https://checkout.officeneed.store/discount/CODE links:
 * those store the code in a cookie on the checkout domain that this
 * storefront can neither read nor clear, and Shopify drops any `redirect`
 * path/query on the way back to officeneed.store -- so the bag can't show the
 * code, and at checkout that cookie can override the code the shopper chose
 * in their bag. A storefront link instead applies the code to the Shopify
 * cart itself (applyDiscountCodeChecked: Shopify validates it, and an
 * existing code is never replaced without the shopper confirming).
 */

/** Shopify discount codes: letters, digits, dash, underscore. Kept strict so
 * a crafted URL can't inject anything unexpected. */
const CODE_PATTERN = /^[A-Z0-9_-]{1,40}$/;

export function normalizeDiscountCode(raw: string | null | undefined): string | null {
  const code = (raw ?? "").trim().toUpperCase();
  return CODE_PATTERN.test(code) ? code : null;
}

/**
 * Reads `discount` from a URL search string. Returns the normalized code (or
 * null if absent/invalid) and the search string with the parameter removed,
 * so the link isn't re-applied on reload or when the page URL is shared.
 */
export function parseDiscountLink(search: string): { code: string | null; present: boolean; cleanedSearch: string } {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  if (!params.has("discount")) return { code: null, present: false, cleanedSearch: search };
  const code = normalizeDiscountCode(params.get("discount"));
  params.delete("discount");
  const rest = params.toString();
  return { code, present: true, cleanedSearch: rest ? `?${rest}` : "" };
}
