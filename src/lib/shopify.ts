/**
 * Shopify Storefront API client for the connected OfficeNeed store.
 *
 * Browser code calls storefrontApiRequest() which proxies through the
 * server-side proxyStorefrontRequest server function so the Shopify
 * access token is never embedded in or sent from browser JavaScript.
 */
import { toast } from "sonner";
import { proxyStorefrontRequest } from "@/lib/shopify.functions";

export const SHOPIFY_API_VERSION = "2025-07";
export const SHOPIFY_STORE_PERMANENT_DOMAIN = "har1k4-di.myshopify.com";

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
  metafields?: Array<{ key: string; value: string; type: string } | null>;
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
  query GetProducts($first: Int!, $query: String) {
    products(first: $first, query: $query) {
      edges { node { ${PRODUCT_FIELDS} } }
    }
  }
`;

export const PRODUCT_BY_HANDLE_QUERY = `
  query GetProduct($handle: String!) {
    product(handle: $handle) { ${PRODUCT_FIELDS} }
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


export async function fetchProducts(first = 100, query?: string): Promise<ShopifyProduct[]> {
  const data = await storefrontApiRequest(STOREFRONT_QUERY, { first, query: query ?? null });
  return data?.data?.products?.edges ?? [];
}

export async function fetchProductByHandle(handle: string): Promise<ShopifyProductNode | null> {
  const data = await storefrontApiRequest(PRODUCT_BY_HANDLE_QUERY, { handle });
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
        const data = await storefrontApiRequest(COLLECTION_QUERY, { handle, first: limit + 2 });
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
      const data = await storefrontApiRequest(STOREFRONT_RELATED_QUERY, { first: limit + 4, query: typeQuery });
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
