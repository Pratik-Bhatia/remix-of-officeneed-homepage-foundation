declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

const measurementId = (import.meta.env['VITE_LOVABLE_CONNECTOR_GOOGLE_ANALYTICS_API_KEY'] ?? "").trim();
let initialized = false;
let lastPath: string | undefined;

/** Browser-only initialization; the GA measurement ID is intentionally public. */
export function trackGooglePageView(path: string) {
  if (typeof window === "undefined" || !/^G-[A-Z0-9]+$/i.test(measurementId)) return;
  if (!initialized) {
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function (..._args: unknown[]) {
      // Google expects an Arguments object, not an array.
      window.dataLayer?.push(arguments);
    };
    window.gtag("set", "developer_id.dZjgwMW", true);
    window.gtag("js", new Date());
    window.gtag("config", measurementId, { send_page_view: false });
    if (!document.querySelector('script[data-officeneed-google-analytics]')) {
      const script = document.createElement("script");
      script.async = true;
      script.dataset['officeneedGoogleAnalytics'] = "true";
      script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
      document.head.appendChild(script);
    }
    initialized = true;
  }
  if (lastPath === path) return;
  lastPath = path;
  // Do not send account/form query strings or fragments to Analytics.
  window.gtag?.("event", "page_view", {
    send_to: measurementId,
    page_path: path,
    page_location: `${window.location.origin}${path}`,
  });
}