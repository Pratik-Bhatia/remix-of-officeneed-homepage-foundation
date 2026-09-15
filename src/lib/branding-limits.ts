/**
 * Physical branding-size limits for the Product Customizer.
 *
 * All `maxLogoSizeMm` values represent the maximum physical dimension
 * (longest side -- width OR height) of the printed / engraved logo on the
 * actual physical product, measured in millimetres.
 *
 * These are NOT screen-pixel or CSS constraints; they are real-world limits
 * set by the production process for each product type and printing method.
 *
 * `previewAreaWidthMm` is the physical width (mm) of the visible branding
 * area shown inside the customiser's preview constraint box.  It is the
 * reference that converts "mm" into a `logoScale` percentage without
 * requiring knowledge of the bottle's total printable circumference.
 *
 * -------------------------------------------------------------------------
 * EXTEND HERE when adding new product types -- do NOT scatter mm values
 * across components.
 * -------------------------------------------------------------------------
 */

export type PrintingMethod = "Laser Engraving" | "UV Printing";

export interface BrandingLimits {
  /**
   * Maximum physical dimension of the logo's visible bounding box in mm.
   * The longest side (width OR height) of the logo must never exceed this.
   *
   * Examples at maxLogoSizeMm = 30:
   *   30 x 10 mm  -> valid          (longest side = 30)
   *   10 x 30 mm  -> valid          (longest side = 30)
   *   40 x 15 mm  -> must scale down (longest side 40 > 30)
   *   15 x 40 mm  -> must scale down (longest side 40 > 30)
   */
  maxLogoSizeMm: number;

  /**
   * Physical width (mm) of the branding constraint preview area shown in
   * the customiser.  Used purely as a reference to convert mm <-> logoScale%.
   *
   * This is the visible flat face of the product as rendered in the preview,
   * NOT the total bottle circumference or total printable wrap width.
   */
  previewAreaWidthMm: number;
}

/** Key format: `"${category}__${subcategory}"` */
export type ProductBrandingKey = string;

export type ProductBrandingConfig = Partial<Record<PrintingMethod, BrandingLimits>>;

/**
 * Central registry of physical branding limits per product type.
 *
 * Key  = `"${product.category}__${product.subcategories[0]}"`
 *
 * Products NOT listed here are unconstrained -- the customiser behaves exactly
 * as before (scale 0-100, no physical cap).
 */
export const PRODUCT_BRANDING_LIMITS: Record<ProductBrandingKey, ProductBrandingConfig> = {
  "Corporate Gifting__Drinkware & Utensils": {
    /**
     * Bottle / Drinkware physical branding limits:
     *   Laser Engraving -> maximum logo size: 30 mm
     *   UV Printing     -> maximum logo size: 25 mm
     *
     * previewAreaWidthMm = 80:  the branding constraint area in the preview
     * represents approximately 80 mm of the physical product flat face.
     */
    "Laser Engraving": { maxLogoSizeMm: 30, previewAreaWidthMm: 80 },
    "UV Printing":     { maxLogoSizeMm: 25, previewAreaWidthMm: 80 },
  },

  // -- Future products -------------------------------------------------------
  // "Corporate Gifting__Luxury Pens": {
  //   "Laser Engraving": { maxLogoSizeMm: XX, previewAreaWidthMm: YY },
  //   "UV Printing":     { maxLogoSizeMm: XX, previewAreaWidthMm: YY },
  // },
  // "Corporate Gifting__Diaries": {
  //   "Laser Engraving": { maxLogoSizeMm: XX, previewAreaWidthMm: YY },
  //   "UV Printing":     { maxLogoSizeMm: XX, previewAreaWidthMm: YY },
  // },
};

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

export function makeBrandingKey(category: string, subcategory: string): ProductBrandingKey {
  return `${category}__${subcategory}`;
}

/**
 * Returns the branding limits for a given product + printing method,
 * or `null` when no limits are configured for that combination.
 */
export function getBrandingLimits(
  category: string,
  subcategory: string,
  method: PrintingMethod,
): BrandingLimits | null {
  const key = makeBrandingKey(category, subcategory);
  return PRODUCT_BRANDING_LIMITS[key]?.[method] ?? null;
}

// ---------------------------------------------------------------------------
// Scale conversion helpers
// ---------------------------------------------------------------------------

/**
 * Convert a physical mm size to a `logoScale` percentage (0-100).
 *
 * `logoScale` is expressed as a percentage of the preview constraint-box width, so:
 *   logoScale = (sizeMm / previewAreaWidthMm) x 100
 */
export function mmToLogoScale(sizeMm: number, previewAreaWidthMm: number): number {
  return (sizeMm / previewAreaWidthMm) * 100;
}

/**
 * Compute the effective maximum logoScale% for a logo with the given
 * aspect ratio (naturalWidth / naturalHeight).
 *
 * The logo renders as `width: X%` with `height: auto`, so the
 * longest-dimension constraint works differently for wide vs tall logos:
 *
 *   Wide / square (aspect >= 1):  width is the longest side.
 *       maxScale = mmToLogoScale(maxLogoSizeMm, previewAreaWidthMm)
 *
 *   Tall (aspect < 1):  height is the longest side.
 *       rendered_height_mm = (scale / 100) * previewAreaWidthMm / aspect
 *       Solving for scale when rendered_height_mm = maxLogoSizeMm:
 *       maxScale = mmToLogoScale(maxLogoSizeMm, previewAreaWidthMm) * aspect
 */
export function computeEffectiveMaxScale(
  limits: BrandingLimits,
  logoAspect: number,
): number {
  const maxScaleForWidth = mmToLogoScale(limits.maxLogoSizeMm, limits.previewAreaWidthMm);
  if (logoAspect >= 1) {
    // Wide or square -- constrain the width directly
    return maxScaleForWidth;
  }
  // Tall -- constrain via the height; width must shrink proportionally
  return maxScaleForWidth * logoAspect;
}
