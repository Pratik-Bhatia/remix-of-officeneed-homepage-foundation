/**
 * Typed product catalogue for the OfficeNeed product listing + detail pages.
 *
 * PLACEHOLDER DATA — this is a thin, replaceable data layer. When a real
 * commerce/CMS backend is connected, swap the `products` export for an API
 * call returning the same `Product` shape; no component changes required.
 */

export type ProductCategory =
  | "Corporate Gifting"
  | "Office Supplies"
  | "Hardware & IT"
  | "Printing & Branding"
  | "Fragrance Gifting";

export type Product = {
  /** URL slug used by /products/$slug */
  slug: string;
  name: string;
  category: ProductCategory;
  subcategories: string[];
  filterAttributes?: Record<string, string[]>;
  /** Short one-line description used on cards and meta descriptions */
  summary: string;
  /** Longer description shown on the detail page */
  description: string;
  /** Display price string, e.g. "₹1,299" — omitted when quote-only */
  price?: string;
  /** True when `price` is a starting/from price */
  startingPrice?: boolean;
  sku?: string;
  availability?: string;
  /** First image is the primary image */
  images: string[];
  badge?: "New" | "Featured";
  /** Sort weight for "Featured" ordering — lower shows first */
  featuredRank?: number;
  /** Newest-first ordering key (ISO date) */
  addedOn: string;
  supportsQuantity?: boolean;
  minimumOrderQuantity?: number;
  specifications?: Array<{ label: string; value: string }>;
  features?: string[];
  variants?: string[];
  packaging?: string;
  customization?: string;
  /** Rich-text (HTML) description straight from the commerce backend */
  descriptionHtml?: string;
  /** Numeric price of the default/selected variant, in major currency units */
  priceAmount?: number;
  currencyCode?: string;
  vendor?: string;
  tags?: string[];
};

/** Category tabs for the listing page. Mirrors the site catalogue naming. */
export const productCategories: Array<"All Products" | ProductCategory> = [
  "All Products",
  "Corporate Gifting",
  "Office Supplies",
  "Hardware & IT",
  "Printing & Branding",
  "Fragrance Gifting",
];

export const productSortOptions = [
  "Featured",
  "Newest",
  "Price: Low to High",
  "Price: High to Low",
  "Name: A–Z",
] as const;

export type ProductSort = (typeof productSortOptions)[number];

const img = (id: string, w = 1200) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=75`;

export const products: Product[] = [];

/** Parses "₹4,999" into a number for sorting. Quote-only products sort last. */
export function priceValue(product: Product): number {
  if (!product.price) return Number.POSITIVE_INFINITY;
  const n = Number(product.price.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
}

export function getProductBySlug(slug: string): Product | undefined {
  return products.find((p) => p.slug === slug);
}

export function getRelatedProducts(product: Product, limit = 4): Product[] {
  const sameCategory = products.filter(
    (p) => p.slug !== product.slug && p.category === product.category,
  );
  const others = products.filter(
    (p) => p.slug !== product.slug && p.category !== product.category,
  );
  return [...sameCategory, ...others].slice(0, limit);
}

export function sortProducts(list: Product[], sort: ProductSort): Product[] {
  const out = [...list];
  switch (sort) {
    case "Newest":
      return out.sort((a, b) => b.addedOn.localeCompare(a.addedOn));
    case "Price: Low to High":
      return out.sort((a, b) => priceValue(a) - priceValue(b));
    case "Price: High to Low":
      return out.sort((a, b) => {
        const av = priceValue(a);
        const bv = priceValue(b);
        if (!Number.isFinite(av) && !Number.isFinite(bv)) return 0;
        if (!Number.isFinite(av)) return 1;
        if (!Number.isFinite(bv)) return -1;
        return bv - av;
      });
    case "Name: A–Z":
      return out.sort((a, b) => a.name.localeCompare(b.name));
    case "Featured":
    default:
      return out.sort(
        (a, b) => (a.featuredRank ?? 999) - (b.featuredRank ?? 999),
      );
  }
}

