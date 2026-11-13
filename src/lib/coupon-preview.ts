/**
 * Interprets Shopify's own answer for "what does this discount code do to this
 * one product line?" -- never computes a discount itself. Shopify's Storefront
 * API can only validate a code against a cart, so the caller builds a
 * throwaway cart (cartCreate with the line + code) and passes the result here.
 *
 * Shopify reports a single boolean per code (`applicable`); it does NOT say
 * whether a non-applicable code is invalid, expired, used up, below a minimum
 * order, or just not covering this product -- so neither can this.
 */
export type CouponPreview =
  | {
      status: "applied";
      code: string;
      currencyCode: string;
      quantity: number;
      /** Line total before the discount, as calculated by Shopify. */
      originalTotal: number;
      /** Line total after the discount, as calculated by Shopify. */
      discountedTotal: number;
      savings: number;
    }
  | { status: "not-applicable"; code: string }
  | { status: "error"; message: string };

type Money = { amount: string; currencyCode?: string } | null | undefined;
export interface PreviewCartPayload {
  cart?: {
    discountCodes?: Array<{ code: string; applicable: boolean }> | null;
    lines?: { edges?: Array<{ node: { quantity: number; cost?: { subtotalAmount?: Money; totalAmount?: Money } } }> } | null;
  } | null;
  userErrors?: Array<{ message?: string; code?: string }> | null;
}

const num = (m: Money): number => (m ? parseFloat(m.amount) : NaN);

export function interpretPreviewCart(payload: PreviewCartPayload | null | undefined, code: string): CouponPreview {
  const errors = payload?.userErrors ?? [];
  if (errors.length > 0) {
    return { status: "error", message: errors[0]?.message || "This code couldn't be checked for this item." };
  }
  const cart = payload?.cart;
  if (!cart) return { status: "error", message: "This code couldn't be checked right now. Please try again." };

  const entry = (cart.discountCodes ?? []).find((d) => d.code.toUpperCase() === code.toUpperCase());
  if (!entry?.applicable) return { status: "not-applicable", code };

  const line = cart.lines?.edges?.[0]?.node;
  const original = num(line?.cost?.subtotalAmount);
  const discounted = num(line?.cost?.totalAmount);
  if (!line || !Number.isFinite(original) || !Number.isFinite(discounted)) {
    return { status: "error", message: "The code was accepted but the price couldn't be shown. Check the discount at checkout." };
  }
  const savings = Math.round((original - discounted) * 100) / 100;
  // "Applicable" with nothing actually taken off this line is not an applied discount.
  if (savings <= 0) return { status: "not-applicable", code };
  return {
    status: "applied",
    code,
    currencyCode: line.cost?.totalAmount?.currencyCode ?? line.cost?.subtotalAmount?.currencyCode ?? "INR",
    quantity: line.quantity,
    originalTotal: original,
    discountedTotal: discounted,
    savings,
  };
}

// ---------------------------------------------------------------------------
// Whole-cart / multi-line previews (cart coupon offer)
// ---------------------------------------------------------------------------
//
// Same principle as above: Shopify's own answer, read from a throwaway
// preview cart -- per line, which code discounted it and by how much
// (CartLine.discountAllocations / CartCodeDiscountAllocation.code). Nothing
// here computes a discount; it only reads and sums Shopify's amounts.

export interface PreviewLine {
  variantId: string;
  quantity: number;
}

export interface CodesPreviewLine {
  variantId: string;
  /** Shopify's discountedAmount per code on this line (numbers > 0 only). */
  discounts: Array<{ code: string; amount: number }>;
}

export type CodesPreview =
  | {
      status: "ok";
      codes: Array<{ code: string; applicable: boolean }>;
      lines: CodesPreviewLine[];
      currencyCode: string;
    }
  | { status: "error"; message: string };

export interface CodesPreviewPayload {
  cart?: {
    discountCodes?: Array<{ code: string; applicable: boolean }> | null;
    lines?: {
      edges?: Array<{
        node: {
          merchandise?: { id?: string | null } | null;
          cost?: { subtotalAmount?: Money; totalAmount?: Money } | null;
          discountAllocations?: Array<{ code?: string | null; discountedAmount?: Money }> | null;
        };
      }> | null;
    } | null;
  } | null;
  userErrors?: Array<{ message?: string; code?: string }> | null;
}

export function interpretCodesPreview(payload: CodesPreviewPayload | null | undefined): CodesPreview {
  const errors = payload?.userErrors ?? [];
  if (errors.length > 0) return { status: "error", message: errors[0]?.message || "This offer couldn't be checked." };
  const cart = payload?.cart;
  if (!cart) return { status: "error", message: "This offer couldn't be checked right now." };
  let currencyCode = "INR";
  const lines: CodesPreviewLine[] = [];
  for (const edge of cart.lines?.edges ?? []) {
    const node = edge?.node;
    const variantId = node?.merchandise?.id;
    if (!variantId) continue;
    const discounts: CodesPreviewLine["discounts"] = [];
    for (const a of node.discountAllocations ?? []) {
      const amount = num(a?.discountedAmount);
      if (!a?.code || !Number.isFinite(amount) || amount <= 0) continue;
      if (a.discountedAmount?.currencyCode) currencyCode = a.discountedAmount.currencyCode;
      discounts.push({ code: a.code, amount });
    }
    if (node.cost?.totalAmount?.currencyCode) currencyCode = node.cost.totalAmount.currencyCode;
    lines.push({ variantId, discounts });
  }
  return { status: "ok", codes: cart.discountCodes ?? [], lines, currencyCode };
}

const sameCode = (a: string, b: string) => a.toUpperCase() === b.toUpperCase();

/** Total Shopify-allocated savings for one code across a preview. */
export function savingsForCode(preview: Extract<CodesPreview, { status: "ok" }>, code: string): number {
  let total = 0;
  for (const line of preview.lines) for (const d of line.discounts) if (sameCode(d.code, code)) total += d.amount;
  return Math.round(total * 100) / 100;
}

/** Whether Shopify reported this code applicable on the preview cart. */
export function isCodeApplicable(preview: Extract<CodesPreview, { status: "ok" }>, code: string): boolean {
  return preview.codes.some((c) => sameCode(c.code, code) && c.applicable);
}

/** Variant ids whose line Shopify actually discounted with this code. */
export function discountedVariants(preview: Extract<CodesPreview, { status: "ok" }>, code: string): Set<string> {
  const out = new Set<string>();
  for (const line of preview.lines) if (line.discounts.some((d) => sameCode(d.code, code))) out.add(line.variantId);
  return out;
}

export type CodesPreviewFetcher = (codes: string[], lines: PreviewLine[]) => Promise<CodesPreview>;

// ---------------------------------------------------------------------------
// Caches -- keep Shopify preview calls to a minimum.
//
// Eligibility of a collection-based percentage code with no minimum purchase
// belongs to the PRODUCT, not to the quantity or the rest of the cart, so it
// is cached per variant: quantity changes, removals and re-opening the cart
// never trigger a new preview -- only a never-seen variant does, and all of
// them are batched into ONE preview cart per code. `scope` identifies the
// buyer (guest / customer / B2B company location), since Shopify's answer
// can differ per buyer (B2B catalogs, once-per-customer limits); a scope
// change starts from an empty cache.
// ---------------------------------------------------------------------------

// Short enough that a discount disabled in Shopify stops being advertised
// quickly; Shopify re-validates on Apply regardless.
export const ELIGIBILITY_TTL_MS = 5 * 60 * 1000;
const SAVINGS_TTL_MS = 5 * 60 * 1000;
const STORAGE_KEY = "officeneed-coupon-eligibility";

type Timed<T> = { value: T; at: number };
const eligibilityCache = new Map<string, Timed<boolean>>();
const savingsCache = new Map<string, Timed<SavingsResult>>();
const inflight = new Map<string, Promise<unknown>>();
let cacheScope: string | null = null;
let hydrated = false;

function hydrate() {
  if (hydrated || typeof sessionStorage === "undefined") return;
  hydrated = true;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as { scope?: string; entries?: Array<[string, Timed<boolean>]> };
    if (!parsed?.scope || !Array.isArray(parsed.entries)) return;
    cacheScope = parsed.scope;
    const now = Date.now();
    for (const [k, v] of parsed.entries) if (v && now - v.at < ELIGIBILITY_TTL_MS) eligibilityCache.set(k, v);
  } catch {
    // unreadable storage -- start empty
  }
}

function persist() {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ scope: cacheScope, entries: [...eligibilityCache.entries()] }));
  } catch {
    // storage full/blocked -- the in-memory cache still works
  }
}

/** Drops every cached answer when the buyer identity changes. */
function enterScope(scope: string) {
  hydrate();
  if (cacheScope === scope) return;
  cacheScope = scope;
  eligibilityCache.clear();
  savingsCache.clear();
  inflight.clear();
  persist();
}

/** Test/maintenance hook: forget everything. */
export function resetCouponPreviewCache() {
  eligibilityCache.clear();
  savingsCache.clear();
  inflight.clear();
  cacheScope = null;
  hydrated = true;
  if (typeof sessionStorage !== "undefined") {
    try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  }
}

const eligKey = (code: string, variantId: string) => `${code.toUpperCase()}|${variantId}`;

/**
 * Per-variant eligibility for one code: variantId -> true/false, or absent
 * when Shopify couldn't be asked (fail closed: callers treat absent as "don't
 * advertise"). Only variants not already cached are sent to Shopify, in one
 * batch. Lines should carry the cart's real quantities so B2B quantity rules
 * accept the preview.
 */
export async function resolveEligibility(
  code: string,
  scope: string,
  lines: PreviewLine[],
  fetcher: CodesPreviewFetcher,
): Promise<Map<string, boolean>> {
  enterScope(scope);
  const result = new Map<string, boolean>();
  const now = Date.now();
  const missing: PreviewLine[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    if (seen.has(line.variantId)) continue;
    seen.add(line.variantId);
    const hit = eligibilityCache.get(eligKey(code, line.variantId));
    if (hit && now - hit.at < ELIGIBILITY_TTL_MS) result.set(line.variantId, hit.value);
    else missing.push(line);
  }
  if (missing.length === 0) return result;

  const batchKey = `elig|${scope}|${code.toUpperCase()}|${missing.map((l) => l.variantId).sort().join(",")}`;
  let pending = inflight.get(batchKey) as Promise<CodesPreview> | undefined;
  if (!pending) {
    pending = fetcher([code], missing);
    inflight.set(batchKey, pending);
  }
  let preview: CodesPreview;
  try {
    preview = await pending;
  } catch {
    preview = { status: "error", message: "preview failed" };
  } finally {
    inflight.delete(batchKey);
  }
  if (preview.status !== "ok" || cacheScope !== scope) return result; // fail closed, never cache an error
  const discounted = discountedVariants(preview, code);
  const returned = new Set(preview.lines.map((l) => l.variantId));
  const at = Date.now();
  for (const line of missing) {
    if (!returned.has(line.variantId)) continue; // Shopify dropped the line (unavailable) -- unknown, not "ineligible"
    const eligible = discounted.has(line.variantId);
    eligibilityCache.set(eligKey(code, line.variantId), { value: eligible, at });
    result.set(line.variantId, eligible);
  }
  persist();
  return result;
}

export type SavingsResult =
  | { status: "ok"; applicable: boolean; savings: number; discountedLineCount: number; currencyCode: string }
  | { status: "error"; message: string };

const signature = (lines: PreviewLine[]) =>
  lines.map((l) => `${l.variantId}:${l.quantity}`).sort().join(",");

/**
 * Shopify-calculated savings of ONE code applied alone to the whole cart (real
 * quantities). Used only where a figure is needed before applying -- comparing
 * two offers, or the replace-confirmation -- and cached by the exact cart
 * contents, so it is not repeated unless the cart changes.
 */
export async function resolveSavings(
  code: string,
  scope: string,
  lines: PreviewLine[],
  fetcher: CodesPreviewFetcher,
): Promise<SavingsResult> {
  enterScope(scope);
  const key = `${code.toUpperCase()}|${signature(lines)}`;
  const hit = savingsCache.get(key);
  if (hit && Date.now() - hit.at < SAVINGS_TTL_MS) return hit.value;
  const flightKey = `sav|${scope}|${key}`;
  let pending = inflight.get(flightKey) as Promise<CodesPreview> | undefined;
  if (!pending) {
    pending = fetcher([code], lines);
    inflight.set(flightKey, pending);
  }
  let preview: CodesPreview;
  try {
    preview = await pending;
  } catch {
    preview = { status: "error", message: "preview failed" };
  } finally {
    inflight.delete(flightKey);
  }
  if (preview.status !== "ok") return { status: "error", message: preview.message };
  // The same Shopify answer also tells us which products this code covers:
  // seed the per-variant eligibility cache, so the offer card needs no
  // separate eligibility preview for these products.
  if (cacheScope === scope) {
    const covered = discountedVariants(preview, code);
    const at = Date.now();
    for (const line of preview.lines) eligibilityCache.set(eligKey(code, line.variantId), { value: covered.has(line.variantId), at });
    persist();
  }
  const savings = savingsForCode(preview, code);
  const value: SavingsResult = {
    status: "ok",
    applicable: isCodeApplicable(preview, code) && savings > 0,
    savings,
    discountedLineCount: discountedVariants(preview, code).size,
    currencyCode: preview.currencyCode,
  };
  if (cacheScope === scope) savingsCache.set(key, { value, at: Date.now() });
  return value;
}
