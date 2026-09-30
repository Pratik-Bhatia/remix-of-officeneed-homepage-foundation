/**
 * Central Meta (Facebook) tracking utility.
 *
 * Every event goes out twice with the SAME event_id:
 *   1. browser Pixel: fbq('track', name, data, { eventID })
 *   2. server Conversions API via sendMetaCapiEvent (token stays server-side)
 * Meta deduplicates on event_name + event_id.
 */
import { sendMetaCapiEvent } from "@/lib/meta-capi.functions";

export const META_PIXEL_ID: string = import.meta.env["VITE_META_PIXEL_ID"] ?? "";

type Fbq = ((...args: unknown[]) => void) & { callMethod?: unknown; queue?: unknown[] };
declare global {
  interface Window {
    fbq?: Fbq;
    _fbq?: Fbq;
  }
}

let initialized = false;
let lastPageView: string | null = null;

/** Loads fbevents.js and calls fbq('init') exactly once. No PageView here. */
export function initMetaPixel() {
  if (typeof window === "undefined" || initialized || !META_PIXEL_ID) return;
  initialized = true;
  if (!window.fbq) {
    /* Official Meta base code, minus its automatic PageView. */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const n: any = function (...args: unknown[]) {
      // eslint-disable-next-line prefer-spread
      n.callMethod ? n.callMethod.apply(n, args) : n.queue.push(args);
    };
    window.fbq = n;
    if (!window._fbq) window._fbq = n;
    n.push = n;
    n.loaded = true;
    n.version = "2.0";
    n.queue = [];
    const t = document.createElement("script");
    t.async = true;
    t.src = "https://connect.facebook.net/en_US/fbevents.js";
    const s = document.getElementsByTagName("script")[0];
    s?.parentNode ? s.parentNode.insertBefore(t, s) : document.head.appendChild(t);
  }
  window.fbq!("init", META_PIXEL_ID);
}

function newEventId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export interface MetaUserData {
  email?: string;
  phone?: string;
}

export function trackEvent(
  name: string,
  data: Record<string, unknown> = {},
  user: MetaUserData = {},
): string | undefined {
  if (typeof window === "undefined" || !META_PIXEL_ID) return;
  initMetaPixel();
  const eventId = newEventId();
  try {
    window.fbq?.("track", name, data, { eventID: eventId });
  } catch {
    /* never break the page */
  }
  sendMetaCapiEvent({
    data: {
      eventName: name,
      eventId,
      eventSourceUrl: window.location.href,
      customData: data,
      email: user.email,
      phone: user.phone,
    },
  }).catch(() => {});
  return eventId;
}

/** One PageView per distinct URL; repeat calls for the same URL are ignored. */
export function trackPageView(href: string) {
  if (href === lastPageView) return;
  lastPageView = href;
  trackEvent("PageView");
}

// Helpers -------------------------------------------------------------------
const numericId = (gid: string) => gid.split("/").pop() ?? gid;

export function trackViewContent(p: { variantId: string; name: string; price: number; currency: string; category?: string }) {
  trackEvent("ViewContent", {
    content_ids: [numericId(p.variantId)],
    content_name: p.name,
    content_type: "product",
    content_category: p.category,
    value: p.price,
    currency: p.currency,
  });
}

export function trackSearch(query: string) {
  trackEvent("Search", { search_string: query });
}

export function trackAddToCart(p: { variantId: string; name: string; price: number; currency: string; quantity: number }) {
  trackEvent("AddToCart", {
    content_ids: [numericId(p.variantId)],
    content_name: p.name,
    content_type: "product",
    contents: [{ id: numericId(p.variantId), quantity: p.quantity }],
    value: p.price * p.quantity,
    currency: p.currency,
  });
}

export function trackInitiateCheckout(
  items: Array<{ variantId: string; quantity: number; price: { amount: string; currencyCode: string } }>,
  value?: number,
) {
  if (!items.length) return;
  const total = value ?? items.reduce((s, i) => s + parseFloat(i.price.amount) * i.quantity, 0);
  trackEvent("InitiateCheckout", {
    content_ids: items.map((i) => numericId(i.variantId)),
    contents: items.map((i) => ({ id: numericId(i.variantId), quantity: i.quantity })),
    content_type: "product",
    num_items: items.reduce((s, i) => s + i.quantity, 0),
    value: total,
    currency: items[0]?.price.currencyCode ?? "INR",
  });
}

export function trackLead(source: string, user: MetaUserData, extra: Record<string, unknown> = {}) {
  trackEvent("Lead", { content_category: source, ...extra }, user);
}
