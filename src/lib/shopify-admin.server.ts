/**
 * Shopify Admin API access for the live app's server functions.
 *
 * SEPARATE credential set from the Storefront API token (shopify.functions.ts)
 * and from the metafield-migration scripts' own copy of this same OAuth
 * pattern (scripts/metafield-migration/shopify-auth.mjs) -- that one is
 * intentionally scoped to offline Node tooling outside the app's build
 * graph; this is the in-app, TypeScript port for use from createServerFn
 * handlers (currently just b2b.functions.ts).
 *
 * Uses OAuth 2.0 Client Credentials Grant against the "Officeneed Metafield
 * Migration" Dev Dashboard app -- the same app already installed on this
 * store (read_products/write_products were its only scopes before). For
 * the b2b.functions.ts company-location lookup, grant `read_customers`
 * FIRST and only -- Shopify's own access-scopes reference confirms
 * read_customers already covers Company + CompanyLocation for B2B, and
 * the query used here (Customer -> companyContactProfiles ->
 * roleAssignments -> companyLocation) never touches a write/mutation
 * surface. Add `read_companies` only if a live call actually fails with a
 * scope error naming it -- don't grant it preemptively.
 *
 * SECURITY: the client secret and every access token obtained here are
 * held only in memory for this server process/isolate -- never logged,
 * never written to a file, never included in an error message or returned
 * to the browser.
 */

// Verified live against this store on 2026-10-02: 2026-10 is Shopify's
// current "Latest stable" Admin API version (shopify.dev/docs/api/usage/
// versioning); 2025-07 (what this constant used to read) got silently
// downgrade-substituted by Shopify with a deprecation warning when tested
// live, confirming it's past its supported window. Re-verify this date
// periodically -- Shopify cuts a new stable version every quarter.
const SHOPIFY_ADMIN_API_VERSION = "2026-10";

function getShopDomain() {
  const shop = process.env["SHOPIFY_SHOP"];
  if (!shop) throw new Error("SHOPIFY_SHOP is not configured on the server.");
  return shop;
}

// In-process cache -- a fresh token is requested once per warm server
// isolate, not once per call, and re-requested automatically once close to
// expiry. Workers isolates recycle, so this is a best-effort cache, not a
// guarantee: a cold isolate just pays one extra token fetch.
let cachedToken: { accessToken: string; expiresAt: number } | null = null;
const EXPIRY_SAFETY_MARGIN_MS = 2 * 60 * 1000;
const FALLBACK_TOKEN_LIFETIME_MS = 23 * 60 * 60 * 1000; // used only if Shopify omits expires_in

async function requestNewToken(): Promise<{ accessToken: string; expiresAt: number }> {
  const shop = getShopDomain();
  const clientId = process.env["SHOPIFY_CLIENT_ID"];
  const clientSecret = process.env["SHOPIFY_CLIENT_SECRET"];
  if (!clientId || !clientSecret) {
    throw new Error("SHOPIFY_CLIENT_ID/SHOPIFY_CLIENT_SECRET are not configured on the server.");
  }

  const resp = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, grant_type: "client_credentials" }),
  });

  if (!resp.ok) {
    // Never echo the response body verbatim -- it can reflect request details.
    throw new Error(`Shopify Admin token request failed (HTTP ${resp.status}).`);
  }

  const json = (await resp.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) {
    throw new Error("Shopify token endpoint responded without an access_token.");
  }

  const lifetimeMs = typeof json.expires_in === "number" ? json.expires_in * 1000 : FALLBACK_TOKEN_LIFETIME_MS;
  return { accessToken: json.access_token, expiresAt: Date.now() + lifetimeMs - EXPIRY_SAFETY_MARGIN_MS };
}

async function getAdminAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.accessToken;
  cachedToken = await requestNewToken();
  return cachedToken.accessToken;
}

type AdminGraphQLResult<T> = {
  data: T | null;
  errors: Array<{ message: string }>;
};

/** Read-only or write Admin API GraphQL call. Never logs the token or request/response bodies. */
export async function adminGraphQLRequest<T = Record<string, unknown>>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<AdminGraphQLResult<T>> {
  const shop = getShopDomain();
  const token = await getAdminAccessToken();
  const url = `https://${shop}/admin/api/${SHOPIFY_ADMIN_API_VERSION}/graphql.json`;

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
    body: JSON.stringify({ query, variables }),
  });

  if (resp.status === 401 || resp.status === 403) {
    // Shopify's own error body usually names the missing scope explicitly
    // -- surface it rather than guessing, so testing with the minimal
    // read_customers scope first tells us definitively whether
    // read_companies is actually needed too, instead of assuming it is.
    const detail = await resp.text().catch(() => "");
    throw new Error(
      `Shopify Admin API authentication failed (HTTP ${resp.status}). This usually means a required access scope ` +
        `is missing from the app's Partner/Dev Dashboard installation. Shopify's response: ${detail.slice(0, 500)}`,
    );
  }
  if (!resp.ok) {
    throw new Error(`Shopify Admin API request failed (HTTP ${resp.status}).`);
  }

  const json = (await resp.json()) as { data?: T | null; errors?: Array<{ message: string }> };
  return { data: json.data ?? null, errors: json.errors ?? [] };
}
