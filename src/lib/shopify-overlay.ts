/**
 * Shopify overlay layer.
 *
 * The static catalogue in `products.ts` / `bestsellers.ts` stays the source of
 * structure (categories, subcategories, filters, copy). When a matching product
 * exists in the connected Shopify store, its live details (title, price,
 * images, description, availability) override the static values. Anything not
 * present in Shopify falls back to the existing static data.
 */
import { useQuery } from "@tanstack/react-query";
import { fetchProducts, formatMoney, type ShopifyProductNode } from "@/lib/shopify";
import type { Product } from "@/lib/products";
import type { BestsellerProduct } from "@/lib/bestsellers";

export type ShopifyIndex = Map<string, ShopifyProductNode>;

const normalize = (value: string) =>
  value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export function buildShopifyIndex(nodes: ShopifyProductNode[]): ShopifyIndex {
  const index: ShopifyIndex = new Map();
  for (const node of nodes) {
    const keys = [normalize(node.handle), normalize(node.title)];
    for (const key of keys) {
      if (key && !index.has(key)) index.set(key, node);
    }
  }
  return index;
}

export function findShopifyMatch(
  index: ShopifyIndex | undefined,
  ...candidates: Array<string | undefined>
): ShopifyProductNode | undefined {
  if (!index || index.size === 0) return undefined;
  for (const candidate of candidates) {
    if (!candidate) continue;
    const hit = index.get(normalize(candidate));
    if (hit) return hit;
  }
  return undefined;
}

function nodeImages(node: ShopifyProductNode): string[] {
  return node.images?.edges?.map((e) => e.node.url).filter(Boolean) ?? [];
}

function nodePrice(node: ShopifyProductNode): string | undefined {
  const money = node.priceRange?.minVariantPrice;
  if (!money?.amount) return undefined;
  const value = parseFloat(money.amount);
  if (!Number.isFinite(value) || value <= 0) return undefined;
  return formatMoney(money.amount, money.currencyCode);
}

/** Merge live Shopify data onto a static product; static values fill the gaps. */
export function mergeProduct(product: Product, node?: ShopifyProductNode): Product {
  if (!node) return product;

  const images = nodeImages(node);
  const price = nodePrice(node);
  const description = node.description?.trim();
  const variants = node.variants?.edges?.map((e) => e.node) ?? [];
  const available = variants.some((v) => v.availableForSale);

  return {
    ...product,
    name: node.title?.trim() || product.name,
    ...(description
      ? {
          description,
          summary: product.summary || description.split("\n")[0]!.slice(0, 160),
        }
      : {}),
    ...(price ? { price, startingPrice: variants.length > 1 } : {}),
    ...(images.length ? { images } : {}),
    ...(variants.length
      ? {
          availability: available ? "In stock" : "Made to order",
          variants:
            variants.length > 1 ? variants.map((v) => v.title) : product.variants ?? [],
        }
      : {}),
  };
}

/** Merge live Shopify data onto a static bestseller card. */
export function mergeBestseller(
  item: BestsellerProduct,
  node?: ShopifyProductNode,
): BestsellerProduct {
  if (!node) return item;
  const images = nodeImages(node);
  const price = nodePrice(node);
  return {
    ...item,
    name: node.title?.trim() || item.name,
    ...(images[0] ? { image: images[0] } : {}),
    ...(price ? { price } : {}),
    shopifyHandle: node.handle,
  };
}

/**
 * Loads the full Shopify catalogue once and exposes it as a lookup index.
 * Failures are swallowed — the static catalogue keeps rendering.
 */
export function useShopifyIndex() {
  const { data } = useQuery({
    queryKey: ["shopify", "catalog-index"],
    queryFn: async () => {
      try {
        const edges = await fetchProducts(250);
        return buildShopifyIndex(edges.map((e) => e.node));
      } catch {
        return new Map() as ShopifyIndex;
      }
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
  return data;
}
