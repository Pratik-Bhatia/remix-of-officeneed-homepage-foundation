/**
 * Requests a resized render of a Shopify CDN image instead of its full
 * original-resolution asset -- every product image in this app (product
 * cards, PDP gallery/zoom/sticky-bar, cart line items) was previously
 * passed straight through from the Storefront API's `url` field
 * (confirmed live: `cdn.shopify.com/s/files/.../name.webp?v=...`, no
 * transform params) at whatever resolution the merchant originally
 * uploaded, often far larger than its actual rendered size on screen.
 *
 * Shopify's CDN resizes/reformats on request via a `width` query param on
 * the SAME url (no separate asset, no architecture change, no quality/
 * transparency loss beyond requesting a smaller render -- this is the
 * standard mechanism every Shopify storefront uses). Falls back to the
 * original url unchanged for anything that isn't a Shopify CDN url, so
 * this is always safe to apply even if a url's origin ever changes.
 */
export function shopifyImageUrl(url: string | null | undefined, width: number): string {
  if (!url) return "";
  if (!url.includes("cdn.shopify.com")) return url;
  try {
    const parsed = new URL(url);
    parsed.searchParams.set("width", String(Math.round(width)));
    return parsed.toString();
  } catch {
    return url;
  }
}

/** `srcset` of the same Shopify image at several widths, so the browser picks the smallest that
 * still covers its rendered size x pixel density. Undefined for non-Shopify urls (no variants). */
export function shopifyImageSrcSet(url: string | null | undefined, widths: number[]): string | undefined {
  if (!url || !url.includes("cdn.shopify.com")) return undefined;
  return widths.map((w) => `${shopifyImageUrl(url, w)} ${w}w`).join(", ");
}
