/**
 * Shopify overlay layer.
 *
 * The static catalogue in `products.ts` / `bestsellers.ts` stays the source of
 * structure (categories, subcategories, filters, copy). When a matching product
 * exists in the connected Shopify store, its live details (title, price,
 * images, description, availability) override the static values. Anything not
 * present in Shopify falls back to the existing static data.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchProducts, fetchAllProducts, fetchCollections, formatMoney, type ShopifyProductNode, type ShopifyCollectionNode, type BuyerContext } from "@/lib/shopify";
import { useBuyerContext } from "@/hooks/useBuyerContext";
import { useB2BStore, getEffectiveCompanyLocationId } from "@/stores/b2bStore";
import { queryLoadStatus, type LoadStatus } from "@/lib/load-status";
import { getB2BPriceOverlay, type B2BPriceOverlayMap } from "@/lib/b2b-pricing.functions";
import { getB2BQuantityRuleOverlay, type QuantityRuleOverlayMap } from "@/lib/b2b-quantity-rules.functions";
import { applyB2BPriceOverlayToAll } from "@/lib/b2b-pricing";
import type { Product } from "@/lib/products";
import { MAIN_CATEGORIES, productBelongsToCategory, resolveSubcategoryFromHandles, type MainCategory } from "@/lib/taxonomy";
import { deriveFilterAttributes } from "@/lib/filters";
import { buildProductSpecifications, hasStructuredSchema } from "@/lib/product-details-schema";
import { getDevFallbackMetafieldValue } from "@/lib/product-details-dev-fallback";
import { minVariantCompareAt } from "@/lib/discount";
import { deriveKeyFeatures } from "@/lib/key-features";
import { resolveFragranceInformation } from "@/lib/fragrance-information";

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
  const variantSkuList = Array.from(new Set(variants.map((v) => v.sku).filter((s): s is string => !!s)));

  return {
    ...product,
    name: node.title?.trim() || product.name,
    ...node.descriptionHtml ? { descriptionHtml: node.descriptionHtml } : {},
    ...(node.vendor ? { vendor: node.vendor } : {}),
    ...(node.tags?.length ? { tags: node.tags } : {}),
    ...(node.productType ? { productType: node.productType } : {}),
    ...(Number.isFinite(amount) && amount > 0
      ? { priceAmount: amount, currencyCode: node.priceRange.minVariantPrice.currencyCode }
      : {}),
    compareAtAmount: minVariantCompareAt(variants),
    ...(variants[0]?.sku ? { sku: variants[0].sku } : {}),
    ...(variantSkuList.length ? { variantSkus: variantSkuList } : {}),
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

/* ------------------------------------------------------------------ */
/* Mapping live Shopify products into the site's Product shape         */
/* ------------------------------------------------------------------ */

type Rule = { category: Product["category"]; sub: string; match: RegExp };

const RULES: Rule[] = [
  { category: "Officeneed Exclusive", sub: "Featured Exclusives", match: /featured exclusive/ },
  { category: "Officeneed Exclusive", sub: "New Exclusives", match: /new exclusive/ },
  { category: "Fragrance Gifting", sub: "Perfume Gift Set", match: /perfume gift set|fragrance gift set|perfume set/ },
  // Must come after the more specific "Perfume Gift Set" rule above (so a
  // perfume gift set still correctly lands under Fragrance Gifting, not
  // here) but before EVERY single-item keyword rule below (bottle, pen,
  // pendrive, diary, cable, etc.): a multi-item gift-set product's title
  // routinely also contains one of those words (e.g. "...Gift Set with
  // 16GB Pendrive" contains "Pendrive", which would otherwise match
  // Computer Peripherals -> Storage Devices below and win first, since
  // classify() returns on the FIRST matching rule). This rule's `sub`
  // ("Gift Sets") also makes classify()'s own tag-priority check above
  // (which only matches a tag against a KNOWN rule.sub) actually reachable
  // for the "gift sets" tag real gift-set products carry in Shopify --
  // previously nothing in RULES declared that sub, so the tag check could
  // never match it and every gift set fell through to here anyway. Scoped
  // to "gift set(s)"/"hamper"/"bundle" specifically (not just "gift") so a
  // single item that's merely gift-*wrapped* or gift-*themed* isn't swept
  // in -- mirrors the same pattern ProductCustomizer.tsx's isGiftSet uses.
  { category: "Corporate Gifting", sub: "Gift Sets", match: /gift\s*sets?|hamper|bundle/ },
  { category: "Fragrance Gifting", sub: "Middle Eastern Perfume", match: /attar|oud|arab|middle east/ },
  { category: "Fragrance Gifting", sub: "European Perfume", match: /perfum|fragranc|eau de|deodor|cologne/ },
  { category: "Computer Peripherals", sub: "Computer Accessories", match: /mouse|keyboard|printer|toner|cartridge|bluetooth|speaker|headphone|earph|headset|jbl|webcam|monitor|laptop|dock/ },
  { category: "Computer Peripherals", sub: "Cables & Adapters", match: /cable|charger|adapter|usb|power bank/ },
  { category: "Computer Peripherals", sub: "Storage Devices", match: /pen ?drive|flash drive|hdd|ssd|hard disk|sd card/ },
  { category: "Printing & Branding", sub: "Custom Printing", match: /printing|branding|banner|business card|visiting card|letterhead|brochure/ },
  { category: "Office Stationery", sub: "Files and Folders", match: /sheet protector/ },
  { category: "Corporate Gifting", sub: "Drinkware & Utensils", match: /bottle|flask|mug|tumbler|borosil|drinkware|lunch box|casserole/ },
  { category: "Corporate Gifting", sub: "Bags", match: /\bbag\b|backpack|duffel|tote|laptop bag/ },
  { category: "Corporate Gifting", sub: "Diaries", match: /diary|journal|notebook|planner|register|wiro book/ },
  { category: "Corporate Gifting", sub: "Luxury Pens", match: /luxury pen|premium pen|parker|waterman|cross pen|fountain pen/ },
  { category: "Office Stationery", sub: "Staplers and Punching", match: /stapler|punch|staple|hole punch/ },
  { category: "Office Stationery", sub: "Files and Folders", match: /file|folder|binder|document case|portfolio/ },
  { category: "Office Stationery", sub: "Printing Papers", match: /copier paper|printing paper|printer paper|bond paper|photocopy|a4 paper|a3 paper|rim|excel bond/ },
  { category: "Office Stationery", sub: "Pen", match: /\bpen\b|pencil|marker|highlighter|sketch pen|refill|ball ?point/ },
];

/**
 * LAST-RESORT fallback classifier, used only for a product whose real
 * Shopify collection membership doesn't resolve to any known MainCategory
 * at all (see `resolveMainCategory`/`shopifyNodeToProduct` below) -- e.g. a
 * product not yet added to any recognized collection in Shopify. Keyword
 * matching against title/tags/description is inherently unreliable and
 * known to cross-contaminate categories (an "Ink Bottle" title matching the
 * "bottle" keyword rule below, an "Adhesive" product with no matching
 * keyword silently hitting the default Corporate Gifting/Gift Sets return
 * at the bottom) -- it must never be allowed to override an explicit,
 * real Shopify classification. Do NOT use this for eligibility/display;
 * that's what `resolveMainCategory` + `resolveSubcategoryFromHandles` are for.
 */
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
  return { category: "Corporate Gifting", sub: "Gift Sets" };
}

/** Trim to a length without cutting mid-word. */

/**
 * @param suppressProductDetails When true, a "Specifications"/"Product
 *   Details" header found in the description is dropped instead of becoming
 *   a customSection -- used for categories that now have a real, structured
 *   Product Details schema (see product-details-schema.ts), so the PDP never
 *   shows two competing "PRODUCT DETAILS" accordions for the same product.
 */
/**
 * True only if `html` would actually show something to a shopper -- real
 * text once every tag is stripped, or a genuinely visual element (image/
 * video/svg) with no text. Confirmed live against this store's catalogue:
 * extractStructuredData's header regex below (it recognizes "Material",
 * "Dimensions", etc. as section headers so real <h3>Material</h3>-style
 * descriptions split correctly) can ALSO match an inline bolded label like
 * "<b>Material:</b>" sitting inside a "Technical Specifications:" bullet
 * list -- splitting that list right before its own content and leaving the
 * section ending there (here, "Product Details") with nothing but leftover
 * opening tags such as "<ul><li><p>". A plain `content.trim()` check never
 * catches this, since that string is non-empty -- it just has no VISIBLE
 * content once the tags are stripped. 25 of 337 live products hit this
 * exact pattern. The content isn't lost (the next recognized header, e.g.
 * "Material", still captures and displays it) -- only the now-empty
 * section is suppressed, exactly per the fix's own requirement to never
 * render an accordion with genuinely missing/empty content. */
function hasVisibleContent(html: string): boolean {
  if (/<(img|svg|video)[\s/>]/i.test(html)) return true;
  return html.replace(/<[^>]*>/g, " ").replace(/&nbsp;/gi, " ").replace(/\s+/g, " ").trim().length > 0;
}

function extractStructuredData(html: string, suppressProductDetails = false) {
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
    if (!content || !hasVisibleContent(content)) continue;

    if (title === "DESCRIPTION") {
      result.descriptionHtml = content;
    } else if (title.includes("FEATURE")) {
      result.customSections = result.customSections || [];
      result.customSections.push({ title: "KEY FEATURES", contentHtml: content });
      // Stashed raw so shopifyNodeToProduct() can de-duplicate against the
      // product's resolved Product Details once those are known (this
      // function runs before that) -- see deriveKeyFeatures() usage below.
      result.rawKeyFeaturesHtml = content;
    } else if (title.includes("SPECIFICATION") || title.includes("DETAIL")) {
      if (!suppressProductDetails) {
        result.customSections = result.customSections || [];
        result.customSections.push({ title: "PRODUCT DETAILS", contentHtml: content });
      }
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

/**
 * Real Shopify collection membership as the source of truth for which
 * MainCategory a product belongs to (same approach already used for
 * OfficeGPT eligibility) -- deliberately not `classify()`, which is
 * keyword-based and known to cross-contaminate categories.
 */
function resolveMainCategory(collectionHandles: string[]): MainCategory | undefined {
  return MAIN_CATEGORIES.find((cat) => productBelongsToCategory(collectionHandles, cat));
}

const PLACEHOLDER_IMAGE =
  "https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=1200&q=75";

/** Convert a live Shopify product into the site's static `Product` shape. */

/**
 * Reads a metafield by (namespace, key) from the live Shopify data queried
 * for this node, falling back to the temporary Phase 1 dev fallback (see
 * product-details-dev-fallback.ts) only when Shopify has no value yet.
 */
function metafieldLookup(node: ShopifyProductNode): (namespace: string, key: string) => string | undefined {
  const values = new Map<string, string>();
  for (const mf of node.metafields ?? []) {
    if (mf?.value) values.set(`${mf.namespace}.${mf.key}`, mf.value);
  }
  return (namespace, key) =>
    values.get(`${namespace}.${key}`) ?? getDevFallbackMetafieldValue(node.handle, namespace, key);
}

/**
 * Resolves `custom.gift_set_components` (a list.metaobject_reference field)
 * into the site's own Product["giftSetComponents"] shape. Each referenced
 * `gift_set_component` metaobject carries its own `name` (text), `image`
 * (file reference, resolved via the `reference` field on MediaImage), and
 * `customizable` (boolean, as the literal string "true"/"false") fields --
 * see the GraphQL shape in shopify.ts's PRODUCT_BY_HANDLE_QUERY. A
 * malformed/incomplete entry (missing name or image, e.g. mid-edit in
 * Shopify Admin) is skipped rather than surfaced as a broken component; a
 * genuinely empty or absent metafield returns undefined, not [], so
 * `(giftSetComponents?.length ?? 0) >= 2` stays a clean single check for
 * "does this product have real multi-component data".
 */
function parseGiftSetComponents(node: ShopifyProductNode): Product["giftSetComponents"] {
  const edges = node.giftSetComponents?.references?.edges;
  if (!edges?.length) return undefined;

  const components = edges
    .map(({ node: metaobject }) => {
      const fields = new Map(metaobject.fields.map((f) => [f.key, f]));
      const name = fields.get("name")?.value?.trim();
      const imageUrl = fields.get("image")?.reference?.image?.url;
      if (!name || !imageUrl) return null;

      // variant_images (list.file_reference) resolves via `references`
      // (plural -- a single `image` field resolves via `reference`,
      // singular, above); variant_titles (list.single_line_text_field) is a
      // JSON-encoded string array in `.value`, Shopify's own wire format
      // for list-of-scalar metafields. Paired strictly by array position --
      // the Nth title names the Nth image -- so a length mismatch (an
      // editing mistake in Shopify Admin) is treated as "no reliable
      // variant data" and skipped entirely rather than guessing a pairing,
      // same spirit as skipping a component missing name/image above.
      let variantImages: Array<{ title: string; imageUrl: string }> | undefined;
      const variantImageUrls = fields.get("variant_images")?.references?.edges
        ?.map((e) => e.node.image?.url)
        .filter((u): u is string => Boolean(u));
      const variantTitlesRaw = fields.get("variant_titles")?.value;
      if (variantImageUrls?.length && variantTitlesRaw) {
        try {
          const titles: unknown = JSON.parse(variantTitlesRaw);
          if (
            Array.isArray(titles) &&
            titles.length === variantImageUrls.length &&
            titles.every((t) => typeof t === "string" && t.trim())
          ) {
            variantImages = titles.map((title, i) => ({
              title: (title as string).trim(),
              imageUrl: variantImageUrls[i]!,
            }));
          } else {
            console.warn(
              `[Officeneed] gift-set component "${name}": variant_images/variant_titles length mismatch -- ignoring variant images for this component.`,
            );
          }
        } catch {
          console.warn(`[OfficeNeed] gift-set component "${name}": variant_titles is not valid JSON -- ignoring.`);
        }
      }

      return {
        id: metaobject.id,
        name,
        imageUrl,
        customizable: fields.get("customizable")?.value === "true",
        ...(variantImages ? { variantImages } : {}),
      };
    })
    .filter((c): c is NonNullable<typeof c> => c !== null);

  return components.length ? components : undefined;
}

export function shopifyNodeToProduct(node: ShopifyProductNode): Product {
  const images = nodeImages(node);
  const collectionHandles = node.collections?.edges.map(e => e.node.handle) ?? [];
  const mainCategory = resolveMainCategory(collectionHandles);

  // Shopify collection membership is the SOURCE OF TRUTH (same as the
  // products listing page already uses -- see products.index.tsx's
  // categoryScoped). A valid, explicit Shopify classification must never be
  // overwritten by the keyword-based `classify()` fallback, which only runs
  // when this product isn't in any collection this site recognizes as
  // belonging to a MainCategory at all.
  const fallback = mainCategory ? null : classify(node);
  const category: Product["category"] = mainCategory ?? fallback!.category;
  const sub = mainCategory
    ? resolveSubcategoryFromHandles(collectionHandles, mainCategory)
    : fallback!.sub;

  const description = (node.description ?? "").trim();
  const summary = description
    ? truncateWords(description.replace(/\s+/g, " "), 150)
    : `${node.title}  available through Officeneed.`;

  const hasSchema = hasStructuredSchema(mainCategory);
  // Fragrance uses DOM/Markdown extraction rather than the legacy header splitter,
  // which missed Markdown and placed notes in optional raw custom sections.
  const extracted = category === "Fragrance Gifting"
    ? resolveFragranceInformation({ description, descriptionHtml: node.descriptionHtml }, metafieldLookup(node))
    : extractStructuredData(node.descriptionHtml || "", hasSchema);
  const specifications = buildProductSpecifications(mainCategory, metafieldLookup(node));

  // Once Product Details is a real, structured schema for this category,
  // Key Features must stop repeating those same specifications under a
  // different label -- de-duplicate the raw "Key Features" bullets against
  // the resolved specifications, keeping only genuine benefit content, and
  // drop the old raw customSection so it isn't rendered twice.
  const { rawKeyFeaturesHtml, ...extractedRest } = extracted;
  let features: string[] | undefined;
  let customSections = extractedRest.customSections;
  if (hasSchema && rawKeyFeaturesHtml) {
    features = deriveKeyFeatures(rawKeyFeaturesHtml, specifications);
    customSections = customSections?.filter((s: { title: string }) => s.title !== "KEY FEATURES");
    if (customSections && customSections.length === 0) customSections = undefined;
  }

  const amount = parseFloat(node.priceRange?.minVariantPrice?.amount ?? "0");
  const variants = node.variants?.edges?.map((e) => e.node) ?? [];
  const variantSkuList = Array.from(new Set(variants.map((v) => v.sku).filter((s): s is string => !!s)));

  return {
    collectionHandles,
    slug: node.handle,
    name: node.title,
    ...extractedRest,
    // Explicitly overrides extractedRest's raw customSections (which may
    // still include the un-filtered "KEY FEATURES" entry) -- a conditional
    // spread here would NOT override an already-set key with an empty
    // object, so this must always be assigned, even when undefined.
    customSections,
    ...(features?.length ? { features } : {}),
    ...(node.tags?.length ? { tags: node.tags } : {}),
    ...(node.vendor ? { vendor: node.vendor } : {}),
    ...(node.productType ? { productType: node.productType } : {}),
    ...(() => {
      const giftSetComponents = parseGiftSetComponents(node);
      return giftSetComponents ? { giftSetComponents } : {};
    })(),
    ...(amount > 0
      ? { priceAmount: amount, currencyCode: node.priceRange.minVariantPrice.currencyCode }
      : {}),
    compareAtAmount: minVariantCompareAt(variants),
    ...(variants[0]?.sku ? { sku: variants[0].sku } : {}),
    ...(variantSkuList.length ? { variantSkus: variantSkuList } : {}),
    category,
    subcategories: [sub],
    filterAttributes: deriveFilterAttributes(node, mainCategory),
    ...(specifications.length ? { specifications } : {}),
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
 * Fast, synchronous, non-cryptographic string hash (FNV-1a, 32-bit, hex
 * output). NOT used as a security boundary -- only as a brief transitional
 * stand-in for the real customer GID (see buyerCacheConfig below) so the
 * bearer token itself never has to appear in a React Query cache key even
 * for the short window before resolveB2BSession's response (which carries
 * the real GID) comes back. Good enough for that narrow purpose: low
 * collision odds for the handful of concurrently-signed-in sessions this
 * is ever comparing against, non-reversible to recover the input, and
 * synchronous (unlike SubtleCrypto.digest) so it fits this hook's existing
 * synchronous render contract without an extra async render pass.
 */
function fnv1aHex(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/**
 * Shopify's own B2B headless guidance (shopify.dev/docs/storefronts/
 * headless/bring-your-own-stack/b2b): "B2B queries contextualized with
 * customerAccessToken and companyLocationId return personalized pricing
 * and product data. If you cache these responses, other users could see
 * another customer's B2B pricing. Make sure to disable caching on routes
 * that return buyer-specific data." That is explicit: caching must be
 * disabled for buyer-contextualized responses, full stop -- NOT merely
 * scoped/shared by companyLocationId. Two different customers must never
 * share a cache entry just because they resolved to the same company
 * location, regardless of whether today's field selection happens to be
 * identical for both of them. This function is the single place that
 * decides the query key AND the cache lifetime together, so neither can
 * drift out of sync with the other.
 *
 * The cache-key identity is `customerId` (the resolved Shopify customer
 * GID from b2bStore, via resolveB2BSession -- an opaque, non-secret
 * identifier) when known, falling back to a one-way hash of the bearer
 * token (never the raw token itself) only for the brief window right
 * after sign-in before that resolution has completed. The actual
 * `customerAccessToken` is still passed to the Shopify fetch functions
 * separately (via `buyer`) -- it's only kept out of the CACHE KEY, which
 * is what React Query DevTools/debugging surfaces.
 *
 * Anonymous/plain-B2C (buyer === null) queries are UNAFFECTED -- they
 * carry no personalized data, so the existing 5-minute staleTime for
 * catalog/bestsellers stays exactly as it was.
 */
function buyerCacheConfig(
  buyer: BuyerContext,
  customerId: string | null,
): { queryKeySuffix: string; staleTime: number; gcTime: number } {
  if (!buyer) return { queryKeySuffix: "anon", staleTime: 5 * 60 * 1000, gcTime: 5 * 60 * 1000 };
  const identity = customerId ?? `pending-${fnv1aHex(buyer.customerAccessToken)}`;
  // Zero cache lifetime regardless: the query is effectively refetched
  // every time it's used, and nothing persists for another render/mount/
  // customer to ever read back -- the identity above only prevents two
  // DIFFERENT customers' in-flight/observer-shared entries from colliding
  // within that same instant, it isn't relied on for longer-lived sharing.
  return { queryKeySuffix: identity, staleTime: 0, gcTime: 0 };
}

/**
 * B2B catalog price overlay (Admin API contextualPricing, not
 * @inContext(buyer:) -- see src/lib/b2b-pricing.functions.ts). Only ever
 * fires when b2bStore has actually resolved a real company location for
 * the signed-in customer; the companyLocationId/token sent are read from
 * that server-resolved state, never from anything else client-controlled.
 * A separate, short-lived React Query entry from the catalog/bestsellers
 * query itself -- keeps the (now always-anonymous, safely shared) base
 * product fetch cacheable while this overlay stays scoped to exactly the
 * resolved company location, never bleeding into another buyer's cache.
 *
 * `ready` is the price-flash gate: false whenever painting the caller's
 * current price data would risk showing the wrong buyer's price for even
 * one frame --
 *   - b2bStore hasn't finished its own determination yet (`resolved` is
 *     false -- covers SSR, pre-hydration, and the brief client resolve()
 *     window on every hard refresh/sign-in);
 *   - OR the buyer IS B2B but this exact set of variant ids' contextual
 *     price overlay hasn't finished fetching yet (`isFetched` false).
 * B2C/anonymous/needs-location never depend on the overlay, so once
 * `resolved` is true they're immediately ready -- only a true "b2b" status
 * with locations to price waits on the overlay query too.
 */
const EMPTY_PRICE_OVERLAY: B2BPriceOverlayMap = {};

export function useB2BPriceOverlayMap(variantIds: string[]): { overlay: B2BPriceOverlayMap; ready: boolean } {
  const resolved = useB2BStore((s) => s.resolved);
  const status = useB2BStore((s) => s.status);
  // Only the EFFECTIVE location -- eligible (status) AND the shopper is
  // currently in Business shopping mode (see getEffectiveCompanyLocationId
  // in b2bStore.ts). An eligible B2B customer who's switched to Personal
  // Shopping must see this overlay go empty/disabled, same as a genuine
  // B2C shopper -- never a stale company price.
  const companyLocationId = useB2BStore((s) => getEffectiveCompanyLocationId(s));
  const token = useB2BStore((s) => s.resolvedForToken);
  const ids = useMemo(() => [...new Set(variantIds)].sort(), [variantIds]);
  const enabled = !!companyLocationId && !!token && ids.length > 0;
  const { data, isFetched } = useQuery({
    queryKey: ["shopify", "b2b-price-overlay", companyLocationId ?? "none", ids.join(",")],
    queryFn: async (): Promise<B2BPriceOverlayMap> => {
      if (!token || !companyLocationId) return {};
      try {
        return await getB2BPriceOverlay({ data: { customerAccessToken: token, companyLocationId, variantIds: ids } });
      } catch (err) {
        console.error("[B2B pricing] overlay fetch failed, falling back to normal pricing:", err instanceof Error ? err.message : err);
        return {};
      }
    },
    enabled,
    staleTime: 0,
    gcTime: 0,
    retry: 1,
  });
  const ready = !resolved ? false : companyLocationId && ids.length > 0 ? isFetched : true;
  if (import.meta.env.DEV) {
    // Dev-only (tree-shaken in production builds). Status/booleans only.
    console.debug("[useB2BPriceOverlayMap] status:", status, "| resolved:", resolved, "| ready:", ready);
  }
  return { overlay: data ?? EMPTY_PRICE_OVERLAY, ready };
}

/**
 * B2B catalog quantity-rule overlay -- same Admin API contextualPricing
 * mechanism and the exact same gating/caching/safety shape as
 * useB2BPriceOverlayMap above (only ever fires once b2bStore has resolved
 * a real company location; falls back to empty on any failure). See
 * src/lib/b2b-quantity-rules.functions.ts for why this exists: the public
 * Storefront API's ProductVariant.quantityRule does not reflect a B2B
 * company-location-scoped catalog override (confirmed live against this
 * store's real H935 product), while this Admin API field does -- and,
 * confirmed in the same investigation, a plain country-context lookup
 * returns the SAME minimum the Storefront API already reports, so B2C/
 * anonymous shoppers never need this overlay at all (`enabled` stays
 * false for them, exactly like the price overlay). */
export function useB2BQuantityRuleOverlayMap(variantIds: string[]): { overlay: QuantityRuleOverlayMap; ready: boolean } {
  const resolved = useB2BStore((s) => s.resolved);
  // Only the EFFECTIVE location -- see useB2BPriceOverlayMap's comment
  // above for why (an eligible B2B customer who's switched to Personal
  // Shopping must see this overlay go empty, same as a genuine B2C
  // shopper).
  const companyLocationId = useB2BStore((s) => getEffectiveCompanyLocationId(s));
  const token = useB2BStore((s) => s.resolvedForToken);
  const ids = [...new Set(variantIds)].sort();
  const enabled = !!companyLocationId && !!token && ids.length > 0;
  const { data, isFetched } = useQuery({
    queryKey: ["shopify", "b2b-quantity-rule-overlay", companyLocationId ?? "none", ids.join(",")],
    queryFn: async (): Promise<QuantityRuleOverlayMap> => {
      if (!token || !companyLocationId) return {};
      try {
        return await getB2BQuantityRuleOverlay({ data: { customerAccessToken: token, companyLocationId, variantIds: ids } });
      } catch (err) {
        console.error("[B2B quantity rules] overlay fetch failed, falling back to the Storefront-read rule:", err instanceof Error ? err.message : err);
        return {};
      }
    },
    enabled,
    staleTime: 0,
    gcTime: 0,
    retry: 1,
  });
  const ready = !resolved ? false : companyLocationId && ids.length > 0 ? isFetched : true;
  return { overlay: data ?? {}, ready };
}

/**
 * Full catalogue: live Shopify products first, with any static product that has
 * no Shopify equivalent kept as a fallback. If Shopify is unavailable, the
 * static catalogue is returned untouched.
 */
export function shopifyCatalogueQueryOptions(buyer: BuyerContext, customerId: string | null) {
  const { queryKeySuffix, staleTime, gcTime } = buyerCacheConfig(buyer, customerId);
  return {
    queryKey: ["shopify", "catalog", queryKeySuffix] as const,
    queryFn: async () => {
      const edges = await fetchAllProducts(undefined, buyer);
      return edges.map((e) => e.node);
    },
    staleTime,
    gcTime,
    retry: 1,
  };
}

/** `pricesReady` is false only while real Shopify data exists but this
 * buyer's correct price for it is still being determined (see
 * useB2BPriceOverlayMap) -- never while there's no live data at all (the
 * static-catalogue fallback below has no buyer-dependent pricing to wait
 * on, so it's always "ready" exactly as it already rendered before this
 * flag existed). Callers that render a price must skeleton it while false
 * instead of painting whatever's currently in `products`. */
export function useShopifyCatalogue(
  staticProducts: Product[],
  options: { enabled?: boolean } = {},
): { products: Product[]; pricesReady: boolean; status: LoadStatus; retry: () => void } {
  const buyer = useBuyerContext();
  const customerId = useB2BStore((s) => s.customerId);
  // `enabled: false` lets always-mounted surfaces (chat, search) skip downloading the whole
  // catalogue until the shopper actually opens them.
  const enabled = options.enabled ?? true;
  const query = useQuery({ ...shopifyCatalogueQueryOptions(buyer, customerId), enabled });
  const { data } = query;
  // `products` alone can't tell "still loading" from "failed" or "empty"
  // (the static fallback is empty) -- callers render from `status`.
  const status = queryLoadStatus(query, enabled);
  const retry = query.refetch;

  const baseNodes = useMemo(() => data ?? [], [data]);
  const variantIds = useMemo(() => baseNodes.flatMap((n) => n.variants.edges.map((e) => e.node.id)), [baseNodes]);
  const { overlay: priceOverlay, ready } = useB2BPriceOverlayMap(variantIds);

  // Converting ~330 Shopify nodes into Products is expensive; only redo it when the data, the
  // price overlay or the static fallback list really change -- not on every re-render.
  const live = useMemo(() => {
    const nodes = applyB2BPriceOverlayToAll(baseNodes, priceOverlay);
    if (nodes.length === 0) return null;
    const index = buildShopifyIndex(nodes);
    const products = nodes.map(shopifyNodeToProduct);
    const liveSlugs = new Set(products.map((p) => p.slug));
    const fallback = staticProducts.filter(
      (p) => !liveSlugs.has(p.slug) && !findShopifyMatch(index, p.slug, p.name),
    );
    return [...products, ...fallback];
  }, [baseNodes, priceOverlay, staticProducts]);

  return useMemo(
    () => ({
      ...(live ? { products: live, pricesReady: ready } : { products: staticProducts, pricesReady: true }),
      status,
      retry: () => void retry(),
    }),
    [live, ready, staticProducts, status, retry],
  );
}

/**
 * Live bestsellers from Shopify (tagged "Best Selling"), static as fallback.
 *
 * Returns full Product objects -- the same shape shopifyNodeToProduct
 * builds for the /products listing page -- rather than a separate, lossier
 * shape. Bestsellers.tsx renders these with the exact same canonical
 * ProductCard, so behavior (including hover-to-next-image, which needs the
 * full images[] array this used to trim down to just images[0]) stays
 * identical between the two.
 */
export function useShopifyBestsellers(staticItems: Product[] = []): { products: Product[]; pricesReady: boolean; status: LoadStatus; retry: () => void } {
  const buyer = useBuyerContext();
  const customerId = useB2BStore((s) => s.customerId);
  const { queryKeySuffix, staleTime, gcTime } = buyerCacheConfig(buyer, customerId);
  const query = useQuery({
    queryKey: ["shopify", "bestsellers", queryKeySuffix],
    queryFn: async () => {
      // 250 (one Storefront page) so every main category is represented;
      // tab/category selection happens in selectBestsellers().
      const edges = await fetchProducts(250, undefined, buyer);
      return edges.map((e) => e.node);
    },
    staleTime,
    gcTime,
    retry: 1,
  });
  const { data } = query;
  const status = queryLoadStatus(query);
  const retry = query.refetch;

  const baseNodes = useMemo(() => data ?? [], [data]);
  const variantIds = useMemo(() => baseNodes.flatMap((n) => n.variants.edges.map((e) => e.node.id)), [baseNodes]);
  const { overlay: priceOverlay, ready } = useB2BPriceOverlayMap(variantIds);

  const live = useMemo(() => {
    const nodes = applyB2BPriceOverlayToAll(baseNodes, priceOverlay);
    if (nodes.length === 0) return null;
    const products = nodes.map((node) => ({ ...shopifyNodeToProduct(node), badge: "Bestseller" as const }));
    // Keep the static/demo bestsellers that have no live Shopify equivalent.
    const index = buildShopifyIndex(nodes);
    const liveSlugs = new Set(products.map((p) => p.slug));
    const fallback = staticItems.filter(
      (item) => !liveSlugs.has(item.slug) && !findShopifyMatch(index, item.slug, item.name),
    );
    return [...products, ...fallback];
  }, [baseNodes, priceOverlay, staticItems]);

  return useMemo(
    () => ({
      ...(live ? { products: live, pricesReady: ready } : { products: staticItems, pricesReady: true }),
      status,
      retry: () => void retry(),
    }),
    [live, ready, staticItems, status, retry],
  );
}


const EMPTY_COLLECTIONS: ShopifyCollectionNode[] = [];

export function useShopifyCollections() {
  const { data, isLoading } = useQuery({
    queryKey: ["shopify", "collections"],
    queryFn: async () => {
      const edges = await fetchCollections(250);
      return edges.map((e) => e.node);
    },
    // Collections change rarely, but this hook is read by the navbar, footer, every product card,
    // etc.; with staleTime 0 each late-mounting reader re-fetched them (3x on the homepage).
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 1,
  });
  return { collections: data ?? EMPTY_COLLECTIONS, isLoading };
}
