/**
 * Marketing attribution handoff. Captures UTM / click-id / referrer data on
 * landing (first touch) so it can be appended to the Shopify checkout URL and
 * saved as cart attributes -- Shopify's own analytics never see our frontend.
 */
const KEY = "officeneed_attribution";
const TTL_MS = 30 * 24 * 60 * 60 * 1000;
const PARAMS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "utm_id",
  "gclid",
  "fbclid",
  "msclkid",
  "ref",
] as const;

type Stored = { params: Record<string, string>; savedAt: number };

function read(): Stored | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(KEY) ?? window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Stored;
    if (Date.now() - parsed.savedAt > TTL_MS) {
      window.localStorage.removeItem(KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/** Call once on app load. Newer campaign params replace older ones. */
export function captureAttribution() {
  if (typeof window === "undefined") return;
  try {
    const url = new URL(window.location.href);
    const found: Record<string, string> = {};
    for (const p of PARAMS) {
      const v = url.searchParams.get(p);
      if (v) found[p] = v.slice(0, 200);
    }
    const ref = document.referrer;
    if (ref) {
      try {
        const refHost = new URL(ref).hostname;
        if (refHost && refHost !== window.location.hostname) found["referrer"] = ref.slice(0, 300);
      } catch {
        /* ignore bad referrer */
      }
    }
    if (Object.keys(found).length === 0) return;
    const existing = read();
    // A new campaign click replaces the old one; a bare referrer only fills gaps.
    const hasCampaign = PARAMS.some((p) => found[p]);
    const params = hasCampaign ? found : { ...found, ...(existing?.params ?? {}) };
    const value = JSON.stringify({ params, savedAt: Date.now() } satisfies Stored);
    window.sessionStorage.setItem(KEY, value);
    window.localStorage.setItem(KEY, value);
  } catch {
    /* storage unavailable */
  }
}

export function getAttribution(): Record<string, string> {
  return read()?.params ?? {};
}

/** Append stored attribution params to a URL without overwriting existing ones. */
export function appendAttribution(urlString: string): string {
  const params = getAttribution();
  try {
    const url = new URL(urlString);
    for (const [k, v] of Object.entries(params)) {
      if (k === "referrer") continue;
      if (!url.searchParams.has(k)) url.searchParams.set(k, v);
    }
    return url.toString();
  } catch {
    return urlString;
  }
}
