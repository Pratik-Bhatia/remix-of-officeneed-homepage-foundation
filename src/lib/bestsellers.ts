import type { Product } from "./products";

export type BestsellerCategory =
  | "Corporate Gifting"
  | "Office Stationery"
  | "Computer Peripherals"
  | "Fragrance Gifting";

export const bestsellerFilters: Array<"All" | BestsellerCategory> = [
  "All",
  "Corporate Gifting",
  "Office Stationery",
  "Computer Peripherals",
  "Fragrance Gifting",
];

// Bestsellers render through the same canonical ProductCard (and its full
// Product shape) as the /products listing page -- see useShopifyBestsellers
// in shopify-overlay.ts. This static list is a fallback only, used when
// Shopify data hasn't loaded yet.
export const bestsellerProducts: Product[] = [];

