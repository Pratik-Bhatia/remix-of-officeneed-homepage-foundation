// The fragrance fields and their metafield identifiers, kept apart from the
// Markdown/HTML parsing in fragrance-information.ts: the Storefront query
// (shopify.ts) needs only these names, and pages that never show full
// product details shouldn't download the parsers.
export const FRAGRANCE_FIELDS = [
  { label: "Origin", key: "origin", aliases: ["Origin", "Country of Origin"] },
  { label: "Fragrance Family", key: "fragrance_family", aliases: ["Fragrance Family"] },
  { label: "Concentration", key: "concentration", aliases: ["Concentration"] },
  { label: "Size", key: "size", aliases: ["Size", "Volume"] },
  { label: "Gender", key: "gender", aliases: ["Gender"] },
  { label: "Top Notes", key: "top_notes", aliases: ["Top Notes", "Top Note"] },
  { label: "Heart Notes", key: "heart_notes", aliases: ["Heart Notes", "Heart Note", "Middle Notes"] },
  { label: "Base Notes", key: "base_notes", aliases: ["Base Notes", "Base Note"] },
] as const;

// Explicit supported scalar/list metafields; no inferred values from tags or names.
export const FRAGRANCE_METAFIELD_IDENTIFIERS = FRAGRANCE_FIELDS.flatMap(({ key }) =>
  ["product_fragrance", "fragrance", "custom"].map((namespace) => ({ namespace, key })),
);

type FragranceResolver = typeof import("./fragrance-information").resolveFragranceInformation;
let resolver: FragranceResolver | undefined;

/** Called by fragrance-information.ts when it loads, however it was imported. */
export function registerFragranceResolver(fn: FragranceResolver) {
  resolver = fn;
}

/** The fragrance resolver once fragrance-information.ts has loaded, else undefined. */
export function getFragranceResolver(): FragranceResolver | undefined {
  return resolver;
}
