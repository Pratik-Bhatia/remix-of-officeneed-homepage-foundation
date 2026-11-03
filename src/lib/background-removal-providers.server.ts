// Background-removal provider registry + server-side provider selection.
// Everything provider-specific (endpoint, auth, request/response format,
// cache variant) lives behind BackgroundRemovalProvider, so the rest of the
// pipeline (logo-processing-core.server.ts: validation, caching, quotas,
// concurrency, laser/UV generation) never has to change when the provider
// does.
//
// Configuration (server-side env only -- never VITE_*):
// - BG_REMOVAL_PROVIDER           "api4ai" (default) | "removebg"
// - BG_REMOVAL_FALLBACK_PROVIDER  "removebg" | "api4ai" | "none"
//     default: "removebg" when the primary is api4ai, "none" otherwise.
// - API4AI_API_KEY / REMOVE_BG_API_KEY  the providers' own secrets.
//
// If the primary's key is missing but the fallback's key is present, the
// fallback is promoted to primary (logged as an error) so a deployment that
// hasn't had API4AI_API_KEY added yet keeps working on remove.bg instead of
// breaking logo uploads.
import { callApi4aiApi, API4AI_KIND, API4AI_MODE } from "@/lib/api4ai-client.server";
import { callRemoveBgApi } from "@/lib/remove-bg-client.server";
import type { ValidatedImage } from "@/lib/image-validation.server";
import type { BackgroundRemovalApiResult, BackgroundRemovalProviderId } from "@/lib/background-removal-types";
import { MAX_OUTPUT_LONGEST_SIDE_PX } from "@/lib/png-output.server";

export interface BackgroundRemovalProvider {
  id: BackgroundRemovalProviderId;
  displayName: string;
  apiKeyEnv: "API4AI_API_KEY" | "REMOVE_BG_API_KEY";
  /** Mixed into the cache fingerprint (computeFingerprint). Must change
   * whenever the provider or any output-affecting parameter changes. */
  cacheVariant: string;
  call(params: { apiKey: string; image: ValidatedImage; imageBase64: string; timeoutMs: number }): Promise<BackgroundRemovalApiResult>;
}

/** remove.bg's `size` parameter. Its cache variant is exactly this value --
 * the same input computeFingerprint received before providers existed -- so
 * every existing cached remove.bg result keeps matching. */
export const REMOVE_BG_SIZE = "small" as const;

const removeBgProvider: BackgroundRemovalProvider = {
  id: "removebg",
  displayName: "remove.bg",
  apiKeyEnv: "REMOVE_BG_API_KEY",
  cacheVariant: REMOVE_BG_SIZE,
  call: ({ apiKey, imageBase64, timeoutMs }) => callRemoveBgApi({ apiKey, imageBase64, size: REMOVE_BG_SIZE, timeoutMs }),
};

const api4aiProvider: BackgroundRemovalProvider = {
  id: "api4ai",
  displayName: "API4AI",
  apiKeyEnv: "API4AI_API_KEY",
  // Distinct from remove.bg's "small", so an API4AI request can never be
  // served a cached remove.bg result (and vice versa).
  cacheVariant: `api4ai:${API4AI_MODE}:${API4AI_KIND}:max${MAX_OUTPUT_LONGEST_SIDE_PX}`,
  call: ({ apiKey, image, timeoutMs }) =>
    callApi4aiApi({ apiKey, imageBytes: image.bytes, mimeType: `image/${image.format}`, timeoutMs }),
};

const PROVIDERS: Record<BackgroundRemovalProviderId, BackgroundRemovalProvider> = {
  api4ai: api4aiProvider,
  removebg: removeBgProvider,
};

export function getProvider(id: BackgroundRemovalProviderId): BackgroundRemovalProvider {
  return PROVIDERS[id];
}

export interface ConfiguredProvider {
  provider: BackgroundRemovalProvider;
  apiKey: string;
}

export interface ProviderPlan {
  primary: ConfiguredProvider;
  /** At most ONE fallback attempt per request -- never a retry loop. */
  fallback: ConfiguredProvider | null;
}

const DEFAULT_PRIMARY: BackgroundRemovalProviderId = "api4ai";

function parseProviderId(raw: string | undefined): BackgroundRemovalProviderId | null {
  const value = raw?.trim().toLowerCase();
  return value === "api4ai" || value === "removebg" ? value : null;
}

function readKey(provider: BackgroundRemovalProvider): string | null {
  // Only the exact server-side name. A VITE_-prefixed copy is never read.
  const value = process.env[provider.apiKeyEnv]?.trim();
  return value ? value : null;
}

/** Resolves which provider(s) this request may use. Returns null when no
 * usable provider has a key (the caller fails safe: "not configured"). */
export function resolveProviderPlan(): ProviderPlan | null {
  const rawPrimary = process.env["BG_REMOVAL_PROVIDER"];
  let primaryId = parseProviderId(rawPrimary);
  if (rawPrimary && !primaryId) {
    console.error(`[logo-processing] Unknown BG_REMOVAL_PROVIDER value; using "${DEFAULT_PRIMARY}".`);
  }
  primaryId ??= DEFAULT_PRIMARY;

  const rawFallback = process.env["BG_REMOVAL_FALLBACK_PROVIDER"]?.trim().toLowerCase();
  let fallbackId: BackgroundRemovalProviderId | null;
  if (rawFallback === "none") {
    fallbackId = null;
  } else if (rawFallback) {
    fallbackId = parseProviderId(rawFallback);
    if (!fallbackId) console.error(`[logo-processing] Unknown BG_REMOVAL_FALLBACK_PROVIDER value; fallback disabled.`);
  } else {
    fallbackId = primaryId === "api4ai" ? "removebg" : null;
  }
  if (fallbackId === primaryId) fallbackId = null;

  const primary = PROVIDERS[primaryId];
  const fallback = fallbackId ? PROVIDERS[fallbackId] : null;
  const primaryKey = readKey(primary);
  const fallbackKey = fallback ? readKey(fallback) : null;

  if (!primaryKey) {
    console.error(`[logo-processing] ${primary.apiKeyEnv} is not set in the server environment; ${primary.displayName} background removal is disabled.`);
    if (fallback && fallbackKey) {
      console.error(`[logo-processing] Using the configured fallback provider (${fallback.displayName}) as primary.`);
      return { primary: { provider: fallback, apiKey: fallbackKey }, fallback: null };
    }
    return null;
  }

  if (fallback && !fallbackKey) {
    console.warn(`[logo-processing] ${fallback.apiKeyEnv} is not set; ${fallback.displayName} fallback is disabled.`);
  }
  return {
    primary: { provider: primary, apiKey: primaryKey },
    fallback: fallback && fallbackKey ? { provider: fallback, apiKey: fallbackKey } : null,
  };
}
