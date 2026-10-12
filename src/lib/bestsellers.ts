import type { Product } from "./products";
import { productBelongsToCategory, type MainCategory } from "./taxonomy";

export type BestsellerCategory =
  | "Corporate Gifting"
  | "Office Stationery"
  | "Computer Peripherals"
  | "Fragrance Gifting";

export type BestsellerFilter = "All" | BestsellerCategory;

export const bestsellerFilters: BestsellerFilter[] = [
  "All",
  "Corporate Gifting",
  "Office Stationery",
  "Computer Peripherals",
  "Fragrance Gifting",
];

const TAB_CATEGORIES: BestsellerCategory[] = [
  "Corporate Gifting",
  "Office Stationery",
  "Computer Peripherals",
  "Fragrance Gifting",
];

/** Fragrance gifting must never include candles or incense sticks. */
const NON_FRAGRANCE = /\bcandles?\b|\bincense\b|agarbatti|dhoop/i;

// Bestsellers render through the same canonical ProductCard (and its full
// Product shape) as the /products listing page -- see useShopifyBestsellers
// in shopify-overlay.ts. This static list is a fallback only.
export const bestsellerProducts: Product[] = [];

/**
 * Whether a product belongs to a Bestsellers tab, decided ONLY by its real
 * Shopify collection membership (main collection or any subcategory
 * collection, via taxonomy.ts). Title keywords are never used, and products
 * with no recognised collection are excluded rather than guessed.
 */
export function inBestsellerCategory(product: Product, category: BestsellerCategory): boolean {
  if (!productBelongsToCategory(product.collectionHandles, category as MainCategory)) return false;
  if (category === "Fragrance Gifting" && NON_FRAGRANCE.test(product.name)) return false;
  return true;
}

/**
 * Picks the products shown for a tab, preserving the incoming (ranking)
 * order. "All" round-robins across the four main categories so no single
 * category dominates; when a category runs out, the others fill the space.
 * No product appears twice.
 */
export function selectBestsellers(products: Product[], filter: BestsellerFilter, limit = 12): Product[] {
  if (filter !== "All") return products.filter((p) => inBestsellerCategory(p, filter)).slice(0, limit);

  const seen = new Set<string>();
  const queues = TAB_CATEGORIES.map((c) => products.filter((p) => inBestsellerCategory(p, c)));
  const out: Product[] = [];
  let progressed = true;
  while (out.length < limit && progressed) {
    progressed = false;
    for (const q of queues) {
      while (q.length) {
        const p = q.shift()!;
        if (seen.has(p.slug)) continue;
        seen.add(p.slug);
        out.push(p);
        progressed = true;
        break;
      }
      if (out.length >= limit) break;
    }
  }
  return out;
}
