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
 * to on-screen pixels via `referenceWidthMm` (the physical width, in mm,
 * that the full rendered product image represents), which is re-derived
 * from the image's live measured pixel width on every resize -- so the
 * mm size stays physically correct at any preview size.
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
   * the mm-to-pixel conversion anchor. An estimate calibrated from the
   * product photo's composition; nudge if it doesn't match the real
   * product's physical dimensions. */
  referenceWidthMm: number;
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
    // centerX/centerY (0.485, 0.475) are carried over from this area's
    // previous fraction-based center, measured against an actual
    // single-bottle photo: the cylindrical body between the neck collar and
    // base curve, clear of the cap and any strap/loop hardware.
    //
    // referenceWidthMm (242mm) is derived from this category's EXISTING
    // branding-limits.ts config (previewAreaWidthMm=80 / the old width
    // fraction=0.33) rather than invented fresh -- but it's still an
    // ESTIMATE of the full photo frame's physical width, not a measured
    // fact. If the rendered 70x140mm box doesn't match the bottle's real
    // engraving area, this is the one number to correct.
    unit: "mm",
    widthMm: 70,
    heightMm: 140,
    centerX: 0.485,
    centerY: 0.475,
    referenceWidthMm: 242,
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
