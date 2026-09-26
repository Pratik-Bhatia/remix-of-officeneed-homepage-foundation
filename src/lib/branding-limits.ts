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

/**
 * Gift Sets deliberately have NO entry above -- their multi-item photo has
 * no single print-area width a `maxLogoSizeMm` could meaningfully describe,
 * so their maximum stays fully unconstrained (logoScale up to 100), exactly
 * as before. They still get a physical MINIMUM floor so a logo can't be
 * shrunk to illegibility, using this file's existing mm<->scale% machinery
 * (`computeMinEffectiveScale`'s optional `minSizeMm` param) rather than a
 * second, pixel-based system.
 */
export const GIFT_SET_MIN_LOGO_SIZE_MM = 10;

/**
 * Conversion anchor for the Gift Set minimum: the physical width (mm) the
 * customiser's preview PANEL (not just the product photo -- logoScale% is
 * relative to the panel, same basis as every other product here) is taken
 * to represent. An estimate based on a typical multi-item gift-set photo's
 * framing, not a measured fact -- if 10mm doesn't look physically right on
 * screen, this is the number to adjust.
 */
export const GIFT_SET_REFERENCE_WIDTH_MM = 400;

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

// ---------------------------------------------------------------------------
// Minimum size
// ---------------------------------------------------------------------------

/**
 * The smallest allowed logo: the longest visible dimension must be at least
 * this many millimetres.  Never allow 0, negative, or invalid values.
 */
export const MIN_LOGO_SIZE_MM = 1;

/**
 * Mirror of `computeEffectiveMaxScale` for the lower bound.
 *
 * Returns the minimum `logoScale%` that keeps the longest dimension of the
 * logo at exactly `minSizeMm` (defaults to the global `MIN_LOGO_SIZE_MM`;
 * callers with their own physical floor -- e.g. Gift Sets' 10mm minimum --
 * pass it explicitly instead of duplicating this aspect-ratio math).
 *
 *   Wide / square (aspect >= 1):  width is the longest side.
 *       minScale = mmToLogoScale(minSizeMm, previewAreaWidthMm)
 *
 *   Tall (aspect < 1):  height is the longest side.
 *       minScale = mmToLogoScale(minSizeMm, previewAreaWidthMm) * aspect
 */
export function computeMinEffectiveScale(
  limits: BrandingLimits,
  logoAspect: number,
  minSizeMm: number = MIN_LOGO_SIZE_MM,
): number {
  const minScaleForWidth = mmToLogoScale(minSizeMm, limits.previewAreaWidthMm);
  if (logoAspect >= 1) {
    return minScaleForWidth;
  }
  return minScaleForWidth * logoAspect;
}

/**
 * Given a `logoScale%` and branding limits, return the physical width and
 * height of the logo in mm.
 *
 * The logo renders as `width: X%` with `height: auto` so:
 *   widthMm  = (scale / 100) * previewAreaWidthMm
 *   heightMm = widthMm / aspect
 */
export function scaleToPhysicalMm(
  scale: number,
  limits: BrandingLimits,
  logoAspect: number,
): { widthMm: number; heightMm: number } {
  const widthMm = (scale / 100) * limits.previewAreaWidthMm;
  const heightMm = widthMm / logoAspect;
  return { widthMm, heightMm };
}

/**
 * Inverse of `scaleToPhysicalMm`: given a desired physical width (mm) and
 * the branding limits, return the corresponding `logoScale%`.
 */
export function widthMmToScale(widthMm: number, limits: BrandingLimits): number {
  return (widthMm / limits.previewAreaWidthMm) * 100;
}

/**
 * Inverse via height: given a desired physical height (mm), return logoScale%.
 * heightMm = widthMm / aspect  →  widthMm = heightMm * aspect
 */
export function heightMmToScale(heightMm: number, limits: BrandingLimits, logoAspect: number): number {
  const widthMm = heightMm * logoAspect;
  return widthMmToScale(widthMm, limits);
}
