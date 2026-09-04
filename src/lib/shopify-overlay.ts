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
  const amount = parseFloat(node.priceRange?.minVariantPrice?.amount ?? "0");

  return {
    ...product,
    name: node.title?.trim() || product.name,
    ...node.descriptionHtml ? { descriptionHtml: node.descriptionHtml } : {},
    ...(node.vendor ? { vendor: node.vendor } : {}),
    ...(node.tags?.length ? { tags: node.tags } : {}),
    ...(Number.isFinite(amount) && amount > 0
      ? { priceAmount: amount, currencyCode: node.priceRange.minVariantPrice.currencyCode }
      : {}),
    ...(variants[0]?.sku ? { sku: variants[0].sku } : {}),
    ...(description
      ? {
          description,
          summary: product.summary || truncateWords(description.replace(/\s+/g, " "), 160),
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
      const edges = await fetchProducts(250);
      return buildShopifyIndex(edges.map((e) => e.node));
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
  { category: "Officeneed Exclusive", sub: "Featured Exclusives", match: /featured exclusive/ },
  { category: "Officeneed Exclusive", sub: "New Exclusives", match: /new exclusive/ },
  { category: "Fragrance Gifting", sub: "Perfume Gift Sets", match: /perfume gift set|fragrance gift set|perfume set/ },
  { category: "Fragrance Gifting", sub: "Middle Eastern Perfume", match: /attar|oud|arab|middle east/ },
  { category: "Fragrance Gifting", sub: "European Perfume", match: /perfum|fragranc|eau de|deodor|cologne/ },
  { category: "Computer Peripherals", sub: "Computer Accessories", match: /mouse|keyboard|printer|toner|cartridge|bluetooth|speaker|headphone|earph|headset|jbl|webcam|monitor|laptop|dock/ },
  { category: "Computer Peripherals", sub: "Cables & Adapters", match: /cable|charger|adapter|usb|power bank/ },
  { category: "Computer Peripherals", sub: "Storage Devices", match: /pen ?drive|flash drive|hdd|ssd|hard disk|sd card/ },
  { category: "Printing & Branding", sub: "Custom Printing", match: /printing|branding|banner|business card|visiting card|letterhead|brochure/ },
  { category: "Office Stationery", sub: "Files and Folders", match: /sheet protector/ },
  { category: "Corporate Gifting", sub: "Corporate Gifts", match: /corporate gift|gift set|hamper|gifting/ },
  { category: "Corporate Gifting", sub: "Drinkware & Utensils", match: /bottle|flask|mug|tumbler|borosil|drinkware|lunch box|casserole/ },
  { category: "Hidden" as any, sub: "Hidden", match: /notebook|notepad|diary|register|journal|wiro book/ },
  { category: "Office Stationery", sub: "Staplers and Punching", match: /stapler|punch|staple|hole punch/ },
  { category: "Office Stationery", sub: "Files and Folders", match: /file|folder|binder|document case|portfolio/ },
  { category: "Office Stationery", sub: "Printing Papers", match: /copier paper|printing paper|printer paper|bond paper|photocopy|a4 paper|a3 paper|rim|excel bond/ },
  { category: "Office Stationery", sub: "Pen", match: /\bpen\b|pencil|marker|highlighter|sketch pen|refill|ball ?point/ },
];

function classify(node: ShopifyProductNode): { category: Product["category"]; sub: string } {
  // First, respect Shopify tags if they exactly match a known subcategory
  if (node.tags && node.tags.length > 0) {
    for (const rule of RULES) {
      if (node.tags.some(tag => tag.toLowerCase() === rule.sub.toLowerCase())) {
        return { category: rule.category, sub: rule.sub };
      }
    }
  }

  const haystack = normalize(
    [node.title, node.productType, node.vendor, node.description?.slice(0, 120), ...(node.tags || [])]
      .filter(Boolean)
      .join(" "),
  );
  for (const rule of RULES) {
    if (rule.match.test(haystack)) return { category: rule.category, sub: rule.sub };
  }
  return { category: "Office Stationery", sub: "Pen" };
}

/** Trim to a length without cutting mid-word. */

function extractStructuredData(html: string) {
  if (!html) return { descriptionHtml: html };

  const sections: { title: string; contentHtml: string }[] = [];
  
  // Safe regex to find headers like <h3>Features</h3>, <b>Product Details:</b>, <strong>Specifications</strong>, or simply <p>WHAT'S INCLUDED</p>
  // We use a robust pattern that matches common block-level or bold headers.
  const headerRegex = /<(h[2-6]|b|strong|p)[^>]*>(?:\s*<[^>]+>)*\s*(Product Features|Key Features|Features|Specifications|Fragrance Notes|Product Details|Material|Dimensions|Compatibility|What\'s Included(?: in the Box)?|Customization|Care Information|Technical Specifications)[\s:;<]*(?:<\/[^>]+>\s*)*<\/\1>/gi;
  
  let lastIndex = 0;
  let match;
  let currentSection = { title: "DESCRIPTION", contentHtml: "" };
  
  while ((match = headerRegex.exec(html)) !== null) {
    if (match.index > lastIndex) {
      currentSection.contentHtml += html.substring(lastIndex, match.index);
    }
    
    if (currentSection.contentHtml.trim()) {
      sections.push({ ...currentSection });
    }
    
    currentSection = { title: (match[2] || "").toUpperCase().trim(), contentHtml: "" };
    lastIndex = headerRegex.lastIndex;
  }
  
  currentSection.contentHtml += html.substring(lastIndex);
  if (currentSection.contentHtml.trim()) {
    sections.push(currentSection);
  }
  
  // If no sections were found (other than the main description), return it as is.
  if (sections.length <= 1) {
    return { descriptionHtml: html };
  }
  
  // Otherwise, map them to our structured fields.
  const result: any = {};
  
  for (const sec of sections) {
    const title = sec.title;
    const content = sec.contentHtml.trim();
    if (!content) continue;
    
    if (title === "DESCRIPTION") {
      result.descriptionHtml = content;
    } else if (title.includes("FEATURE")) {
      result.customSections = result.customSections || [];
      result.customSections.push({ title: "KEY FEATURES", contentHtml: content });
    } else if (title.includes("SPECIFICATION") || title.includes("DETAIL")) {
      result.customSections = result.customSections || [];
      result.customSections.push({ title: "PRODUCT DETAILS", contentHtml: content });
    } else if (title.includes("FRAGRANCE NOTE")) {
      result.customSections = result.customSections || [];
      result.customSections.push({ title: "FRAGRANCE NOTES", contentHtml: content });
    } else if (title.includes("INCLUDED")) {
      result.customSections = result.customSections || [];
      result.customSections.push({ title: "WHAT'S INCLUDED", contentHtml: content });
    } else {
      result.customSections = result.customSections || [];
      result.customSections.push({ title, contentHtml: content });
    }
  }
  
  return result;
}

function truncateWords(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 40 ? cut.slice(0, lastSpace) : cut).replace(/[.,;:\-\s]+$/, "")}…`;
}

function priceBucket(amount: number): string {
  if (amount < 2000) return "under_2000";
  if (amount <= 5000) return "2000_5000";
  return "above_5000";
}

const PLACEHOLDER_IMAGE =
  "https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=1200&q=75";

/** Convert a live Shopify product into the site's static `Product` shape. */

function parseFragranceProfile(node: ShopifyProductNode) {
  if (!node.metafields) return undefined;
  
  const profile: any = {};
  let hasData = false;

  for (const m of node.metafields) {
    if (!m || !m.key) continue;
    try {
      if (m.type === "list.single_line_text_field" || m.type === "json") {
        profile[m.key] = JSON.parse(m.value);
      } else if (m.type === "boolean") {
        profile[m.key] = m.value === "true";
      } else {
        profile[m.key] = m.value;
      }
      hasData = true;
        if (m.key === "ai_subtitle") {
          profile.ai_subtitle = m.value;
        }
    } catch (e) {
      console.warn("Failed to parse metafield", m.key, m.value);
    }
  }
  
  return hasData ? profile : undefined;
}

export function shopifyNodeToProduct(node: ShopifyProductNode): Product {
  const { category, sub } = classify(node);
  const images = nodeImages(node);
  
  const description = (node.description ?? "").trim();
  const summary = description
    ? truncateWords(description.replace(/\s+/g, " "), 150)
    : `${node.title}  available through OfficeNeed.`;
  
  const extracted = extractStructuredData(node.descriptionHtml || "");

  const amount = parseFloat(node.priceRange?.minVariantPrice?.amount ?? "0");
  const variants = node.variants?.edges?.map((e) => e.node) ?? [];

  return {
    collectionHandles: node.collections?.edges.map(e => e.node.handle) ?? [],
    slug: node.handle,
    name: node.title,
    ...extracted,
    ...(node.tags?.length ? { tags: node.tags } : {}),
    ...(node.vendor ? { vendor: node.vendor } : {}),
    ...(amount > 0
      ? { priceAmount: amount, currencyCode: node.priceRange.minVariantPrice.currencyCode }
      : {}),
    ...(variants[0]?.sku ? { sku: variants[0].sku } : {}),
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
      const edges = await fetchProducts(250);
      return edges.map((e) => e.node);
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
      const edges = await fetchProducts(50);
      return edges.map((e) => e.node);
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const nodes = data ?? [];
  if (nodes.length === 0) return staticItems;

  const live = nodes.map((node): BestsellerProduct => {
    const p = shopifyNodeToProduct(node);
    const category: BestsellerProduct["category"] =
      p.category === "Office Stationery"
        ? "Office Stationery"
        : p.category === "Computer Peripherals"
          ? "Computer Peripherals"
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

  // Keep the static/demo bestsellers that have no live Shopify equivalent.
  const index = buildShopifyIndex(nodes);
  const liveHandles = new Set(live.map((item) => item.shopifyHandle));
  const fallback = staticItems.filter(
    (item) =>
      !liveHandles.has(item.shopifyHandle) &&
      !findShopifyMatch(index, item.shopifyHandle, item.name),
  );

  return [...live, ...fallback];
}

