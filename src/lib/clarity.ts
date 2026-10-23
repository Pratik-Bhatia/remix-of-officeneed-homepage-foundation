/**
 * Microsoft Clarity (session replay / heatmaps), loaded once from the root layout.
 *
 * - The project ID is a public identifier (it is in the page source of every
 *   Clarity-enabled site), not a secret.
 * - Clarity's own tag follows client-side (history API) navigation, so no manual
 *   page-view calls are made -- sending them too would double-count.
 * - Clarity records page URLs. A few routes carry credential links in the URL
 *   (password reset / account activation) so Clarity is never started while the
 *   shopper is on one; it begins on the first safe page instead.
 * - Personal-data forms and account areas are masked with Clarity's documented
 *   `data-clarity-mask="True"` attribute (see CLARITY_MASK).
 * - Shopify's hosted checkout is a different domain and never loads this script.
 */
export const CLARITY_PROJECT_ID = "z2a061qk44";

/** Spread onto any element whose contents (text AND inputs) must never be recorded. */
export const CLARITY_MASK = { "data-clarity-mask": "True" } as const;

declare global {
  interface Window {
    clarity?: ((...args: unknown[]) => void) & { q?: unknown[] };
  }
}

/** Routes that handle credentials or one-time links: Clarity must not be running on a load that starts here. */
const SENSITIVE_PATH = /^\/(password-reset|reset-password|activate|auth)(\/|$)/;
/** Query parameters that carry credential links/tokens (e.g. ?reset_url=, ?activation_url=). */
const SENSITIVE_QUERY = /[?&](reset_url|activation_url|token|key|customer_id)=/i;

/** False for any URL that must never be sent to Clarity. */
export function isClarityAllowed(pathname: string, search: string): boolean {
  return !SENSITIVE_PATH.test(pathname) && !SENSITIVE_QUERY.test(search.startsWith("?") ? search : `?${search}`);
}

/** Production builds only; a local/staging run can opt in with localStorage["officeneed-clarity"]="1" to test. */
function clarityEnabledHere(): boolean {
  if (import.meta.env.PROD) return true;
  try {
    return window.localStorage.getItem("officeneed-clarity") === "1";
  } catch {
    return false;
  }
}

let initialized = false;

/** Browser-only, idempotent: injects Clarity's official async snippet exactly once. */
export function initClarity(): boolean {
  if (typeof window === "undefined" || !clarityEnabledHere()) return false;
  if (initialized) return true;
  // Survives HMR / a re-evaluated module: never inject a second tag.
  if (document.querySelector("script[data-officeneed-clarity]")) {
    initialized = true;
    return true;
  }

  // Official Clarity snippet, written out (not an inline <script>) so it is injected once from React.
  const c = window as Window;
  if (!c.clarity) {
    const queue: unknown[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stub: any = function () {
      // eslint-disable-next-line prefer-rest-params
      queue.push(arguments);
    };
    stub.q = queue;
    c.clarity = stub;
  }
  const script = document.createElement("script");
  script.async = true;
  script.dataset["officeneedClarity"] = "true";
  script.src = `https://www.clarity.ms/tag/${CLARITY_PROJECT_ID}`;
  const first = document.getElementsByTagName("script")[0];
  if (first?.parentNode) first.parentNode.insertBefore(script, first);
  else document.head.appendChild(script);

  initialized = true;
  return true;
}
