/**
 * Per-product printable / branding-area geometry for the Product Customizer.
 *
 * A `PrintableArea` is expressed entirely in NORMALIZED coordinates -- as a
 * fraction (0-1) of the product image's own rendered bounding box, not the
 * surrounding modal/container. That's what makes it product-specific and
 * resolution-independent: the customizer converts these fractions to actual
 * screen pixels at render time using the image's real measured bounds (see
 * `getImageContentBox` in ProductCustomizer.tsx), so the same config produces
 * a correctly-scaled, correctly-positioned printable area no matter how
 * large the image renders, what its aspect ratio is, or what size the
 * browser/modal currently is.
 *
 * -------------------------------------------------------------------------
 * EXTEND HERE when adding new product types -- do NOT hardcode a printable
 * area's position/size directly in the customizer component.
 * -------------------------------------------------------------------------
 */

import { makeBrandingKey, type ProductBrandingKey } from "./branding-limits";

/** A printable area sized as a fraction of the product image itself --
 * appropriate when the area's on-screen proportions should simply track
 * whatever the image happens to show (most products). */
export interface FractionPrintableArea {
  unit: "fraction";
  /** Left edge, as a fraction (0-1) of the product image's rendered width. */
  x: number;
  /** Top edge, as a fraction (0-1) of the product image's rendered height. */
  y: number;
  /** Width, as a fraction (0-1) of the product image's rendered width. */
  width: number;
  /** Height, as a fraction (0-1) of the product image's rendered height. */
  height: number;
}

/**
 * A printable area with a FIXED PHYSICAL size (mm) -- for a product whose
 * real-world branding surface has a fixed size regardless of how its photo
 * happens to be framed/cropped (e.g. Drinkware's engraving area is always
 * 70x140mm on the physical product, whether the bottle fills 30% or 45% of
 * its photo). Still fully product-image-relative and responsive: converted
 * to on-screen pixels via `referenceWidthMm`/`referenceHeightMm` (the
 * physical width/height, in mm, that the full rendered product image
 * represents on each axis), each re-derived from the image's live measured
 * pixel width/height on every resize -- so the mm size stays physically
 * correct at any preview size.
 *
 * Width and height are calibrated INDEPENDENTLY (two separate reference
 * values, not one shared scale) deliberately: a real product photo's
 * visible body isn't guaranteed to have the same aspect ratio as the
 * printable area's own mm spec (a bottle's photographed body can easily be
 * proportionally narrower/taller than the area's 70:140 (1:2) ratio calls
 * for). Deriving both dimensions from one shared px-per-mm scale forces a
 * choice between an accurate width and an accurate height -- it cannot
 * give you both when the photo and the spec don't share a ratio. Measuring
 * each axis directly against the actual photo (see the Drinkware config
 * below for exactly how) avoids that compromise. This still produces
 * exactly ONE box: both values feed the same single `printableAreaPx`
 * computation in ProductCustomizer.tsx, which is what both the dotted
 * outline and the Framer Motion drag constraint read from -- there is
 * still only one source of truth, it's just calibrated per-axis.
 */
export interface MmPrintableArea {
  unit: "mm";
  /** Fixed physical width of the area, in mm. */
  widthMm: number;
  /** Fixed physical height of the area, in mm. */
  heightMm: number;
  /** Center of the area, as a fraction (0-1) of the product image. */
  centerX: number;
  centerY: number;
  /** The physical width (mm) the FULL rendered product image represents --
   * the mm-to-pixel conversion anchor for the WIDTH axis specifically.
   * Calibrated from the product photo's actual composition; nudge if it
   * doesn't match the real product's physical dimensions. */
  referenceWidthMm: number;
  /** Same idea as `referenceWidthMm`, but for the HEIGHT axis. */
  referenceHeightMm: number;
}

export type PrintableArea = FractionPrintableArea | MmPrintableArea;

/**
 * Fallback printable area for any product NOT listed in
 * `PRODUCT_PRINTABLE_AREAS` below. Matches the customizer's original
 * fixed 55% x 65%, centered box -- but now measured against the actual
 * product image bounds instead of the surrounding panel, so even
 * unconfigured products get a correctly-aligned area.
 */
export const DEFAULT_PRINTABLE_AREA: FractionPrintableArea = {
  unit: "fraction",
  x: 0.225,
  y: 0.175,
  width: 0.55,
  height: 0.65,
};

/**
 * Registry of printable-area geometry per product CATEGORY/SUBCATEGORY.
 *
 * Key = `"${product.category}__${product.subcategories[0]}"` (shared format
 * with `branding-limits.ts` via `makeBrandingKey`). Good for a category
 * whose products share roughly the same printable geometry (e.g. every
 * bottle/tumbler has a similar flat branding face) -- NOT appropriate for a
 * multi-item photo where the printable surface is a specific, irregular
 * region of one particular product's image (see PRODUCT_SLUG_PRINTABLE_AREAS
 * below for that case).
 *
 * Products NOT listed here fall back to `DEFAULT_PRINTABLE_AREA`.
 */
export const PRODUCT_PRINTABLE_AREAS: Record<ProductBrandingKey, PrintableArea> = {
  "Corporate Gifting__Drinkware & Utensils": {
    // Drinkware's branding area is a FIXED physical size on the real
    // product -- 70 x 140mm -- not a fraction of whatever the photo shows,
    // so a fraction-based area here would be wrong the moment two bottle
    // photos frame the bottle at different sizes. See MmPrintableArea.
    //
    // Measured directly from an actual rendered customizer screenshot of
    // this bottle (not the raw product photo file, and not an indirect
    // cross-reference from an unrelated config -- both of those were tried
    // and both under-covered the body, most recently 264mm/single-scale,
    // which still stopped well short of the base). In that screenshot, the
    // image's own object-contain content box measured 538x807px, within
    // which the bottle's usable body -- just below the black neck ring to
    // just above the black base ring -- spanned x:180px (~33.5% of image
    // width) and y:530px (~65.7% of image height), centered at roughly
    // (50.4%, 54.2%) of the image.
    //
    // Those two fractions (33.5% width, 65.7% height) are NOT in a 1:2
    // ratio -- this bottle's photographed body is proportionally narrower/
    // taller than a 70:140mm box. That's exactly why a single shared
    // px-per-mm scale (tried twice) could never get both axes right: fit
    // the width and the height falls short (previous attempt); fit the
    // height and the width overshoots the visible body by a comparable
    // margin. Calibrating each axis to its own measured fraction (see
    // MmPrintableArea's referenceWidthMm/referenceHeightMm) avoids that
    // trade-off entirely -- each dimension is independently accurate:
    //   referenceWidthMm  = 70  / 0.335 ~= 209mm
    //   referenceHeightMm = 140 / 0.657 ~= 213mm (SUPERSEDED, see below)
    //
    // That still rendered visibly short on re-test against a live screenshot
    // (a different bottle variant photo -- white cap + hanging strap, not
    // the black-cap one the numbers above were measured against). Rather
    // than re-measure that new photo's exact pixel proportions from scratch
    // (its precise framing wasn't independently re-verifiable from a static
    // screenshot with confidence beyond ~10-15%), the top edge was confirmed
    // correct (sits right at the neck-ring/body transition) and the height
    // was scaled up ~25% from there, extending the box further down while
    // holding the top edge fixed -- growing only downward, not symmetrically
    // (which would have pushed the top back up into the neck).
    //   new height fraction = 0.657 * 1.25 ~= 0.821  ->  referenceHeightMm = 140 / 0.821 ~= 170mm
    //   centerY recomputed to keep the TOP edge (old centerY - old height/2)
    //   fixed while the box grows only downward: ~0.62
    // If this still doesn't reach the base on the actual product, the
    // direction to keep adjusting is: lower referenceHeightMm further (grows
    // the box) and raise centerY correspondingly (keeps the top anchored).
    unit: "mm",
    widthMm: 70,
    heightMm: 140,
    centerX: 0.50,
    centerY: 0.62,
    referenceWidthMm: 209,
    referenceHeightMm: 170,
  },

  // -- Future products -------------------------------------------------------
  // "Corporate Gifting__Luxury Pens": { unit: "fraction", x: 0.1, y: 0.4, width: 0.8, height: 0.2 },
  // "Corporate Gifting__Diaries": { unit: "fraction", x: 0.25, y: 0.3, width: 0.5, height: 0.4 },
};

/**
 * Registry of printable-area geometry per EXACT PRODUCT (keyed by Shopify
 * handle / `product.slug`). Takes priority over the category-level registry
 * above.
 *
 * Use this for a genuinely single-surface product whose own photo isn't
 * representative of its whole category. NOT for gift sets/hampers -- a
 * multi-item photo has no one coherent printable rectangle to fit, so those
 * are detected separately (ProductCustomizer.tsx's `isGiftSet`, from the
 * product's own "Gift Sets" subcategory) and skip this system entirely,
 * constraining the logo to the full product image instead.
 */
export const PRODUCT_SLUG_PRINTABLE_AREAS: Record<string, PrintableArea> = {
  // "some-single-surface-product-handle": { x: 0.1, y: 0.1, width: 0.5, height: 0.3 },
};

/**
 * Returns the printable-area geometry for a given product: an exact
 * per-product override when one exists, else the product's
 * category/subcategory default, else the shared fallback rectangle.
 */
export function getPrintableArea(category: string, subcategory: string, slug?: string): PrintableArea {
  if (slug && PRODUCT_SLUG_PRINTABLE_AREAS[slug]) {
    return PRODUCT_SLUG_PRINTABLE_AREAS[slug];
  }
  const key = makeBrandingKey(category, subcategory);
  return PRODUCT_PRINTABLE_AREAS[key] ?? DEFAULT_PRINTABLE_AREA;
}
