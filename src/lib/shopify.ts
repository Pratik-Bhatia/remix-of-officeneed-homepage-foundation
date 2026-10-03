/**
 * Shopify Storefront API client for the connected OfficeNeed store.
 *
 * Browser code calls storefrontApiRequest() which proxies through the
 * server-side proxyStorefrontRequest server function so the Shopify
 * access token is never embedded in or sent from browser JavaScript.
 */
import { toast } from "sonner";
import { proxyStorefrontRequest } from "@/lib/shopify.functions";
import { REQUIRED_METAFIELD_IDENTIFIERS } from "@/lib/product-details-schema";

// Kept in sync with src/lib/shopify.functions.ts's SHOPIFY_API_VERSION --
// see that file's comment for the live verification behind this value.
export const SHOPIFY_API_VERSION = "2026-10";
export const SHOPIFY_STORE_PERMANENT_DOMAIN = "har1k4-di.myshopify.com";

/** The @inContext(buyer:...) argument -- when present on a query, Shopify
 * returns that buyer's contextual (e.g. B2B catalog) pricing instead of
 * the standard price. `companyLocationId` is resolved server-side only
 * (see src/lib/b2b.functions.ts) -- never accept one from the browser. */
export type BuyerContext = { customerAccessToken: string; companyLocationId?: string } | null | undefined;

export interface ShopifyImage {
  id?: string | null;
  url: string;
  altText: string | null;
}

export interface ShopifyVariantNode {
  id: string;
  title: string;
  sku?: string | null;
  price: { amount: string; currencyCode: string };
  compareAtPrice?: { amount: string; currencyCode: string } | null;
  availableForSale: boolean;
  quantityAvailable?: number | null;
  currentlyNotInStock?: boolean | null;
  image?: ShopifyImage | null;
  selectedOptions: Array<{ name: string; value: string }>;
}

export interface ShopifyProductNode {
  id: string;
  title: string;
  description: string;
  descriptionHtml?: string;
  handle: string;
  productType: string;
  vendor: string;
  tags?: string[];
  availableForSale?: boolean;
  totalInventory?: number | null;
  featuredImage?: ShopifyImage | null;
  priceRange: { minVariantPrice: { amount: string; currencyCode: string } };
  images: { edges: Array<{ node: ShopifyImage }> };
  variants: { edges: Array<{ node: ShopifyVariantNode }> };
  options: Array<{ name: string; values: string[] }>;
  collections?: { edges: Array<{ node: { handle: string } }> };
  metafields?: Array<{ namespace: string; key: string; value: string } | null>;
  /** custom.gift_set_components -- list.metaobject_reference. Only present
   * on the single-product PDP query (PRODUCT_BY_HANDLE_QUERY), same as
   * `metafields` above. Absent/null on a single-item product; each entry
   * resolves the referenced `gift_set_component` metaobject's own fields. */
  giftSetComponents?: {
    references?: {
      edges: Array<{
        node: {
          id: string;
          fields: Array<{
            key: string;
            value: string;
            reference?: { image?: { url: string; altText: string | null } | null } | null;
            /** For a LIST field (e.g. variant_images, a list.file_reference) --
             * `reference` above only resolves a single-reference field. */
            references?: { edges: Array<{ node: { image?: { url: string; altText: string | null } | null } } >} | null;
          }>;
        };
      }>;
    } | null;
  } | null;
}

export interface ShopifyProduct {
  node: ShopifyProductNode;
}

const PRODUCT_FIELDS = `
  id
  title
  description
  descriptionHtml
  handle
  productType
  vendor
  tags
  availableForSale
  featuredImage { id url altText }
  priceRange { minVariantPrice { amount currencyCode } }
  images(first: 30) { edges { node { id url altText } } }
  variants(first: 100) {
    edges {
      node {
        id
        title
        sku
        price { amount currencyCode }
        compareAtPrice { amount currencyCode }
        availableForSale
        currentlyNotInStock
        image { id url altText }
        selectedOptions { name value }
      }
    }
  }
  options { name values }
  collections(first: 50) { edges { node { handle } } }
`;

export const STOREFRONT_QUERY = `
  query GetProducts($first: Int!, $query: String, $after: String) {
    products(first: $first, query: $query, after: $after) {
      edges { cursor node { ${PRODUCT_FIELDS} } }
      pageInfo { hasNextPage }
    }
  }
`;

// Only the single-product PDP query fetches metafields -- the bulk catalogue
// query (STOREFRONT_QUERY, used for the /products grid) deliberately doesn't,
// since Product Details is only ever rendered on the PDP.
const METAFIELD_IDENTIFIERS_GQL = REQUIRED_METAFIELD_IDENTIFIERS
  .map((m) => `{namespace: "${m.namespace}", key: "${m.key}"}`)
  .join(", ");

const PRODUCT_BY_HANDLE_SELECTION = `
  ${PRODUCT_FIELDS}
  metafields(identifiers: [${METAFIELD_IDENTIFIERS_GQL}]) {
    namespace
    key
    value
  }
  giftSetComponents: metafield(namespace: "custom", key: "gift_set_components") {
    references(first: 20) {
      edges {
        node {
          ... on Metaobject {
            id
            fields {
              key
              value
              reference {
                ... on MediaImage { image { url altText } }
              }
              references(first: 20) {
                edges {
                  node {
                    ... on MediaImage { image { url altText } }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
`;

export const PRODUCT_BY_HANDLE_QUERY = `
  query GetProduct($handle: String!) {
    product(handle: $handle) {
      ${PRODUCT_BY_HANDLE_SELECTION}
    }
  }
`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function storefrontApiRequest(query: string, variables: Record<string, unknown> = {}): Promise<any> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let result: { data: Record<string, any> | null; errors: Array<{ message: string }> };
  try {
    result = await proxyStorefrontRequest({ data: { query, variables } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("Payment required")) {
      toast.error("Shopify: Payment required", {
        description:
          "Shopify API access requires an active Shopify billing plan. Visit https://admin.shopify.com to upgrade.",
      });
      return undefined;
    }
    throw err;
  }

  if (result.errors?.length) {
    throw new Error(
      `Error calling Shopify: ${result.errors.map((e) => e.message).join(", ")}`,
    );
  }
  // Return the same shape as the old fetch().json() so all callers work:
  // { data: { products: ... } }  /  { data: { cart: ... } }  etc.
  return { data: result.data };
}


// `buyer` is accepted and intentionally ignored -- see src/hooks/useBuyerContext.ts
// for why @inContext(buyer:) can never be used with this app's classic customer
// tokens. B2B catalog pricing is applied as a separate server-side overlay
// (src/lib/b2b-pricing.functions.ts), on top of this same plain query's result.
export async function fetchProducts(first = 100, query?: string, _buyer?: BuyerContext): Promise<ShopifyProduct[]> {
  const variables: Record<string, unknown> = { first, query: query ?? null, after: null };
  const data = await storefrontApiRequest(STOREFRONT_QUERY, variables);
  return data?.data?.products?.edges ?? [];
}

/**
 * Fetches the ENTIRE catalogue via cursor pagination.
 *
 * The Storefront API caps `first` at 250 per request regardless of what's
 * passed -- a single fetchProducts(250) call silently drops every product
 * past the 250th once the store grows beyond that (confirmed live: this
 * store has 253 products, so 3 were invisible site-wide -- not specific to
 * any one category, just whichever products happened to fall after #250 in
 * Shopify's default ordering). This walks pageInfo.hasNextPage/cursor until
 * every product has been fetched, so the site's catalogue always matches
 * Shopify's real count regardless of how large the store grows.
 */
// See fetchProducts above for why `buyer` is accepted and ignored.
export async function fetchAllProducts(query?: string, _buyer?: BuyerContext): Promise<ShopifyProduct[]> {
  const all: ShopifyProduct[] = [];
  let after: string | null = null;
  // Sanity cap (40 * 250 = 10,000 products) so a pagination/API bug can
  // never spin forever rather than reflecting an unrealistic catalogue size.
  for (let page = 0; page < 40; page++) {
    const variables: Record<string, unknown> = { first: 250, query: query ?? null, after };
    const data = await storefrontApiRequest(STOREFRONT_QUERY, variables);
    const products = data?.data?.products;
    const edges: Array<{ cursor: string; node: ShopifyProductNode }> = products?.edges ?? [];
    if (edges.length === 0) break;
    all.push(...edges.map((e) => ({ node: e.node })));
    if (!products?.pageInfo?.hasNextPage) break;
    after = edges[edges.length - 1]?.cursor ?? null;
  }
  return all;
}

// See fetchProducts above for why `buyer` is accepted and ignored.
export async function fetchProductByHandle(handle: string, _buyer?: BuyerContext): Promise<ShopifyProductNode | null> {
  const variables: Record<string, unknown> = { handle };
  const data = await storefrontApiRequest(PRODUCT_BY_HANDLE_QUERY, variables);
  return data?.data?.product ?? null;
}

export function formatMoney(amount: string | number, currencyCode: string) {
  const value = typeof amount === "string" ? parseFloat(amount) : amount;
  try {
    const whole = Number.isInteger(value);
    return new Intl.NumberFormat(currencyCode === "INR" ? "en-IN" : undefined, {
      style: "currency",
      currency: currencyCode,
      minimumFractionDigits: whole ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${currencyCode} ${value.toFixed(2)}`;
  }
}




const RELATED_PRODUCTS_FIELDS = `
  handle
  title
  productType
  vendor
  tags
  availableForSale
  featuredImage { id url altText }
  priceRange { minVariantPrice { amount currencyCode } }
  images(first: 5) { edges { node { id url altText } } }
  variants(first: 100) { edges { node { id sku title price { amount currencyCode } compareAtPrice { amount currencyCode } availableForSale selectedOptions { name value } } } }
  collections(first: 10) { edges { node { handle } } }
`;

/**
 * Fetch related products from Shopify based on:
 * 1. Same collection handle (most relevant)
 * 2. Same productType
 * Always excludes the current product handle.
 */
export async function fetchRelatedProducts(
  currentHandle: string,
  productType: string,
  collectionHandles: string[],
  limit = 4,
  // See fetchProducts above for why `buyer` is accepted and ignored.
  _buyer?: BuyerContext,
): Promise<ShopifyProductNode[]> {
  const results: ShopifyProductNode[] = [];
  const seen = new Set<string>([currentHandle]);

  if (collectionHandles.length > 0) {
    const COLLECTION_QUERY = `
      query GetCollectionProducts($handle: String!, $first: Int!) {
        collection(handle: $handle) {
          products(first: $first) {
            edges { node { ${RELATED_PRODUCTS_FIELDS} } }
          }
        }
      }
    `;
    for (const handle of collectionHandles.slice(0, 2)) {
      try {
        const variables: Record<string, unknown> = { handle, first: limit + 2 };
        const data = await storefrontApiRequest(COLLECTION_QUERY, variables);
        const edges = data?.data?.collection?.products?.edges ?? [];
        for (const edge of edges) {
          const node = edge.node;
          if (!seen.has(node.handle)) {
            seen.add(node.handle);
            results.push(node);
          }
        }
        if (results.length >= limit) break;
      } catch {}
    }
  }

  if (results.length < limit && productType) {
    try {
      const typeQuery = `product_type:${JSON.stringify(productType)}`;
      const STOREFRONT_RELATED_QUERY = `
        query GetProducts($first: Int!, $query: String) {
          products(first: $first, query: $query) {
            edges { node { ${RELATED_PRODUCTS_FIELDS} } }
          }
        }
      `;
      const relatedVariables: Record<string, unknown> = { first: limit + 4, query: typeQuery };
      const data = await storefrontApiRequest(STOREFRONT_RELATED_QUERY, relatedVariables);
      const edges = data?.data?.products?.edges ?? [];
      for (const edge of edges) {
        const node = edge.node;
        if (!seen.has(node.handle)) {
          seen.add(node.handle);
          results.push(node);
        }
        if (results.length >= limit) break;
      }
    } catch {}
  }

  return results.slice(0, limit);
}

export type ShopifyCollectionNode = {
  id: string;
  handle: string;
  title: string;
  image?: { url: string; altText?: string };
};

export const COLLECTIONS_QUERY = `
  query GetCollections($first: Int!) {
    collections(first: $first) {
      edges {
        node {
          id
          handle
          title
          image {
            url
            altText
          }
        }
      }
    }
  }
`;

export async function fetchCollections(first = 50): Promise<{ node: ShopifyCollectionNode }[]> {
  const data = await storefrontApiRequest(COLLECTIONS_QUERY, { first });
  return data?.data?.collections?.edges ?? [];
}
