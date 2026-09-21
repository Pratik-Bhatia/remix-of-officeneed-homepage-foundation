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

export type PriceBucket = { value: string; label: string; test: (amount: number) => boolean };

function formatINR(n: number): string {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

/** Rounds a raw cutoff to a "nice" step sized to its own magnitude (₹297 -> ₹300, not ₹297). */
function niceRound(n: number): number {
  if (n < 200) return Math.round(n / 10) * 10;
  if (n < 1000) return Math.round(n / 50) * 50;
  if (n < 5000) return Math.round(n / 100) * 100;
  if (n < 20000) return Math.round(n / 500) * 500;
  return Math.round(n / 1000) * 1000;
}

/**
 * Price buckets are computed from the real price distribution of the
 * products actually in scope (the current category or subcategory) rather
 * than a fixed, hand-picked table. A fixed per-category table breaks down
 * the moment a category contains subcategories with very different price
 * ranges -- e.g. Fragrance Gifting's ₹4,000+ imported perfumes vs. its
 * Body Deodorant subcategory, which is entirely ₹225-₹349. Cutoffs are the
 * real 33rd/66th percentile of the visible products' prices, rounded to a
 * readable step, so buckets always reflect what's actually on screen.
 */
export function computePriceBuckets(products: Product[]): PriceBucket[] {
  const amounts = products
    .map((p) => p.priceAmount)
    .filter((a): a is number => typeof a === "number" && a > 0)
    .sort((a, b) => a - b);
  if (amounts.length === 0) return [];

  const min = amounts[0]!;
  const max = amounts[amounts.length - 1]!;
  if (min === max) return []; // every visible product costs the same -- a price filter would be meaningless

  const at = (p: number) => amounts[Math.min(amounts.length - 1, Math.floor(amounts.length * p))]!;
  const cut1 = niceRound(at(1 / 3));
  let cut2 = niceRound(at(2 / 3));
  if (cut2 <= cut1) cut2 = niceRound(cut1 + Math.max(1, max - cut1));
  if (cut2 <= cut1) cut2 = cut1 + 1;

  const buckets: PriceBucket[] = [
    { value: `under_${cut1}`, label: `Under ${formatINR(cut1)}`, test: (a) => a < cut1 },
    { value: `${cut1}_${cut2}`, label: `${formatINR(cut1)} – ${formatINR(cut2)}`, test: (a) => a >= cut1 && a <= cut2 },
    { value: `above_${cut2}`, label: `Above ${formatINR(cut2)}`, test: (a) => a > cut2 },
  ];

  // Drop any bucket none of the currently visible products actually fall into.
  return buckets.filter((b) => amounts.some((a) => b.test(a)));
}

/** Which filter kinds each category is allowed to show. The ONLY place this is decided. */
export const FILTER_KINDS_BY_CATEGORY: Record<MainCategory, string[]> = {
  "Officeneed Exclusive": ["price"],
  // Tags/productType for Corporate Gifting just mirror the subcategory the
  // product is already collectioned into (e.g. tag "keychain" == the
  // Keychains subcategory), which the subcategory picker above the grid
  // already covers via real collection membership. No MOQ field exists in
  // the catalogue (confirmed), so Minimum Order is intentionally omitted.
  "Corporate Gifting": ["price"],
  // "gender" only produces a group for subcategories whose products actually
  // carry a "Men Deodorant"/"Women Deodorant" tag (currently Body Deodorant
  // only -- European/Middle Eastern Perfume use different, non-gendered tags),
  // so it's harmless to offer at the category level: buildFilterGroups drops
  // any group with no qualifying options.
  "Fragrance Gifting": ["price", "gender", "scentFamily", "volume", "type"],
  // Same "tags == subcategory" situation as Corporate Gifting — no
  // orthogonal Type signal exists beyond the subcategory itself.
  "Office Stationery": ["price"],
  "Computer Peripherals": ["price", "type", "connectivity"],
};

const FILTER_KIND_LABELS: Record<string, string> = {
  price: "Price Range",
  gender: "Gender",
  scentFamily: "Scent Family",
  volume: "Volume",
  type: "Type",
  connectivity: "Connectivity",
};

/** Verified live: Body Deodorant products carry a literal "Men Deodorant" / "Women Deodorant" tag. */
const GENDER_TAGS: Array<{ value: string; label: string; tag: string }> = [
  { value: "men", label: "Men", tag: "men deodorant" },
  { value: "women", label: "Women", tag: "women deodorant" },
];

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
  if (kind === "type" && mainCategory === "Fragrance Gifting") return 1;
  if (kind === "gender") return 1;
  return MIN_OPTION_PRODUCTS;
}

/**
 * Computes this product's raw values for every filter kind its category
 * supports. Pure and per-product — safe to run once per product when the
 * catalogue loads (see shopify-overlay.ts), no extra Shopify requests.
 * Price is handled separately (see computePriceBuckets) since it depends on
 * the price distribution of the current view, not just the single product.
 */
export function deriveFilterAttributes(
  node: ShopifyProductNode,
  mainCategory: MainCategory | undefined,
): Record<string, string[]> {
  const attrs: Record<string, string[]> = {};
  if (!mainCategory) return attrs;

  if (mainCategory === "Fragrance Gifting") {
    const tags = (node.tags ?? []).map((t) => t.toLowerCase());
    attrs["gender"] = GENDER_TAGS.filter((g) => tags.includes(g.tag)).map((g) => g.value);

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
  if (kind === "gender") {
    return GENDER_TAGS.find((g) => g.value === value)?.label ?? value;
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
    if (kind === "price") {
      const buckets = computePriceBuckets(products);
      const options: FilterOption[] = buckets
        .filter((b) => products.some((p) => typeof p.priceAmount === "number" && b.test(p.priceAmount)))
        .map((b) => ({ value: b.value, label: b.label }));
      if (options.length > 0) groups.push({ id: "price", label: FILTER_KIND_LABELS["price"]!, options });
      continue;
    }

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
