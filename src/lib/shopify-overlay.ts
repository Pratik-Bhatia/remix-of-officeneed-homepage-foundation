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

/* ------------------------------------------------------------------ */
/* Mapping live Shopify products into the site's Product shape         */
/* ------------------------------------------------------------------ */

type Rule = { category: Product["category"]; sub: string; match: RegExp };

const RULES: Rule[] = [
  { category: "Fragrance & Luxury Gifting", sub: "Perfumes", match: /perfum|fragranc|attar|oud|eau de|deodor|cologne/ },
  { category: "Hardware & IT", sub: "Mouse", match: /\bmouse\b/ },
  { category: "Hardware & IT", sub: "Keyboards", match: /keyboard/ },
  { category: "Hardware & IT", sub: "Printers", match: /printer|toner|cartridge/ },
  { category: "Hardware & IT", sub: "Computer Accessories", match: /bluetooth|speaker|headphone|earph|headset|usb|pen ?drive|flash drive|hdd|ssd|hard disk|sd card|jbl|cable|charger|adapter|dock|webcam|monitor|router|laptop|power bank/ },
  { category: "Printing & Branding", sub: "Custom Printing", match: /printing|branding|banner|business card|visiting card|letterhead|brochure/ },
  { category: "Corporate Gifting", sub: "Corporate Gifts", match: /corporate gift|gift set|hamper|gifting/ },
  { category: "Corporate Gifting", sub: "Drinkware & Utensils", match: /bottle|flask|mug|tumbler|borosil|drinkware|lunch box|casserole/ },
  { category: "Office Supplies", sub: "Writing Instruments", match: /\bpen\b|pencil|marker|highlighter|sketch pen|refill|ball ?point/ },
  { category: "Office Supplies", sub: "Notebooks", match: /notebook|diary|register|notepad|journal/ },
  { category: "Office Supplies", sub: "Desk Accessories", match: /stapler|punch|scissor|calculator|organiser|organizer|clip|pin|tape|glue|desk/ },
];

function classify(node: ShopifyProductNode): { category: Product["category"]; sub: string } {
  const haystack = normalize(
    [node.title, node.productType, node.vendor, node.description?.slice(0, 120)]
      .filter(Boolean)
      .join(" "),
  );
  for (const rule of RULES) {
    if (rule.match.test(haystack)) return { category: rule.category, sub: rule.sub };
  }
  return { category: "Office Supplies", sub: "Office Supplies" };
}

function priceBucket(amount: number): string {
  if (amount < 2000) return "under_2000";
  if (amount <= 5000) return "2000_5000";
  return "above_5000";
}

const PLACEHOLDER_IMAGE =
  "https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=1200&q=75";

/** Convert a live Shopify product into the site's static `Product` shape. */
export function shopifyNodeToProduct(node: ShopifyProductNode): Product {
  const { category, sub } = classify(node);
  const images = nodeImages(node);
  const description = (node.description ?? "").trim();
  const summary = description
    ? description.replace(/\s+/g, " ").slice(0, 150)
    : `${node.title} — available through OfficeNeed.`;
  const amount = parseFloat(node.priceRange?.minVariantPrice?.amount ?? "0");
  const variants = node.variants?.edges?.map((e) => e.node) ?? [];

  return {
    slug: node.handle,
    name: node.title,
    category,
    subcategories: [sub],
    filterAttributes: { price: [priceBucket(amount)] },
    summary,
    description: description || summary,
    ...(amount > 0
      ? { price: formatMoney(node.priceRange.minVariantPrice.amount, node.priceRange.minVariantPrice.currencyCode) }
      : {}),
    startingPrice: variants.length > 1,
    availability: variants.some((v) => v.availableForSale) ? "In stock" : "Made to order",
    images: images.length ? images : [PLACEHOLDER_IMAGE],
    addedOn: "2024-01-01",
    ...(node.vendor ? { specifications: [{ label: "Brand", value: node.vendor }] } : {}),
    ...(variants.length > 1 ? { variants: variants.map((v) => v.title) } : {}),
  };
}

/**
 * Full catalogue: live Shopify products first, with any static product that has
 * no Shopify equivalent kept as a fallback. If Shopify is unavailable, the
 * static catalogue is returned untouched.
 */
export function useShopifyCatalogue(staticProducts: Product[]) {
  const { data } = useQuery({
    queryKey: ["shopify", "catalog"],
    queryFn: async () => {
      try {
        const edges = await fetchProducts(250);
        return edges.map((e) => e.node);
      } catch {
        return [] as ShopifyProductNode[];
      }
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const nodes = data ?? [];
  if (nodes.length === 0) return staticProducts;

  const index = buildShopifyIndex(nodes);
  const live = nodes.map(shopifyNodeToProduct);
  const liveSlugs = new Set(live.map((p) => p.slug));
  const fallback = staticProducts.filter(
    (p) => !liveSlugs.has(p.slug) && !findShopifyMatch(index, p.slug, p.name),
  );
  return [...live, ...fallback];
}

/** Live bestsellers from Shopify (tagged "Best Selling"), static as fallback. */
export function useShopifyBestsellers(staticItems: BestsellerProduct[]) {
  const { data } = useQuery({
    queryKey: ["shopify", "bestsellers"],
    queryFn: async () => {
      try {
        const tagged = await fetchProducts(24, 'tag:"Best Selling"');
        const edges = tagged.length ? tagged : await fetchProducts(12);
        return edges.map((e) => e.node);
      } catch {
        return [] as ShopifyProductNode[];
      }
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const nodes = data ?? [];
  if (nodes.length === 0) return staticItems;

  return nodes.map((node): BestsellerProduct => {
    const p = shopifyNodeToProduct(node);
    const category: BestsellerProduct["category"] =
      p.category === "Office Supplies"
        ? "Office Stationery"
        : p.category === "Hardware & IT"
          ? "Hardware Supplies"
          : p.category === "Printing & Branding"
            ? "Corporate Gifting"
            : p.category;
    return {
      id: node.id,
      name: p.name,
      category,
      collection: node.vendor || p.subcategories[0] || category,
      image: p.images[0]!,
      price: p.price ?? "Price on enquiry",
      bestseller: true,
      shopifyHandle: node.handle,
      productUrl: `/products/${node.handle}`,
    };
  });
}
