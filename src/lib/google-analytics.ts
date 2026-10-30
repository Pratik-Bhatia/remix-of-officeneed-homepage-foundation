import { whenIdleAfterLoad } from "@/lib/idle";
declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
  interface ImportMetaEnv {
    readonly VITE_LOVABLE_CONNECTOR_GOOGLE_ANALYTICS_API_KEY?: string;
    readonly VITE_GA_MEASUREMENT_ID?: string;
    readonly VITE_GA4_MEASUREMENT_ID?: string;
    readonly VITE_GOOGLE_ANALYTICS_ID?: string;
  }
}

const safeTrim = (val: unknown): string => (typeof val === "string" ? val.trim() : "");

const FALLBACK_GA_MEASUREMENT_ID = "G-34E9F2S835";

const getClientMeasurementId = (): string => {
  try {
    if (typeof import.meta !== "undefined" && import.meta.env) {
      const id =
        import.meta.env.VITE_GA_MEASUREMENT_ID ||
        import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_ANALYTICS_API_KEY ||
        import.meta.env.VITE_GA4_MEASUREMENT_ID ||
        import.meta.env.VITE_GOOGLE_ANALYTICS_ID;
      if (safeTrim(id)) return safeTrim(id);
    }
  } catch {
    // ignore
  }

  try {
    if (typeof process !== "undefined" && process.env) {
      const id =
        process.env["VITE_GA_MEASUREMENT_ID"] ||
        process.env["VITE_LOVABLE_CONNECTOR_GOOGLE_ANALYTICS_API_KEY"] ||
        process.env["LOVABLE_CONNECTOR_GOOGLE_ANALYTICS_API_KEY"] ||
        process.env["GA_MEASUREMENT_ID"] ||
        process.env["VITE_GA4_MEASUREMENT_ID"] ||
        process.env["GA4_MEASUREMENT_ID"] ||
        process.env["VITE_GOOGLE_ANALYTICS_ID"] ||
        process.env["GOOGLE_ANALYTICS_ID"];
      if (safeTrim(id)) return safeTrim(id);
    }
  } catch {
    // ignore
  }

  return FALLBACK_GA_MEASUREMENT_ID;
};

export const GA_MEASUREMENT_ID = getClientMeasurementId();

let initialized = false;
let lastPath: string | undefined;

/** Extract numeric ID from Shopify GID (e.g. "gid://shopify/ProductVariant/12345" -> "12345") */
const numericId = (gid: string) => gid.split("/").pop() ?? gid;

/** Browser-only initialization; the GA measurement ID is intentionally public. */
export function initGoogleAnalytics() {
  if (typeof window === "undefined" || !/^G-[A-Z0-9]+$/i.test(GA_MEASUREMENT_ID)) return false;
  if (initialized) return true;

  window.dataLayer = window.dataLayer || [];
  window.gtag =
    window.gtag ||
    function (..._args: unknown[]) {
      // Google expects an Arguments object, not an array.
      window.dataLayer?.push(arguments);
    };

  window.gtag("set", "developer_id.dZjgwMW", true);
  window.gtag("js", new Date());
  window.gtag("config", GA_MEASUREMENT_ID, { send_page_view: false });

  // dataLayer/gtag above exist immediately, so config, page_view and
  // ecommerce events queue and are sent once gtag.js arrives; only the
  // script download/parse waits until after load + idle (off first render).
  whenIdleAfterLoad(() => {
    if (document.querySelector("script[data-officeneed-google-analytics]")) return;
    const script = document.createElement("script");
    script.async = true;
    script.dataset["officeneedGoogleAnalytics"] = "true";
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_MEASUREMENT_ID)}`;
    document.head.appendChild(script);
  });

  initialized = true;
  return true;
}

/** Root-mounted page view tracker. Pathname only -- never sends sensitive query strings or fragments. */
export function trackGooglePageView(path: string) {
  if (typeof window === "undefined" || !/^G-[A-Z0-9]+$/i.test(GA_MEASUREMENT_ID)) return;
  if (!initGoogleAnalytics()) return;

  if (lastPath === path) return;
  lastPath = path;

  // Do not send account/form query strings or fragments to Analytics.
  window.gtag?.("event", "page_view", {
    send_to: GA_MEASUREMENT_ID,
    page_path: path,
    page_location: `${window.location.origin}${path}`,
  });
}

/** GA4 Ecommerce: Product Detail Page (PDP) view */
export function trackGoogleViewItem(p: {
  variantId: string;
  name: string;
  price: number;
  currency?: string;
  category?: string;
}) {
  if (typeof window === "undefined" || !initGoogleAnalytics()) return;
  window.gtag?.("event", "view_item", {
    send_to: GA_MEASUREMENT_ID,
    currency: p.currency ?? "INR",
    value: p.price,
    items: [
      {
        item_id: numericId(p.variantId),
        item_name: p.name,
        price: p.price,
        item_category: p.category,
        quantity: 1,
      },
    ],
  });
}

/** GA4 Ecommerce: Product catalogue / collection list view */
export function trackGoogleViewItemList(p: {
  listName: string;
  items: Array<{
    id: string;
    name: string;
    price: number;
    currency?: string;
    category?: string;
    index?: number;
  }>;
}) {
  if (typeof window === "undefined" || !p.items.length || !initGoogleAnalytics()) return;
  window.gtag?.("event", "view_item_list", {
    send_to: GA_MEASUREMENT_ID,
    item_list_name: p.listName,
    items: p.items.slice(0, 30).map((item, idx) => ({
      item_id: numericId(item.id),
      item_name: item.name,
      price: item.price,
      item_category: item.category,
      index: item.index ?? idx + 1,
    })),
  });
}

/** GA4 Ecommerce: Search query */
export function trackGoogleSearch(searchTerm: string) {
  if (typeof window === "undefined" || !searchTerm.trim() || !initGoogleAnalytics()) return;
  window.gtag?.("event", "search", {
    send_to: GA_MEASUREMENT_ID,
    search_term: searchTerm.trim(),
  });
}

/** GA4 Ecommerce: Add item to bag */
export function trackGoogleAddToCart(p: {
  variantId: string;
  name: string;
  price: number;
  currency?: string;
  quantity: number;
  category?: string;
}) {
  if (typeof window === "undefined" || !initGoogleAnalytics()) return;
  window.gtag?.("event", "add_to_cart", {
    send_to: GA_MEASUREMENT_ID,
    currency: p.currency ?? "INR",
    value: p.price * p.quantity,
    items: [
      {
        item_id: numericId(p.variantId),
        item_name: p.name,
        price: p.price,
        quantity: p.quantity,
        item_category: p.category,
      },
    ],
  });
}

/** GA4 Ecommerce: Remove item from bag */
export function trackGoogleRemoveFromCart(p: {
  variantId: string;
  name: string;
  price: number;
  currency?: string;
  quantity: number;
}) {
  if (typeof window === "undefined" || !initGoogleAnalytics()) return;
  window.gtag?.("event", "remove_from_cart", {
    send_to: GA_MEASUREMENT_ID,
    currency: p.currency ?? "INR",
    value: p.price * p.quantity,
    items: [
      {
        item_id: numericId(p.variantId),
        item_name: p.name,
        price: p.price,
        quantity: p.quantity,
      },
    ],
  });
}

/** GA4 Ecommerce: View bag / cart drawer */
export function trackGoogleViewCart(p: {
  items: Array<{
    variantId: string;
    name: string;
    price: number;
    currency?: string;
    quantity: number;
  }>;
  value?: number;
  currency?: string;
}) {
  if (typeof window === "undefined" || !p.items.length || !initGoogleAnalytics()) return;
  const total = p.value ?? p.items.reduce((s, i) => s + i.price * i.quantity, 0);
  window.gtag?.("event", "view_cart", {
    send_to: GA_MEASUREMENT_ID,
    currency: p.currency ?? "INR",
    value: total,
    items: p.items.map((i) => ({
      item_id: numericId(i.variantId),
      item_name: i.name,
      price: i.price,
      quantity: i.quantity,
    })),
  });
}

/** GA4 Ecommerce: Checkout initiation (Buy Now or Proceed to Checkout) */
export function trackGoogleBeginCheckout(p: {
  items: Array<{
    variantId: string;
    name?: string;
    quantity: number;
    price: { amount: string; currencyCode: string } | number;
  }>;
  value?: number;
  currency?: string;
}) {
  if (typeof window === "undefined" || !p.items.length || !initGoogleAnalytics()) return;

  const getItemPrice = (price: { amount: string; currencyCode: string } | number): number =>
    typeof price === "number" ? price : parseFloat(price.amount) || 0;

  const total =
    p.value ??
    p.items.reduce((s, i) => s + getItemPrice(i.price) * i.quantity, 0);

  const firstPrice = p.items[0]?.price;
  const inferredCurrency =
    typeof firstPrice === "object" && firstPrice?.currencyCode
      ? firstPrice.currencyCode
      : "INR";

  window.gtag?.("event", "begin_checkout", {
    send_to: GA_MEASUREMENT_ID,
    currency: p.currency ?? inferredCurrency,
    value: total,
    items: p.items.map((i) => ({
      item_id: numericId(i.variantId),
      item_name: i.name ?? "Product",
      price: getItemPrice(i.price),
      quantity: i.quantity,
    })),
  });
}

/** GA4 Ecommerce: Verified completed purchase */
export function trackGooglePurchase(p: {
  transactionId: string;
  value: number;
  currency?: string;
  tax?: number;
  shipping?: number;
  items: Array<{
    variantId: string;
    name: string;
    price: number;
    quantity: number;
  }>;
}) {
  if (typeof window === "undefined" || !p.transactionId || !initGoogleAnalytics()) return;
  window.gtag?.("event", "purchase", {
    send_to: GA_MEASUREMENT_ID,
    transaction_id: p.transactionId,
    value: p.value,
    currency: p.currency ?? "INR",
    tax: p.tax ?? 0,
    shipping: p.shipping ?? 0,
    items: p.items.map((i) => ({
      item_id: numericId(i.variantId),
      item_name: i.name,
      price: i.price,
      quantity: i.quantity,
    })),
  });
}