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

// TEMPORARY DIAGNOSTIC (see this file's error messages below): every
// throw point here is prefixed with a bracketed stage tag -- a safe,
// stable identifier for WHICH Admin API initialization stage failed,
// added to pin down the exact production failure without exposing any
// secret, token, or Authorization header. Never logs SHOPIFY_CLIENT_ID/
// SHOPIFY_CLIENT_SECRET values, only whether each is present. Remove
// once the production root cause is confirmed and fixed.

function getShopDomain() {
  const shop = process.env["SHOPIFY_SHOP"];
  if (!shop) throw new Error("[ADMIN_ENV_MISSING:SHOPIFY_SHOP] SHOPIFY_SHOP is not configured on the server.");
  return shop;
}

// In-process cache -- a fresh token is requested once per warm server
// isolate, not once per call, and re-requested automatically once close to
// expiry. Workers isolates recycle, so this is a best-effort cache, not a
// guarantee: a cold isolate just pays one extra token fetch.
//
// IMPORTANT: this cache is time-based only -- an OAuth access token's
// granted scopes are fixed at the moment Shopify issues it and never
// change retroactively. If this isolate already cached a token BEFORE a
// new scope (e.g. write_companies) was granted to the app, that token
// stays "valid" (not expired) for its full ~24h lifetime while still only
// carrying the OLD scopes -- getAdminAccessToken() has no way to detect
// that from time alone. See invalidateCachedToken() and the retry-once
// logic in adminGraphQLRequest() below for how a stale-scope token actually
// gets replaced, rather than silently reused until it expires on its own.
let cachedToken: { accessToken: string; expiresAt: number } | null = null;
const EXPIRY_SAFETY_MARGIN_MS = 2 * 60 * 1000;
const FALLBACK_TOKEN_LIFETIME_MS = 23 * 60 * 60 * 1000; // used only if Shopify omits expires_in

/** Forces the next getAdminAccessToken() call to fetch a brand new token
 * instead of reusing whatever is cached -- used only after a response
 * proves the cached token's scopes are stale (see adminGraphQLRequest). */
function invalidateCachedToken(): void {
  cachedToken = null;
}

async function requestNewToken(): Promise<{ accessToken: string; expiresAt: number }> {
  const shop = getShopDomain();
  const clientId = process.env["SHOPIFY_CLIENT_ID"];
  const clientSecret = process.env["SHOPIFY_CLIENT_SECRET"];
  // Checked individually (not combined) so the diagnostic can name exactly
  // which variable(s) this runtime cannot see -- never their values.
  if (!clientId && !clientSecret) {
    throw new Error(
      "[ADMIN_ENV_MISSING:SHOPIFY_CLIENT_ID,SHOPIFY_CLIENT_SECRET] Neither SHOPIFY_CLIENT_ID nor SHOPIFY_CLIENT_SECRET is configured on the server.",
    );
  }
  if (!clientId) {
    throw new Error("[ADMIN_ENV_MISSING:SHOPIFY_CLIENT_ID] SHOPIFY_CLIENT_ID is not configured on the server.");
  }
  if (!clientSecret) {
    throw new Error("[ADMIN_ENV_MISSING:SHOPIFY_CLIENT_SECRET] SHOPIFY_CLIENT_SECRET is not configured on the server.");
  }

  const resp = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, grant_type: "client_credentials" }),
  });

  if (!resp.ok) {
    // Never echo the response body verbatim -- it can reflect request details.
    throw new Error(`[ADMIN_TOKEN_REQUEST_FAILED] Shopify Admin token request failed (HTTP ${resp.status}).`);
  }

  const json = (await resp.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) {
    throw new Error("[ADMIN_TOKEN_REQUEST_FAILED] Shopify token endpoint responded without an access_token.");
  }

  const lifetimeMs = typeof json.expires_in === "number" ? json.expires_in * 1000 : FALLBACK_TOKEN_LIFETIME_MS;
  return { accessToken: json.access_token, expiresAt: Date.now() + lifetimeMs - EXPIRY_SAFETY_MARGIN_MS };
}

/** `forceFresh` bypasses the cache entirely -- used by the stale-token
 * retry path, never by the normal/first-attempt call. */
async function getAdminAccessToken(forceFresh = false): Promise<string> {
  if (!forceFresh && cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.accessToken;
  cachedToken = await requestNewToken();
  return cachedToken.accessToken;
}

type AdminGraphQLError = { message: string; extensions?: { code?: string } };
type AdminGraphQLResult<T> = {
  data: T | null;
  errors: Array<AdminGraphQLError>;
};

/** True only when the response proves Shopify rejected the request on
 * authorization grounds BEFORE executing it -- an ACCESS_DENIED error
 * extension on a GraphQL-level error (confirmed live: comes back as a
 * normal 200 OK with the offending field's data null, not a 401/403), or
 * a raw 401/403 at the HTTP layer. Both mean the mutation never ran, so
 * retrying with a fresh token can never cause it to execute twice. */
function isUnexecutedScopeFailure(httpStatus: number, errors: Array<AdminGraphQLError>): boolean {
  if (httpStatus === 401 || httpStatus === 403) return true;
  return errors.some((e) => e.extensions?.code === "ACCESS_DENIED");
}

async function performAdminRequest<T>(
  query: string,
  variables: Record<string, unknown> | undefined,
  token: string,
): Promise<{ httpStatus: number; data: T | null; errors: Array<AdminGraphQLError> }> {
  const shop = getShopDomain();
  const url = `https://${shop}/admin/api/${SHOPIFY_ADMIN_API_VERSION}/graphql.json`;

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
    body: JSON.stringify({ query, variables }),
  });

  if (resp.status === 401 || resp.status === 403) {
    return { httpStatus: resp.status, data: null, errors: [{ message: `HTTP ${resp.status}` }] };
  }
  if (!resp.ok) {
    throw new Error(`Shopify Admin API request failed (HTTP ${resp.status}).`);
  }

  const json = (await resp.json()) as { data?: T | null; errors?: Array<AdminGraphQLError> };
  return { httpStatus: resp.status, data: json.data ?? null, errors: json.errors ?? [] };
}

/**
 * Read-only or write Admin API GraphQL call. Never logs the token or
 * request/response bodies.
 *
 * Retries EXACTLY ONCE, with a forcibly-refreshed token, if and only if
 * the response proves the request was rejected before execution on scope/
 * authorization grounds (see isUnexecutedScopeFailure) -- this is what
 * keeps a stale cached token (see the comment above cachedToken) from
 * permanently failing every subsequent call until it happens to expire on
 * its own. Any other kind of error (userErrors, throttling, a genuine 5xx,
 * a second scope failure even after the retry) is returned/thrown as-is --
 * never retried further, so a mutation like companyCreate can never
 * execute twice from this layer.
 */
export async function adminGraphQLRequest<T = Record<string, unknown>>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<AdminGraphQLResult<T>> {
  const token = await getAdminAccessToken();
  const first = await performAdminRequest<T>(query, variables, token);

  if (!isUnexecutedScopeFailure(first.httpStatus, first.errors)) {
    return { data: first.data, errors: first.errors };
  }

  // Proven not to have executed -- safe to invalidate and retry once with
  // a genuinely fresh token, in case this isolate's cached token predates
  // a scope that was granted to the app after it was issued.
  invalidateCachedToken();
  const freshToken = await getAdminAccessToken(true);
  const second = await performAdminRequest<T>(query, variables, freshToken);

  if (isUnexecutedScopeFailure(second.httpStatus, second.errors) && (second.httpStatus === 401 || second.httpStatus === 403)) {
    // A true 401/403 even on a brand new token is a real auth/config
    // problem (bad client id/secret, app uninstalled), not staleness --
    // surface it clearly rather than returning an empty-looking result.
    throw new Error(
      `[ADMIN_GRAPHQL_ACCESS_DENIED] Shopify Admin API authentication failed (HTTP ${second.httpStatus}) even after refreshing the token. This usually means a required access scope is missing from the app's Dev Dashboard installation, or the app's credentials are no longer valid.`,
    );
  }
  return { data: second.data, errors: second.errors };
}
