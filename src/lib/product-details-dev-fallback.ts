/**
 * ============================================================================
 * TEMPORARY — PHASE 1 DEV/VERIFICATION FALLBACK ONLY.
 * ============================================================================
 *
 * No Shopify product currently has the `product_common` / `product_stationery`
 * metafields populated (that is a separate, not-yet-done Shopify Admin task —
 * see the Phase 1 implementation report). Without this file, every Officeneed
 * Exclusive product's `product.specifications` would be empty right now and
 * the new architecture could not be exercised end-to-end before real metafield
 * data exists.
 *
 * This supplies the SAME real facts already visible in each product's live
 * Shopify description (used only as a same-source stand-in for the metafield
 * that description would be migrated into), for the exact three products
 * named in the Phase 1 task, and NOTHING else. It is consulted only when the
 * real Shopify metafield lookup returns nothing for that field.
 *
 * DELETE THIS FILE (and its one call site in shopify-overlay.ts) once the
 * `product_common` / `product_stationery` metafields are populated in Shopify
 * Admin for real Officeneed Exclusive products. Real metafield values always
 * take priority over this and make it a no-op the moment they exist.
 */

const DEV_FALLBACK_BY_HANDLE: Record<string, Record<string, string>> = {
  "officeneed-unruled-notebook-a5-40-pages": {
    "product_common.brand": "Officeneed",
    "product_common.product_type": "Unruled Notebook",
    "product_common.dimensions": "A5 (148mm x 210mm)",
    "product_stationery.pages": "40",
    "product_stationery.paper_weight": "100gsm",
    "product_stationery.ruling": "Unruled",
  },
  "officeneed-unruled-wiro-book-flexible-geometric": {
    "product_common.brand": "Officeneed",
    "product_common.product_type": "Unruled Wiro Book",
    "product_common.dimensions": "A4",
    "product_stationery.pages": "250",
    "product_stationery.paper_weight": "100 GSM",
    "product_stationery.ruling": "Unruled",
    "product_stationery.binding": "Wiro binding, 270 GSM non-tearable PVC cover",
  },
  "practical-sheets-for-college-one-side-ruled-50-sheets": {
    "product_common.brand": "Officeneed",
    "product_common.product_type": "Practical Sheets",
    "product_common.dimensions": "Letter (22.8cm x 28.8cm)",
    "product_stationery.pages": "50",
    "product_stationery.paper_weight": "100gsm",
    "product_stationery.ruling": "One Side Ruled",
  },
};

export function getDevFallbackMetafieldValue(
  handle: string,
  namespace: string,
  key: string,
): string | undefined {
  return DEV_FALLBACK_BY_HANDLE[handle]?.[`${namespace}.${key}`];
}
