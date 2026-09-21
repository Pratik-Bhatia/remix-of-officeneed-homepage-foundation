/**
 * Category-aware "Product Details" schema — single source of truth for
 * which structured fields the PDP's existing Product Details accordion
 * (ProductInformation.tsx, driven by `product.specifications`) shows per
 * category, and which Shopify metafield each field reads from.
 *
 * PHASE 1: Officeneed Exclusive only. Other categories intentionally have
 * no entry here yet -- buildProductSpecifications() returns [] for them,
 * which is exactly today's behavior (product.specifications is never
 * populated for them), so this is a strict no-op for every other category.
 *
 * This does NOT read Shopify itself -- see shopify.ts (query construction)
 * and shopify-overlay.ts (populates product.specifications from live data).
 */
import type { MainCategory } from "./taxonomy";

export type MetafieldIdentifier = { namespace: string; key: string };

type ProductDetailFieldDef = {
  label: string;
  metafield: MetafieldIdentifier;
};

export const PRODUCT_DETAIL_SCHEMA_BY_CATEGORY: Partial<Record<MainCategory, ProductDetailFieldDef[]>> = {
  "Officeneed Exclusive": [
    // COMMON
    { label: "Brand", metafield: { namespace: "product_common", key: "brand" } },
    { label: "Product Type", metafield: { namespace: "product_common", key: "product_type" } },
    { label: "Size / Dimensions", metafield: { namespace: "product_common", key: "dimensions" } },
    // STATIONERY / EXCLUSIVE
    { label: "Pages", metafield: { namespace: "product_stationery", key: "pages" } },
    { label: "Paper Weight", metafield: { namespace: "product_stationery", key: "paper_weight" } },
    { label: "Ruling", metafield: { namespace: "product_stationery", key: "ruling" } },
    { label: "Binding / Cover", metafield: { namespace: "product_stationery", key: "binding" } },
  ],
};

/** Every (namespace, key) pair any defined schema needs -- used to build the Shopify metafields query. */
export const REQUIRED_METAFIELD_IDENTIFIERS: MetafieldIdentifier[] = Array.from(
  new Map(
    Object.values(PRODUCT_DETAIL_SCHEMA_BY_CATEGORY)
      .flat()
      .map((f) => [`${f.metafield.namespace}.${f.metafield.key}`, f.metafield] as const),
  ).values(),
);

export function hasStructuredSchema(category: MainCategory | undefined): boolean {
  return !!category && !!PRODUCT_DETAIL_SCHEMA_BY_CATEGORY[category];
}

/**
 * Builds product.specifications for a category from a metafield lookup.
 * Only fields with a real, non-empty value are included -- never "N/A",
 * never an empty row.
 */
export function buildProductSpecifications(
  category: MainCategory | undefined,
  getMetafieldValue: (namespace: string, key: string) => string | undefined,
): Array<{ label: string; value: string }> {
  const schema = category ? PRODUCT_DETAIL_SCHEMA_BY_CATEGORY[category] : undefined;
  if (!schema) return [];

  const specifications: Array<{ label: string; value: string }> = [];
  for (const field of schema) {
    const value = getMetafieldValue(field.metafield.namespace, field.metafield.key);
    if (value && value.trim()) {
      specifications.push({ label: field.label, value: value.trim() });
    }
  }
  return specifications;
}
