// Shiplystic shipment tracking for the on-site "Track your order" page.
// Looks a shipment up by Order ID, AWB, or tracking number -- the customer
// stays on officeneed.store the whole time, never redirected to
// Shiplystic or the courier.
//
// No sign-in / email-phone verification is required to look a shipment
// up: confirmed with the store owner that /track-multiple's response
// carries no customer PII (no name/phone/email/address), only shipment/
// operational data (status, courier, city-level location, event
// history) -- so this is intentionally not gated behind identity
// verification. It IS rate-limited server-side (see RATE_LIMIT_* below),
// and the upstream bearer token never reaches the browser.
//
// ---- Required environment variables (server-only; read inside the
//      handler, never logged, never returned to the browser) ----
//   SHIPLYSTIC_BASE_URL   e.g. https://app.shiplystic.com
//   SHIPLYSTIC_API_TOKEN  Shiplystic bearer JWT -- NEVER log, echo, or commit this.
import { createServerFn } from "@tanstack/react-start";
import { getRequestIP, getRequestHeader } from "@tanstack/react-start/server";

export interface ShiplysticTrackingEvent {
  status?: string | null;
  subStatus?: string | null;
  location?: string | null;
  city?: string | null;
  state?: string | null;
  eventTime?: string | null; // raw upstream string, unparsed here
  message?: string | null;
}

export interface ShiplysticShipment {
  orderId?: string | null;
  enteredOrderId?: string | null;
  awb?: string | null;
  waybill?: string | null;
  trackingNumber?: string | null;
  courier?: string | null;
  orderStatus?: string | null;
  currentStatus?: string | null;
  currentLocation?: string | null;
  pickupCity?: string | null;
  deliveryCity?: string | null;
  events: ShiplysticTrackingEvent[]; // always an array, possibly empty
}

export type TrackingOutcome =
  | { state: "found"; query: string; shipment: ShiplysticShipment }
  | { state: "not_found"; query: string }
  | { state: "invalid_input"; reason: "empty" | "too_long" | "invalid_characters" }
  | { state: "rate_limited" }
  | { state: "not_configured" }
  | { state: "timeout" }
  | { state: "upstream_error"; status?: number }
  | { state: "network_error" }
  | { state: "malformed_response" };

// AWB/tracking numbers and Shopify-style order IDs (e.g. "#OFN1234") are
// alphanumeric plus a few symbols -- not an exhaustive courier-format
// spec, just a safe, generous allow-list.
const IDENTIFIER_PATTERN = /^[A-Za-z0-9#\-_/]+$/;
const MAX_IDENTIFIER_LENGTH = 64;

export function parseIdentifier(
  raw: unknown,
): { ok: true; value: string } | { ok: false; reason: "empty" | "too_long" | "invalid_characters" } {
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  if (!trimmed) return { ok: false, reason: "empty" };
  if (trimmed.length > MAX_IDENTIFIER_LENGTH) return { ok: false, reason: "too_long" };
  if (!IDENTIFIER_PATTERN.test(trimmed)) return { ok: false, reason: "invalid_characters" };
  return { ok: true, value: trimmed };
}

// Matches Shiplystic's documented 30 requests / 60 seconds limit. Same
// in-memory-Map shape as image-processing.functions.ts's checkRateLimit --
// resets on cold start, not shared across isolates; a cheap first line of
// defense, nothing more (same known limitation as every other in-memory
// limiter in this codebase). `now` is an injectable parameter so tests
// never depend on real timers.
const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW = 60_000;
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

export function checkShiplysticRateLimit(key: string, now: number = Date.now()): boolean {
  const record = rateLimitMap.get(key);
  if (!record || now > record.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return true;
  }
  if (record.count >= RATE_LIMIT_MAX) return false;
  record.count += 1;
  return true;
}

function toStringOrNull(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function normalizeEvent(raw: unknown): ShiplysticTrackingEvent {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    status: toStringOrNull(r["status"] ?? r["Status"]),
    subStatus: toStringOrNull(r["subStatus"] ?? r["SubStatus"]),
    location: toStringOrNull(r["location"] ?? r["Location"]),
    city: toStringOrNull(r["city"] ?? r["City"]),
    state: toStringOrNull(r["state"] ?? r["State"]),
    eventTime: toStringOrNull(r["eventTime"] ?? r["EventTime"]),
    message: toStringOrNull(r["message"] ?? r["Message"]),
  };
}

function normalizeShipment(raw: unknown): ShiplysticShipment {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const rawEvents = r["trackingEvents"] ?? r["TrackingEvents"] ?? r["events"] ?? r["Events"];
  return {
    orderId: toStringOrNull(r["OrderId"] ?? r["orderId"]),
    enteredOrderId: toStringOrNull(r["EnteredOrderId"] ?? r["enteredOrderId"]),
    awb: toStringOrNull(r["AWB"] ?? r["AirwayBillNo"]),
    waybill: toStringOrNull(r["Waybill"] ?? r["waybill"]),
    trackingNumber: toStringOrNull(r["TrackingNumber"] ?? r["trackingNumber"]),
    courier: toStringOrNull(r["Courier"] ?? r["courier"]),
    orderStatus: toStringOrNull(r["OrderStatus"] ?? r["orderStatus"]),
    currentStatus: toStringOrNull(r["CurrentStatus"] ?? r["currentStatus"]),
    currentLocation: toStringOrNull(r["CurrentLocation"] ?? r["currentLocation"]),
    pickupCity: toStringOrNull(r["PickupCity"] ?? r["pickupCity"]),
    deliveryCity: toStringOrNull(r["DeliveryCity"] ?? r["deliveryCity"]),
    events: Array.isArray(rawEvents) ? rawEvents.map(normalizeEvent) : [],
  };
}

// Deliberately never reads notFound/notFoundCount/success/foundCount --
// Shiplystic's documented response calculates `notFound` in a way that
// does NOT account for EnteredOrderId matches, so trusting it would
// wrongly report a real Order-ID match as "not found". "Found" is decided
// purely by inspecting `results` directly, matching the identifying
// fields this exact identifier was searched against.
function resultMatchesQuery(result: unknown, query: string): boolean {
  const r = result && typeof result === "object" ? (result as Record<string, unknown>) : {};
  const q = query.trim().toLowerCase();
  const candidates = [r["Waybill"], r["AirwayBillNo"], r["TrackingNumber"], r["EnteredOrderId"], r["OrderId"]].filter(
    (v): v is string => typeof v === "string" && v.length > 0,
  );
  // An entry with none of the identifying fields at all is malformed, not
  // informative -- don't let that silently masquerade as "not found" when
  // Shiplystic put it in `results` in the first place.
  if (candidates.length === 0) return true;
  return candidates.some((c) => c.trim().toLowerCase() === q);
}

/** The plain, directly-testable core -- no createServerFn runtime needed.
 * Never throws; every failure mode is a typed TrackingOutcome, and no
 * raw upstream body/message/stack ever leaves this function. */
export async function trackShipment(
  identifier: string,
  deps: { baseUrl: string; token: string; fetchImpl?: typeof fetch; timeoutMs?: number },
): Promise<TrackingOutcome> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? 9000);
  try {
    const response = await fetchImpl(`${deps.baseUrl}/track-multiple`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${deps.token}` },
      body: JSON.stringify({ AwbNumbers: [identifier] }),
      signal: controller.signal,
    });
    if (!response.ok) return { state: "upstream_error", status: response.status };

    let json: unknown;
    try {
      json = await response.json();
    } catch {
      return { state: "malformed_response" };
    }
    const results = Array.isArray((json as Record<string, unknown> | null)?.["results"])
      ? ((json as Record<string, unknown>)["results"] as unknown[])
      : [];
    const matched = results.find((r) => resultMatchesQuery(r, identifier));
    if (!matched) return { state: "not_found", query: identifier };
    return { state: "found", query: identifier, shipment: normalizeShipment(matched) };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") return { state: "timeout" };
    return { state: "network_error" };
  } finally {
    clearTimeout(timer);
  }
}

/** Newest-first by valid, parseable eventTime; events with no valid
 * timestamp are kept (never dropped) and appended after the sorted ones. */
export function sortTrackingEvents(events: ShiplysticTrackingEvent[]): ShiplysticTrackingEvent[] {
  const timed: { e: ShiplysticTrackingEvent; t: number }[] = [];
  const untimed: ShiplysticTrackingEvent[] = [];
  for (const e of events) {
    const t = e.eventTime ? Date.parse(e.eventTime) : NaN;
    if (Number.isNaN(t)) untimed.push(e);
    else timed.push({ e, t });
  }
  timed.sort((a, b) => b.t - a.t);
  return [...timed.map((x) => x.e), ...untimed];
}

export const trackOrder = createServerFn({ method: "POST" })
  .inputValidator((input: { identifier: string }) => {
    if (typeof input?.identifier !== "string") throw new Error("Missing identifier.");
    return input;
  })
  .handler(async ({ data }): Promise<TrackingOutcome> => {
    const parsed = parseIdentifier(data.identifier);
    if (!parsed.ok) return { state: "invalid_input", reason: parsed.reason };

    const ip = getRequestIP() || getRequestHeader("x-forwarded-for") || "unknown";
    if (!checkShiplysticRateLimit(ip)) return { state: "rate_limited" };

    const baseUrl = process.env["SHIPLYSTIC_BASE_URL"];
    const token = process.env["SHIPLYSTIC_API_TOKEN"];
    if (!baseUrl || !token) return { state: "not_configured" };

    return trackShipment(parsed.value, { baseUrl, token });
  });
