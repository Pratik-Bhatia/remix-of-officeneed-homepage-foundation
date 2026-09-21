/**
 * Shopify access for the metafield migration tooling.
 *
 * READS use the same Storefront API token the app already uses
 * (SHOPIFY_HEADLESS_STOREFRONT_TOKEN / SHOPIFY_STOREFRONT_ACCESS_TOKEN,
 * src/lib/shopify.ts) -- no second auth system, and this is completely
 * separate from the Admin credentials below. Storefront API can read
 * product data and any metafield that has Storefront-API access enabled,
 * which is sufficient for a dry run.
 *
 * WRITES require the Shopify Admin API (metafieldsSet mutation) -- the
 * Storefront API cannot write product data at all, and is never used for
 * writes here. Admin API access is obtained via OAuth Client Credentials
 * Grant (see shopify-auth.mjs) using the "Officeneed Metafield Migration"
 * Dev Dashboard app's SHOPIFY_SHOP/SHOPIFY_CLIENT_ID/SHOPIFY_CLIENT_SECRET.
 * The resulting access token is never hardcoded, logged, or included in
 * any thrown error message or returned value.
 */
import { getAdminAccessToken, hasAdminCredentials } from "./shopify-auth.mjs";

const DOMAIN = "har1k4-di.myshopify.com";
const API_VERSION = "2025-07";

const STOREFRONT_TOKEN =
  process.env.SHOPIFY_HEADLESS_STOREFRONT_TOKEN ||
  process.env.SHOPIFY_HEADLESS_STOREFRONT_TOKEN_TEST ||
  process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN;

if (!STOREFRONT_TOKEN) {
  throw new Error(
    "No Storefront API token found (SHOPIFY_HEADLESS_STOREFRONT_TOKEN / SHOPIFY_STOREFRONT_ACCESS_TOKEN). " +
      "Run with `node --env-file=.env ...` from the project root.",
  );
}

export { hasAdminCredentials };

/** Thrown for Shopify API failures. `permanent: true` means retrying will not help (auth/validation). */
export class ShopifyApiError extends Error {
  constructor(message, { permanent, status } = {}) {
    super(message);
    this.name = "ShopifyApiError";
    this.permanent = !!permanent;
    this.status = status;
  }
}

const MAX_RETRIES = 4;

/**
 * @param authHeader either "X-Shopify-Storefront-Access-Token" (Storefront API)
 *   or "X-Shopify-Access-Token" (Admin API) -- never sends both, and never
 *   logs the token value itself, only the fact that a request was made.
 */
async function graphql(endpoint, authHeader, token, query, variables, attempt = 1) {
  let resp;
  try {
    resp = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", [authHeader]: token },
      body: JSON.stringify({ query, variables }),
    });
  } catch (networkErr) {
    // Network-level failure (DNS, connection reset, etc.) -- transient, retry.
    if (attempt <= MAX_RETRIES) {
      await new Promise((r) => setTimeout(r, 500 * attempt));
      return graphql(endpoint, authHeader, token, query, variables, attempt + 1);
    }
    throw new ShopifyApiError(`Network error calling Shopify after ${MAX_RETRIES} retries: ${networkErr.message}`, {
      permanent: false,
    });
  }

  // 401/403: invalid or unauthorized token -- permanent, never retry, and
  // never echo the response body (it can reflect request details back).
  if (resp.status === 401 || resp.status === 403) {
    throw new ShopifyApiError(
      `Shopify API authentication failed (HTTP ${resp.status}). Check that the access token is valid and has the required scopes.`,
      { permanent: true, status: resp.status },
    );
  }

  // 429 or 5xx: transient, retry with backoff.
  if ((resp.status === 429 || resp.status >= 500) && attempt <= MAX_RETRIES) {
    await new Promise((r) => setTimeout(r, 500 * attempt));
    return graphql(endpoint, authHeader, token, query, variables, attempt + 1);
  }

  if (!resp.ok) {
    throw new ShopifyApiError(`Shopify API request failed (HTTP ${resp.status}).`, {
      permanent: resp.status < 500,
      status: resp.status,
    });
  }

  const json = await resp.json();

  const throttled = json.errors?.some((e) => e.extensions?.code === "THROTTLED");
  if (throttled && attempt <= MAX_RETRIES) {
    await new Promise((r) => setTimeout(r, 1000 * attempt));
    return graphql(endpoint, authHeader, token, query, variables, attempt + 1);
  }

  if (json.errors?.length) {
    // Query/schema/validation errors -- permanent, not retried.
    throw new ShopifyApiError(`Shopify GraphQL error: ${json.errors.map((e) => e.message).join(", ")}`, {
      permanent: true,
    });
  }
  return json.data;
}

const STOREFRONT_ENDPOINT = `https://${DOMAIN}/api/${API_VERSION}/graphql.json`;
const ADMIN_ENDPOINT = `https://${DOMAIN}/admin/api/${API_VERSION}/graphql.json`;

function storefrontGraphql(query, variables) {
  return graphql(STOREFRONT_ENDPOINT, "X-Shopify-Storefront-Access-Token", STOREFRONT_TOKEN, query, variables);
}

async function adminGraphql(query, variables) {
  const token = await getAdminAccessToken(); // cached in-process; only fetches a new one when missing/near-expiry
  return graphql(ADMIN_ENDPOINT, "X-Shopify-Access-Token", token, query, variables);
}

const PRODUCT_QUERY = `
  query GetProduct($handle: String!, $metafieldIdentifiers: [HasMetafieldsIdentifier!]!) {
    product(handle: $handle) {
      id
      title
      handle
      descriptionHtml
      collections(first: 50) { edges { node { handle } } }
      metafields(identifiers: $metafieldIdentifiers) {
        namespace
        key
        value
      }
    }
  }
`;

const COLLECTION_PRODUCTS_QUERY = `
  query GetCollectionProducts($handle: String!, $first: Int!, $after: String) {
    collection(handle: $handle) {
      products(first: $first, after: $after) {
        pageInfo { hasNextPage endCursor }
        edges { node { handle } }
      }
    }
  }
`;

const ALL_PRODUCTS_QUERY = `
  query GetAllProducts($first: Int!, $after: String) {
    products(first: $first, after: $after) {
      pageInfo { hasNextPage endCursor }
      edges { node { handle } }
    }
  }
`;

/** Fetches one product by handle, including collections and the given metafield identifiers. */
export async function fetchProductForMigration(handle, metafieldIdentifiers) {
  const data = await storefrontGraphql(PRODUCT_QUERY, { handle, metafieldIdentifiers });
  return data.product;
}

/** Every product handle in a given collection, paginated (for scaling to 200+ products later). */
export async function fetchAllHandlesInCollection(collectionHandle, pageSize = 50) {
  const handles = [];
  let after = null;
  for (;;) {
    const data = await storefrontGraphql(COLLECTION_PRODUCTS_QUERY, { handle: collectionHandle, first: pageSize, after });
    const edges = data.collection?.products?.edges ?? [];
    handles.push(...edges.map((e) => e.node.handle));
    if (!data.collection?.products?.pageInfo?.hasNextPage) break;
    after = data.collection.products.pageInfo.endCursor;
  }
  return handles;
}

/** Every product handle in the store, paginated -- the entry point for the full 200+ product run. */
export async function fetchAllProductHandles(pageSize = 100) {
  const handles = [];
  let after = null;
  for (;;) {
    const data = await storefrontGraphql(ALL_PRODUCTS_QUERY, { first: pageSize, after });
    const edges = data.products?.edges ?? [];
    handles.push(...edges.map((e) => e.node.handle));
    if (!data.products?.pageInfo?.hasNextPage) break;
    after = data.products.pageInfo.endCursor;
  }
  return handles;
}

/**
 * READ-ONLY: confirms the Admin API token authenticates, resolves to the
 * expected store, and carries the required scopes. Performs no writes.
 */
export async function verifyAdminAccess() {
  const query = `
    query VerifyAdminAccess {
      shop { name myshopifyDomain }
      appInstallation {
        accessScopes { handle }
      }
    }
  `;
  const data = await adminGraphql(query, {});
  return {
    shopName: data.shop?.name,
    shopDomain: data.shop?.myshopifyDomain,
    scopes: (data.appInstallation?.accessScopes ?? []).map((s) => s.handle),
  };
}

/**
 * READ-ONLY: fetches one product by its GID via the Admin API -- the same
 * API surface a write would use, so this is the strongest possible
 * pre-write confirmation of identity (title/handle/collections) and
 * current metafield state. No writes.
 */
export async function fetchProductByIdViaAdmin(gid) {
  // Unlike the Storefront API, Admin API's Product.metafields is a paginated
  // connection with no identifier filter -- fetch all (a handful per
  // product in this migration) and let the caller look up the keys it needs.
  const query = `
    query GetProductById($id: ID!) {
      product(id: $id) {
        id
        title
        handle
        descriptionHtml
        collections(first: 50) { edges { node { handle } } }
        metafields(first: 50) {
          edges { node { namespace key value } }
        }
      }
    }
  `;
  const data = await adminGraphql(query, { id: gid });
  const product = data.product;
  if (!product) return null;
  return {
    ...product,
    metafields: (product.metafields?.edges ?? []).map((e) => e.node),
  };
}

/** READ-ONLY: fetches a small number of products via the Admin API, for the Task 4 smoke test. No writes. */
export async function fetchProductsViaAdmin(first = 3) {
  const query = `
    query AdminProductsSmokeTest($first: Int!) {
      products(first: $first) {
        edges { node { id title handle } }
      }
    }
  `;
  const data = await adminGraphql(query, { first });
  return (data.products?.edges ?? []).map((e) => e.node);
}

/**
 * READ-ONLY: fetches every product-owned metafield DEFINITION from Shopify
 * (namespace, key, and its real type) -- the ground truth for what type
 * metafieldsSet must be called with. Never assumed/hardcoded. Cached
 * in-process since definitions don't change mid-run.
 */
let cachedDefinitions = null;
export async function fetchMetafieldDefinitions() {
  if (cachedDefinitions) return cachedDefinitions;
  const query = `
    query GetProductMetafieldDefinitions($first: Int!) {
      metafieldDefinitions(ownerType: PRODUCT, first: $first) {
        edges { node { namespace key name type { name } } }
      }
    }
  `;
  const data = await adminGraphql(query, { first: 100 });
  cachedDefinitions = (data.metafieldDefinitions?.edges ?? []).map((e) => e.node);
  return cachedDefinitions;
}

/** Real Shopify type (e.g. "single_line_text_field", "number_integer") for one namespace.key, or undefined if no definition exists. */
export async function getMetafieldType(namespace, key) {
  const defs = await fetchMetafieldDefinitions();
  return defs.find((d) => d.namespace === namespace && d.key === key)?.type?.name;
}

/**
 * Writes metafields via the Shopify Admin API (metafieldsSet). Requires
 * SHOPIFY_ADMIN_ACCESS_TOKEN. Writes EXACTLY the values passed in --
 * performs no transformation, shortening, or enhancement of any kind.
 * Caller is responsible for only ever passing fields whose action is
 * POPULATE (see run.mjs) -- this function has no opinion on that and will
 * write whatever it's given, so it must never be called directly outside
 * the reviewed write pipeline.
 */
export async function writeMetafields(productGid, metafields) {
  if (!hasAdminCredentials()) {
    throw new ShopifyApiError(
      "Shopify Admin credentials are not configured -- writes require SHOPIFY_SHOP, SHOPIFY_CLIENT_ID and " +
        "SHOPIFY_CLIENT_SECRET (the 'Officeneed Metafield Migration' Dev Dashboard app's credentials) in .env " +
        "before running with DRY_RUN=false.",
      { permanent: true },
    );
  }
  // Resolve each field's REAL Shopify type from the live metafield
  // definition -- never assumed. A missing definition stops the whole
  // product's write rather than guessing a type (see fetchMetafieldDefinitions).
  const input = [];
  for (const m of metafields) {
    const type = await getMetafieldType(m.namespace, m.key);
    if (!type) {
      throw new ShopifyApiError(
        `No Shopify metafield definition found for ${m.namespace}.${m.key} -- refusing to guess a type. ` +
          `Create the definition in Shopify Admin first, or investigate why it wasn't returned.`,
        { permanent: true },
      );
    }
    input.push({ ownerId: productGid, namespace: m.namespace, key: m.key, type, value: m.value });
  }

  const mutation = `
    mutation SetMetafields($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields { id namespace key value }
        userErrors { field message }
      }
    }
  `;
  const data = await adminGraphql(mutation, { metafields: input });
  const result = data.metafieldsSet;
  if (result.userErrors?.length) {
    // Shopify-side validation failure (e.g. bad type/value) -- permanent,
    // the caller should not retry this product's write unmodified.
    throw new ShopifyApiError(
      `metafieldsSet validation error(s): ${result.userErrors.map((e) => `${e.field?.join(".")}: ${e.message}`).join("; ")}`,
      { permanent: true },
    );
  }
  return result;
}
