/**
 * Shopify Admin API authentication -- OAuth 2.0 Client Credentials Grant,
 * for the "Officeneed Metafield Migration" Dev Dashboard app acting on our
 * own store. This is a SEPARATE credential set from the Storefront API
 * tokens the live website uses (src/lib/shopify.ts) -- neither reads the
 * other's environment variables, and neither is used for the other's calls.
 *
 * Reads three environment variables, never hardcoded:
 *   SHOPIFY_SHOP           e.g. "har1k4-di.myshopify.com"
 *   SHOPIFY_CLIENT_ID      from the Dev Dashboard app's API credentials
 *   SHOPIFY_CLIENT_SECRET  from the Dev Dashboard app's API credentials
 *
 * The client secret and every access token this module obtains are held
 * only in memory for this process -- never logged, never written to a
 * file, never included in an error message or returned value.
 */

const SHOP = process.env.SHOPIFY_SHOP;
const CLIENT_ID = process.env.SHOPIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET;

/** True once all three required env vars are present (does not verify they're valid). */
export function hasAdminCredentials() {
  return !!(SHOP && CLIENT_ID && CLIENT_SECRET);
}

export function missingAdminCredentials() {
  const missing = [];
  if (!SHOP) missing.push("SHOPIFY_SHOP");
  if (!CLIENT_ID) missing.push("SHOPIFY_CLIENT_ID");
  if (!CLIENT_SECRET) missing.push("SHOPIFY_CLIENT_SECRET");
  return missing;
}

// In-process cache -- a fresh token is requested once per process run, not
// once per API call, and re-requested automatically once it's close to
// expiry (Shopify's client_credentials tokens last ~24h; we refresh a
// couple of minutes early to avoid a request failing mid-expiry).
let cachedToken = null; // { accessToken, expiresAt }
const EXPIRY_SAFETY_MARGIN_MS = 2 * 60 * 1000;
const FALLBACK_TOKEN_LIFETIME_MS = 23 * 60 * 60 * 1000; // used only if Shopify omits expires_in

async function requestNewToken(attempt = 1) {
  const url = `https://${SHOP}/admin/oauth/access_token`;
  let resp;
  try {
    resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: "client_credentials",
      }),
    });
  } catch (networkErr) {
    if (attempt <= 3) {
      await new Promise((r) => setTimeout(r, 500 * attempt));
      return requestNewToken(attempt + 1);
    }
    throw new Error(`Network error obtaining Shopify Admin access token after 3 retries: ${networkErr.message}`);
  }

  if (resp.status === 429 || resp.status >= 500) {
    if (attempt <= 3) {
      await new Promise((r) => setTimeout(r, 500 * attempt));
      return requestNewToken(attempt + 1);
    }
    throw new Error(`Shopify token endpoint returned HTTP ${resp.status} after retries.`);
  }

  if (!resp.ok) {
    // 400/401/403 -- invalid client id/secret/shop or missing consent.
    // Never include the response body verbatim (it can echo request
    // details); surface only status + a fixed, safe message.
    throw new Error(
      `Shopify Admin token request failed (HTTP ${resp.status}). Check SHOPIFY_SHOP/SHOPIFY_CLIENT_ID/SHOPIFY_CLIENT_SECRET ` +
        `and that the app is installed on this store with the client_credentials grant enabled.`,
    );
  }

  const json = await resp.json();
  if (!json.access_token) {
    throw new Error("Shopify token endpoint responded without an access_token.");
  }

  const lifetimeMs = typeof json.expires_in === "number" ? json.expires_in * 1000 : FALLBACK_TOKEN_LIFETIME_MS;
  return {
    accessToken: json.access_token,
    expiresAt: Date.now() + lifetimeMs - EXPIRY_SAFETY_MARGIN_MS,
  };
}

/**
 * Returns a valid Admin API access token, fetching a new one only if none
 * is cached or the cached one is close to expiring. Never logs the token.
 */
export async function getAdminAccessToken() {
  if (!hasAdminCredentials()) {
    throw new Error(
      `Shopify Admin credentials not configured. Missing: ${missingAdminCredentials().join(", ")}. ` +
        "Set these in .env before requesting an Admin API token.",
    );
  }
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.accessToken;
  }
  cachedToken = await requestNewToken();
  return cachedToken.accessToken;
}
