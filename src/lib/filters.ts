/**
 * Category-aware product filter system — single source of truth.
 *
 * CATEGORY decides which filter *kinds* are offered (FILTER_KINDS_BY_CATEGORY).
 * The live Shopify catalogue decides which *values* actually appear within
 * each kind (buildFilterGroups tallies real product data — nothing here is a
 * fixed, hand-written value list).
 *
 * Every value here was verified against the live catalogue (226 products,
 * see the filter-system audit) before being wired in. Kinds with no reliable
 * backing data (e.g. Minimum Order — no MOQ field exists anywhere in the
 * catalogue) are deliberately omitted rather than shown with fake options.
 */
import type { ShopifyProductNode } from "./shopify";
import type { MainCategory } from "./taxonomy";
import type { Product } from "./products";

export type FilterOption = { label: string; value: string };
export type FilterGroup = { id: string; label: string; options: FilterOption[] };

type PriceBucket = { value: string; label: string; test: (amount: number) => boolean };

/**
 * Price bucket cutoffs are category-specific because each category's real
 * price distribution is very different (e.g. every priced Fragrance product
 * is >= ₹4,000, so the flat ₹2,000/₹5,000 split used to leave Fragrance's
 * "Under ₹2,000" bucket permanently empty). Cutoffs below were chosen from
 * the live per-category price distribution (~25/50/75th percentiles) so each
 * bucket holds a meaningful share of real products.
 */
const PRICE_BUCKETS_BY_CATEGORY: Record<MainCategory, PriceBucket[]> = {
  "Officeneed Exclusive": [
    { value: "under_100", label: "Under ₹100", test: (a) => a < 100 },
    { value: "100_200", label: "₹100 – ₹200", test: (a) => a >= 100 && a <= 200 },
    { value: "above_200", label: "Above ₹200", test: (a) => a > 200 },
  ],
  "Corporate Gifting": [
    { value: "under_500", label: "Under ₹500", test: (a) => a < 500 },
    { value: "500_2000", label: "₹500 – ₹2,000", test: (a) => a >= 500 && a <= 2000 },
    { value: "above_2000", label: "Above ₹2,000", test: (a) => a > 2000 },
  ],
  "Fragrance Gifting": [
    { value: "under_6000", label: "Under ₹6,000", test: (a) => a < 6000 },
    { value: "6000_10000", label: "₹6,000 – ₹10,000", test: (a) => a >= 6000 && a <= 10000 },
    { value: "above_10000", label: "Above ₹10,000", test: (a) => a > 10000 },
  ],
  "Office Stationery": [
    { value: "under_100", label: "Under ₹100", test: (a) => a < 100 },
    { value: "100_300", label: "₹100 – ₹300", test: (a) => a >= 100 && a <= 300 },
    { value: "above_300", label: "Above ₹300", test: (a) => a > 300 },
  ],
  "Computer Peripherals": [
    { value: "under_700", label: "Under ₹700", test: (a) => a < 700 },
    { value: "700_1500", label: "₹700 – ₹1,500", test: (a) => a >= 700 && a <= 1500 },
    { value: "above_1500", label: "Above ₹1,500", test: (a) => a > 1500 },
  ],
};

/** Which filter kinds each category is allowed to show. The ONLY place this is decided. */
export const FILTER_KINDS_BY_CATEGORY: Record<MainCategory, string[]> = {
  "Officeneed Exclusive": ["price"],
  // Tags/productType for Corporate Gifting just mirror the subcategory the
  // product is already collectioned into (e.g. tag "keychain" == the
  // Keychains subcategory), which the subcategory picker above the grid
  // already covers via real collection membership. No MOQ field exists in
  // the catalogue (confirmed), so Minimum Order is intentionally omitted.
  "Corporate Gifting": ["price"],
  "Fragrance Gifting": ["price", "scentFamily", "volume", "type"],
  // Same "tags == subcategory" situation as Corporate Gifting — no
  // orthogonal Type signal exists beyond the subcategory itself.
  "Office Stationery": ["price"],
  "Computer Peripherals": ["price", "type", "connectivity"],
};

const FILTER_KIND_LABELS: Record<string, string> = {
  price: "Price Range",
  scentFamily: "Scent Family",
  volume: "Volume",
  type: "Type",
  connectivity: "Connectivity",
};

/**
 * Kept in sync with the notes vocabulary `fragrance-engine.ts` already uses
 * to score fragrance recommendations (description + tag substring match).
 * Duplicated here (not imported) because fragrance-engine.ts must not be
 * modified — this is the same deterministic method, not a new classifier.
 */
const FRAGRANCE_NOTES = ["Floral", "Citrus", "Woody", "Spicy", "Fresh", "Sweet", "Fruity", "Musk", "Oriental", "Aquatic"];

/**
 * No Shopify variant option encodes fragrance volume (every fragrance
 * product's only option is "Title: Default Title") — but every product
 * title reliably states it, e.g. "Armani Acqua di Giò Parfum – 100 ml".
 * Verified live: 48/53 fragrance products match this pattern.
 */
const VOLUME_RE = /(\d{2,3})\s?ml\b/i;

/**
 * Verified live: "eau de toilette" / "eau de parfum" appear as literal,
 * non-overlapping phrases in 41/53 fragrance product titles/descriptions.
 * Other real variants (plain "Parfum", "Extrait de Parfum", "EDP") were left
 * out deliberately — merging them in would require guessing which bucket
 * they belong to, which is exactly the fabrication this system must avoid.
 */
const FRAGRANCE_TYPE_PHRASES: Array<{ value: string; label: string; test: RegExp }> = [
  { value: "eau_de_toilette", label: "Eau de Toilette", test: /eau de toilette/i },
  { value: "eau_de_parfum", label: "Eau de Parfum", test: /eau de parfum/i },
];

/** Verified live tags on Computer Peripherals products; reserved out of "type". */
const CONNECTIVITY_TAGS = ["bluetooth", "wireless"];

/**
 * Below this many matching products, a filter *option* is hidden as noise
 * rather than shown as a real choice (e.g. a single one-off typo'd tag like
 * "Adaptar" used on exactly one product). Applied only to open-vocabulary,
 * tag/text-derived kinds — not to the small, fixed price-bucket / fragrance
 * type enumerations, where even a single matching product is a legitimate,
 * expected option.
 */
const MIN_OPTION_PRODUCTS = 2;

function minCountFor(kind: string, mainCategory: MainCategory): number {
  if (kind === "price") return 1;
  if (kind === "type" && mainCategory === "Fragrance Gifting") return 1;
  return MIN_OPTION_PRODUCTS;
}

/**
 * Computes this product's raw values for every filter kind its category
 * supports. Pure and per-product — safe to run once per product when the
 * catalogue loads (see shopify-overlay.ts), no extra Shopify requests.
 */
export function deriveFilterAttributes(
  node: ShopifyProductNode,
  mainCategory: MainCategory | undefined,
  amount: number,
): Record<string, string[]> {
  const attrs: Record<string, string[]> = {};
  if (!mainCategory) return attrs;

  // Price: POA/zero-price products get no bucket at all (never "Under ₹X").
  const buckets = PRICE_BUCKETS_BY_CATEGORY[mainCategory];
  const bucket = amount > 0 ? buckets.find((b) => b.test(amount)) : undefined;
  attrs["price"] = bucket ? [bucket.value] : [];

  if (mainCategory === "Fragrance Gifting") {
    const text = `${node.description ?? ""} ${(node.tags ?? []).join(" ")}`.toLowerCase();
    attrs["scentFamily"] = FRAGRANCE_NOTES.filter((n) => text.includes(n.toLowerCase()));

    const volMatch = node.title.match(VOLUME_RE) ?? (node.description ?? "").match(VOLUME_RE);
    attrs["volume"] = volMatch ? [`${volMatch[1]}ml`] : [];

    const titleText = `${node.title} ${node.description ?? ""}`;
    attrs["type"] = FRAGRANCE_TYPE_PHRASES.filter((t) => t.test.test(titleText)).map((t) => t.value);
  }

  if (mainCategory === "Computer Peripherals") {
    const tags = node.tags ?? [];
    attrs["connectivity"] = tags.filter((t) => CONNECTIVITY_TAGS.includes(t.toLowerCase()));
    attrs["type"] = tags.filter((t) => !CONNECTIVITY_TAGS.includes(t.toLowerCase()));
  }

  return attrs;
}

function labelForValue(mainCategory: MainCategory, kind: string, value: string): string {
  if (kind === "price") {
    return PRICE_BUCKETS_BY_CATEGORY[mainCategory].find((b) => b.value === value)?.label ?? value;
  }
  if (kind === "type" && mainCategory === "Fragrance Gifting") {
    return FRAGRANCE_TYPE_PHRASES.find((t) => t.value === value)?.label ?? value;
  }
  if (kind === "volume") {
    return value.replace(/ml$/i, " ml");
  }
  // scentFamily (already clean words) and Computer Peripherals type/connectivity (raw merchant tags).
  return value;
}

/**
 * Builds the filter sidebar for the current category from the products
 * actually visible in it. Values are tallied from `products` (already
 * scoped to the current category/subcategory) so a subcategory only ever
 * shows options its own products support (Step 3) — no per-subcategory
 * special-casing needed, it falls out of using real data.
 *
 * A whole group is dropped if none of its values clear the noise threshold,
 * so the sidebar never shows an empty heading or a dead option.
 */
export function buildFilterGroups(
  mainCategory: MainCategory | undefined,
  products: Product[],
): FilterGroup[] {
  if (!mainCategory) return [];
  const kinds = FILTER_KINDS_BY_CATEGORY[mainCategory] ?? [];
  const groups: FilterGroup[] = [];

  for (const kind of kinds) {
    const counts = new Map<string, number>();
    for (const p of products) {
      for (const v of p.filterAttributes?.[kind] ?? []) {
        counts.set(v, (counts.get(v) ?? 0) + 1);
      }
    }
    const min = minCountFor(kind, mainCategory);
    const options: FilterOption[] = [...counts.entries()]
      .filter(([, count]) => count >= min)
      .sort((a, b) => b[1] - a[1])
      .map(([value]) => ({ value, label: labelForValue(mainCategory, kind, value) }));

    if (options.length === 0) continue;
    groups.push({ id: kind, label: FILTER_KIND_LABELS[kind] ?? kind, options });
  }

  return groups;
}
