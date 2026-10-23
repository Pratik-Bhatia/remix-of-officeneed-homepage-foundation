import { haptic } from "@/lib/haptics";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { toast } from "sonner";
import { storefrontApiRequest, type ShopifyProduct, type ShopifyProductNode, type ShopifyImage } from "@/lib/shopify";
import { getCustomerToken } from "@/lib/customer";
import { useB2BStore, getEffectiveCompanyLocationId } from "@/stores/b2bStore";
import { appendAttribution, getAttribution } from "@/lib/attribution";
import { getCustomerCart, saveCustomerCart } from "@/lib/customer-cart.functions";
import { trackAddToCart } from "@/lib/meta-pixel";
import { getPromotionCodeToCarry } from "@/config/promotions";
import { useCouponStore } from "@/stores/couponStore";
import { interpretPreviewCart, type CouponPreview } from "@/lib/coupon-preview";
import { trackGoogleAddToCart, trackGoogleRemoveFromCart } from "@/lib/google-analytics";

export interface CartItem {
  lineId: string | null;
  product: ShopifyProduct;
  variantId: string;
  variantTitle: string;
  price: { amount: string; currencyCode: string };
  quantity: number;
  selectedOptions: Array<{ name: string; value: string }>;
  /** The exact variant the shopper selected when this line was added --
   * sourced from Shopify's own cart line (ProductVariant.image), never
   * guessed client-side. Falls back to the product's featured/first image
   * only when the variant itself has no image. See resolveLineImage().
   * Optional on input: addItem() always derives the real value from
   * Shopify's mutation response, so callers never need to supply it. */
  image?: ShopifyImage | null;
  /** Shopify cart line attributes (line-item properties) -- shown on the
   * order in Shopify Admin and included in the orders/paid webhook payload
   * (src/lib/shopify-order-webhook.server.ts reads them back). Used by
   * ProductCustomizer's Buy Now to carry logo/printing-method/placement
   * metadata through checkout onto the real order, wherever Shopify
   * supports it -- plain text key/value pairs only (no images). When
   * present, addItem() always adds a NEW line rather than merging into an
   * existing same-variant line, so a customized purchase's attributes are
   * never silently lost into a prior plain line's quantity bump. */
  lineAttributes?: Array<{ key: string; value: string }>;
}

/** Selected-variant image, falling back to the product's featured image,
 * then its first image -- never the reverse. This is the single place that
 * decides a cart line's thumbnail, so CartDrawer/cart.tsx/CartLineItem all
 * stay in sync by construction. */
function resolveLineImage(variantImage: ShopifyImage | null | undefined, productNode: ShopifyProductNode | undefined): ShopifyImage | null {
  return variantImage ?? productNode?.featuredImage ?? productNode?.images?.edges?.[0]?.node ?? null;
}

/** A quantity-rule field Shopify's own cart mutation just told us about,
 * for one specific variant -- see QuantityRuleOverrides below for why this
 * exists separately from ShopifyVariantNode.quantityRule. */
export type QuantityRuleOverride = { minimum?: number; increment?: number; maximum?: number | null };
/** `${variantId}::${scope}` -> whatever quantity-rule fields a cart
 * mutation has actually revealed for it (merged incrementally -- only the
 * field(s) a rejection disclosed, never a guess at the others). Keyed by
 * BOTH variant and buyer scope (see quantityRuleScopeKey) -- a rule a B2B
 * company-location buyer's mutation revealed must never be read back for
 * a B2C/anonymous buyer in the same browser tab (or a different company
 * location), since it may not apply to them at all. */
export type QuantityRuleOverrides = Record<string, QuantityRuleOverride>;

/** The buyer-scope half of a QuantityRuleOverrides key -- a B2B buyer's
 * own company location when they have one, "anon" otherwise (covers both
 * true anonymous shoppers and a signed-in B2C customer with no company,
 * since the B2C rule is the same plain Storefront-read one regardless).
 * Exported so React components (which read/display quantityRuleOverrides
 * from outside this store's own closure) can key their own lookups
 * identically to how corrections are recorded below. */
export function quantityRuleScopeKey(companyLocationId?: string | null): string {
  return companyLocationId || "anon";
}

function scopedVariantKey(variantId: string, companyLocationId?: string | null): string {
  return `${variantId}::${quantityRuleScopeKey(companyLocationId)}`;
}

/** Shopify's own configured minimum order quantity for this exact variant.
 *
 * CONFIRMED LIVE (this session, against this store's real H935 product):
 * ProductVariant.quantityRule, read via a plain product()/productVariant()
 * Storefront query -- with or without @inContext(country:), with or
 * without buyerIdentity.countryCode on a parallel cartCreate -- does NOT
 * reflect a catalog/segment-scoped override (H935's real configured
 * minimum of 25, confirmed via the Admin API's PriceList.quantityRules
 * entry for it). The cart mutation itself DOES enforce it: an actual
 * cartCreate at quantity 1 for H935 was rejected in production with
 * `MINIMUM_NOT_MET -- "This item has a minimum of 25."`, immediately after
 * our own read-based UI had shown/allowed quantity 1. That is this
 * session's root cause for "Add to Cart/Buy Now fails" -- not a bug in the
 * clamping arithmetic itself, which was already correct for whatever
 * number it was given.
 *
 * So the product-node snapshot's quantityRule is only a BASELINE (correct
 * for the common case -- confirmed true for every other product in a full
 * 250-rule catalogue sweep) -- `overrides` is Shopify's own, strictly more
 * authoritative answer once a real mutation has revealed it (see
 * extractQuantityRuleCorrection below), and always wins when present. */
function variantMinimumQuantity(item: Pick<CartItem, "product" | "variantId">, overrides: QuantityRuleOverrides, companyLocationId?: string | null): number {
  const override = overrides[scopedVariantKey(item.variantId, companyLocationId)]?.minimum;
  if (override) return override;
  const variantNode = item.product?.node?.variants?.edges?.find((e) => e.node.id === item.variantId)?.node;
  return variantNode?.quantityRule?.minimum || 1;
}

/** Shopify's own real answer, parsed from the exact UserError a rejected
 * cart mutation returned -- never a hardcoded per-product number, never a
 * blind guess. Only acts on the 3 error codes Shopify's own schema defines
 * for a quantity-rule violation (CartErrorCode: MINIMUM_NOT_MET,
 * MAXIMUM_EXCEEDED, INVALID_INCREMENT -- confirmed via this session's live
 * introspection of CartUserError/CartErrorCode); the actual number comes
 * from Shopify's own message text, since CartUserError has no separate
 * structured numeric field for it. */
function extractQuantityRuleCorrection(errors: UserError[]): { field: keyof QuantityRuleOverride; value: number } | null {
  for (const err of errors) {
    const code = (err.code ?? "").toUpperCase();
    if (code !== "MINIMUM_NOT_MET" && code !== "MAXIMUM_EXCEEDED" && code !== "INVALID_INCREMENT") continue;
    const match = err.message.match(/(\d+)/);
    if (!match?.[1]) continue;
    const value = Number.parseInt(match[1], 10);
    if (!Number.isFinite(value) || value <= 0) continue;
    if (code === "MINIMUM_NOT_MET") return { field: "minimum", value };
    if (code === "MAXIMUM_EXCEEDED") return { field: "maximum", value };
    return { field: "increment", value };
  }
  return null;
}

/** The quantity to retry a rejected mutation with, given what Shopify's
 * own error just revealed -- minimum/maximum are the exact number Shopify
 * will accept; increment means "must be a multiple of N", so round the
 * originally-requested quantity up to the nearest valid multiple instead
 * of overwriting it with N itself. */
function applyQuantityRuleCorrection(requestedQuantity: number, correction: { field: keyof QuantityRuleOverride; value: number }): number {
  if (correction.field === "minimum") return Math.max(requestedQuantity, correction.value);
  if (correction.field === "maximum") return Math.min(requestedQuantity, correction.value);
  return Math.max(correction.value, Math.ceil(requestedQuantity / correction.value) * correction.value);
}

/** Runs a quantity-bearing cart mutation via `run`, and if Shopify rejects
 * it with a quantity-rule violation, records what Shopify just revealed
 * and retries EXACTLY ONCE with the corrected quantity -- never more than
 * once, so a mutation can never loop even if Shopify's own number were
 * somehow still rejected. `run` is handed the quantity to actually send on
 * that attempt; it owns building that mutation's own line input shape
 * (cartCreate/cartLinesAdd/cartLinesUpdate all differ). Returns the final
 * response payload (success, or still failing after the one retry) and
 * the quantity that attempt actually used. */
async function runWithQuantityRuleRetry<T extends { userErrors?: UserError[] | null }>(
  variantId: string,
  requestedQuantity: number,
  run: (quantity: number) => Promise<T>,
  recordCorrection: (variantId: string, correction: { field: keyof QuantityRuleOverride; value: number }) => void,
): Promise<{ payload: T; quantity: number }> {
  let quantity = requestedQuantity;
  let payload = await run(quantity);
  const correction = extractQuantityRuleCorrection(payload.userErrors ?? []);
  if (correction) {
    recordCorrection(variantId, correction);
    const corrected = applyQuantityRuleCorrection(quantity, correction);
    if (corrected !== quantity) {
      quantity = corrected;
      payload = await run(quantity);
      // Tell the shopper WHY their quantity changed, same honesty as the
      // existing stock-adjustment message below -- only once the retry
      // actually succeeded (no point surfacing an internal retry attempt
      // that still failed; reportProblems' own toast covers that case).
      if (!extractQuantityRuleCorrection(payload.userErrors ?? [])) {
        const label = correction.field === "maximum" ? "maximum" : correction.field === "increment" ? "quantity increment" : "minimum order quantity";
        toast.warning(`This item's ${label} is ${correction.value}. Your quantity has been updated.`);
      }
    }
  }
  return { payload, quantity };
}

export interface CartDiscountCode {
  code: string;
  applicable: boolean;
}

export interface CartCost {
  subtotal: { amount: string; currencyCode: string } | null;
  total: { amount: string; currencyCode: string } | null;
}

/** A delivery address set on the cart for this order only (via
 * cartDeliveryAddressesReplace) -- independent of the B2B Company
 * Location's registered business address, which this never reads from or
 * writes to. Shown to both B2B and B2C signed-in shoppers. See
 * DeliveryAddressSelector.tsx for the UI that collects this. */
export interface CartDeliveryAddress {
  firstName: string | null;
  lastName: string | null;
  address1: string | null;
  address2: string | null;
  city: string | null;
  provinceCode: string | null;
  zip: string | null;
  phone: string | null;
}

export interface DeliveryAddressInput {
  firstName: string;
  lastName: string;
  address1: string;
  address2?: string;
  city: string;
  province: string;
  zip: string;
  phone?: string;
}

const DELIVERY_FIELDS = `
  delivery {
    addresses {
      selected
      oneTimeUse
      address {
        __typename
        ... on CartDeliveryAddress {
          firstName
          lastName
          address1
          address2
          city
          provinceCode
          zip
          phone
        }
      }
    }
  }
`;

const FULL_CART_FIELDS = `
  id
  checkoutUrl
  totalQuantity
  discountCodes { code applicable }
  cost {
    subtotalAmount { amount currencyCode }
    totalAmount { amount currencyCode }
  }
  buyerIdentity {
    purchasingCompany {
      company { id }
      location { id }
    }
  }
  ${DELIVERY_FIELDS}
  lines(first: 100) {
    edges {
      node {
        id
        quantity
        merchandise {
          ... on ProductVariant {
            id
            image { url altText }
          }
        }
      }
    }
  }
`;

const MUTATION_RESULT = `
  cart { ${FULL_CART_FIELDS} }
  userErrors { field message code }
  warnings { code message target }
`;

const CART_QUERY = `
  query cart($id: ID!) {
    cart(id: $id) {
      ${FULL_CART_FIELDS}
    }
  }
`;

const CART_CREATE_MUTATION = `
  mutation cartCreate($input: CartInput!) {
    cartCreate(input: $input) { ${MUTATION_RESULT} }
  }
`;

const CART_LINES_ADD_MUTATION = `
  mutation cartLinesAdd($cartId: ID!, $lines: [CartLineInput!]!) {
    cartLinesAdd(cartId: $cartId, lines: $lines) { ${MUTATION_RESULT} }
  }
`;

const CART_LINES_UPDATE_MUTATION = `
  mutation cartLinesUpdate($cartId: ID!, $lines: [CartLineUpdateInput!]!) {
    cartLinesUpdate(cartId: $cartId, lines: $lines) { ${MUTATION_RESULT} }
  }
`;

const CART_LINES_REMOVE_MUTATION = `
  mutation cartLinesRemove($cartId: ID!, $lineIds: [ID!]!) {
    cartLinesRemove(cartId: $cartId, lineIds: $lineIds) { ${MUTATION_RESULT} }
  }
`;

const CART_DISCOUNT_CODES_UPDATE_MUTATION = `
  mutation cartDiscountCodesUpdate($cartId: ID!, $discountCodes: [String!]!) {
    cartDiscountCodesUpdate(cartId: $cartId, discountCodes: $discountCodes) { ${MUTATION_RESULT} }
  }
`;

const CART_BUYER_IDENTITY_UPDATE_MUTATION = `
  mutation cartBuyerIdentityUpdate($cartId: ID!, $buyerIdentity: CartBuyerIdentityInput!) {
    cartBuyerIdentityUpdate(cartId: $cartId, buyerIdentity: $buyerIdentity) {
      cart { ${FULL_CART_FIELDS} }
      userErrors { field message code }
    }
  }
`;

const CART_DELIVERY_ADDRESSES_REPLACE_MUTATION = `
  mutation cartDeliveryAddressesReplace($cartId: ID!, $addresses: [CartSelectableAddressInput!]!) {
    cartDeliveryAddressesReplace(cartId: $cartId, addresses: $addresses) {
      cart { ${FULL_CART_FIELDS} }
      userErrors { field message code }
    }
  }
`;

const CART_ATTRIBUTES_UPDATE_MUTATION = `
  mutation cartAttributesUpdate($cartId: ID!, $attributes: [AttributeInput!]!) {
    cartAttributesUpdate(cartId: $cartId, attributes: $attributes) {
      cart { id }
      userErrors { field message }
    }
  }
`;

/** Full cart including product details, used to rebuild a bag on another device. */
const ADOPT_CART_QUERY = `
  query adoptCart($id: ID!) {
    cart(id: $id) {
      id
      checkoutUrl
      totalQuantity
      discountCodes { code applicable }
      cost {
        subtotalAmount { amount currencyCode }
        totalAmount { amount currencyCode }
      }
      lines(first: 100) {
        edges {
          node {
            id
            quantity
            merchandise {
              ... on ProductVariant {
                id
                title
                price { amount currencyCode }
                selectedOptions { name value }
                image { url altText }
                product {
                  id
                  title
                  handle
                  description
                  productType
                  vendor
                  priceRange { minVariantPrice { amount currencyCode } }
                  images(first: 1) { edges { node { url altText } } }
                }
              }
            }
          }
        }
      }
    }
  }
`;

function itemsFromRemote(cart: any): CartItem[] {
  return (cart?.lines?.edges ?? [])
    .map((e: any) => e?.node)
    .filter((n: any) => n?.merchandise?.id && n.merchandise.product)
    .map((n: any): CartItem => {
      const m = n.merchandise;
      const p = m.product;
      const images = p.images?.edges?.length
        ? p.images
        : { edges: m.image ? [{ node: m.image }] : [] };
      return {
        lineId: n.id,
        variantId: m.id,
        variantTitle: m.title,
        price: m.price,
        quantity: n.quantity,
        selectedOptions: m.selectedOptions ?? [],
        image: resolveLineImage(m.image, p),
        product: {
          node: {
            ...p,
            images,
            variants: {
              edges: [
                {
                  node: {
                    id: m.id,
                    title: m.title,
                    price: m.price,
                    availableForSale: true,
                    selectedOptions: m.selectedOptions ?? [],
                  },
                },
              ],
            },
            options: [],
          },
        } as ShopifyProduct,
      };
    });
}


/** Build buyerIdentity from the signed-in Shopify customer, if any.
 * companyLocationId comes ONLY from the server-resolved b2bStore (see
 * src/lib/b2b.functions.ts) -- never from anything the browser supplies
 * directly, so a B2C customer can never put a company location on their
 * own cart by any client-side means. */
function currentBuyerIdentity(): { customerAccessToken: string; countryCode: string; companyLocationId?: string } | null {
  const token = getCustomerToken();
  if (!token) return null;
  // Only the EFFECTIVE location -- eligible (status) AND the shopper is
  // actively in Business shopping mode. An eligible B2B customer who has
  // switched to Personal Shopping must never have companyLocationId
  // attached here, or B2B pricing/quantity rules would silently keep
  // applying to a cart they believe is priced as an individual.
  const companyLocationId = getEffectiveCompanyLocationId(useB2BStore.getState());
  return companyLocationId
    ? { customerAccessToken: token, countryCode: "IN", companyLocationId }
    : { customerAccessToken: token, countryCode: "IN" };
}

const COUPON_PREVIEW_MUTATION = `
  mutation couponPreview($input: CartInput!) {
    cartCreate(input: $input) {
      cart {
        id
        discountCodes { code applicable }
        lines(first: 5) {
          edges { node { quantity cost { subtotalAmount { amount currencyCode } totalAmount { amount currencyCode } } } }
        }
      }
      userErrors { field message code }
    }
  }
`;

/**
 * Asks Shopify what a discount code does to ONE product line, without touching
 * the shopper's real cart: a throwaway cart (cartCreate with just this line +
 * the code, under the shopper's current buyer identity so B2B/B2C pricing
 * matches) whose line costs Shopify calculates itself. Shopify only reports
 * "applicable or not" -- see interpretPreviewCart. Throwaway carts are never
 * reused or checked out and expire on Shopify's side.
 */
export async function previewCouponForLine(args: { code: string; variantId: string; quantity: number }): Promise<CouponPreview> {
  try {
    const buyerIdentity = currentBuyerIdentity();
    const data = await storefrontApiRequest(COUPON_PREVIEW_MUTATION, {
      input: {
        lines: [{ merchandiseId: args.variantId, quantity: args.quantity }],
        discountCodes: [args.code],
        ...(buyerIdentity ? { buyerIdentity } : {}),
      },
    });
    return interpretPreviewCart(data?.data?.cartCreate, args.code);
  } catch (error) {
    console.error("Coupon preview failed:", error);
    return { status: "error", message: "Couldn't check this code right now. Please try again." };
  }
}

function formatCheckoutUrl(checkoutUrl: string): string {
  try {
    const url = new URL(checkoutUrl);
    url.searchParams.set("channel", "online_store");
    return appendAttribution(url.toString());
  } catch {
    return checkoutUrl;
  }
}

function attributionAttributes(): Array<{ key: string; value: string }> {
  return Object.entries(getAttribution()).map(([key, value]) => ({ key: `_${key}`, value }));
}

type UserError = { field: string[] | null; message: string; code?: string | null };
type CartWarning = { code: string; message: string; target?: string };
type ShopifyLine = { id: string; quantity: number; merchandise: { id: string; image?: ShopifyImage | null } | null };
type ValidLine = { id: string; quantity: number; merchandise: { id: string; image?: ShopifyImage | null } };

function isCartNotFoundError(userErrors: UserError[]): boolean {
  return userErrors.some(
    (e) =>
      e.message.toLowerCase().includes("cart not found") ||
      e.message.toLowerCase().includes("does not exist"),
  );
}

const STOCK_CODES = new Set([
  "MERCHANDISE_NOT_ENOUGH_STOCK",
  "MERCHANDISE_OUT_OF_STOCK",
  "MERCHANDISE_NOT_ENOUGH_STOCK_AVAILABLE",
  "PRODUCT_NOT_AVAILABLE",
]);

function friendlyMessage(code: string | null | undefined, message: string): string {
  const c = (code ?? "").toUpperCase();
  const m = message.toLowerCase();
  if (c === "MERCHANDISE_OUT_OF_STOCK" || m.includes("sold out") || m.includes("out of stock")) {
    return "Sorry, this item is out of stock.";
  }
  if (STOCK_CODES.has(c) || m.includes("only") || m.includes("stock") || m.includes("inventory")) {
    return message && !message.includes("gid://")
      ? message
      : "We don't have that many in stock. Your quantity has been adjusted.";
  }
  if (c === "INVALID_MERCHANDISE_LINE" || m.includes("merchandise") || m.includes("not available")) {
    return "This product is no longer available.";
  }
  return "Couldn't update your bag. Please try again.";
}

/** Show toasts for user errors / warnings. Returns true if blocking errors occurred. */
function reportProblems(errors: UserError[], warnings: CartWarning[] = []): boolean {
  const err = errors[0];
  if (err) {
    // TEMP DIAGNOSTIC (remove once the live "Add to Cart fails" regression
    // is confirmed fixed): console.error(array) only ever showed a
    // collapsed "Array(1)" in the browser console, never the actual
    // field/code/message content -- stringify so the real Shopify error is
    // visible. Never includes a token/secret; `errors` here is only ever
    // Shopify's own cart userErrors array.
    console.error("Shopify cart error:", JSON.stringify(errors));
    toast.error(friendlyMessage(err.code, err.message));
    return true;
  }
  const warn = warnings[0];
  if (warn) toast.warning(friendlyMessage(warn.code, warn.message));
  return false;
}

/** Extract lines, separating valid ones from those whose product was deleted/unpublished. */
function extractLines(cart: any): { valid: ValidLine[]; orphaned: string[] } {
  const all: ShopifyLine[] = (cart?.lines?.edges ?? []).map((e: any) => e?.node).filter(Boolean);
  const valid: ValidLine[] = [];
  const orphaned: string[] = [];
  for (const line of all) {
    if (line.merchandise?.id) valid.push(line as ValidLine);
    else orphaned.push(line.id);
  }
  return { valid, orphaned };
}

function extractCost(cart: any): CartCost {
  return {
    subtotal: cart?.cost?.subtotalAmount ?? null,
    total: cart?.cost?.totalAmount ?? null,
  };
}

function extractDeliveryAddress(cart: any): CartDeliveryAddress | null {
  const addresses = cart?.delivery?.addresses ?? [];
  const selected = addresses.find((a: any) => a?.selected && a?.address?.__typename === "CartDeliveryAddress");
  if (!selected) return null;
  const a = selected.address;
  return {
    firstName: a.firstName ?? null,
    lastName: a.lastName ?? null,
    address1: a.address1 ?? null,
    address2: a.address2 ?? null,
    city: a.city ?? null,
    provinceCode: a.provinceCode ?? null,
    zip: a.zip ?? null,
    phone: a.phone ?? null,
  };
}

/**
 * Merge Shopify-confirmed line data (lineId, quantity) into local CartItem array.
 * Items missing from Shopify are dropped; quantities are updated to match Shopify.
 */
function reconcileItems(localItems: CartItem[], shopifyLines: ValidLine[]): CartItem[] {
  const lineMap = new Map<string, ValidLine>();
  for (const line of shopifyLines) lineMap.set(line.merchandise.id, line);
  return localItems
    .filter((item) => item && item.variantId && lineMap.has(item.variantId))
    .map((item) => {
      const sl = lineMap.get(item.variantId)!;
      return { ...item, lineId: sl.id, quantity: sl.quantity, image: resolveLineImage(sl.merchandise.image, item.product?.node) };
    });
}

// Per-variant mutation queue — prevents race conditions from rapid +/- clicks
const mutationQueues = new Map<string, Promise<void>>();
function enqueue(key: string, fn: () => Promise<void>): Promise<void> {
  const prev = mutationQueues.get(key) ?? Promise.resolve();
  const next = prev.then(fn).catch(() => {});
  mutationQueues.set(key, next);
  return next;
}

interface CartStore {
  items: CartItem[];
  cartId: string | null;
  checkoutUrl: string | null;
  discountCodes: CartDiscountCode[];
  cost: CartCost;
  /** This order's delivery address -- a one-time cart address (see
   * DeliveryAddressInput), never the B2B Company Location's registered
   * business address. Null until setDeliveryAddress() is called. */
  deliveryAddress: CartDeliveryAddress | null;
  isLoading: boolean;
  isSyncing: boolean;
  /** variantId -> quantity-rule field(s) a real cart mutation has revealed
   * for it -- see variantMinimumQuantity's comment for why this exists
   * (the product read can under-report a catalog-scoped rule that the
   * cart mutation still enforces). Session-only, never persisted: a fresh
   * page load re-derives it the same way if the mutation is attempted
   * again, and it only ever grows more accurate, never stale-wrong. */
  quantityRuleOverrides: QuantityRuleOverrides;
  addItem: (item: Omit<CartItem, "lineId">) => Promise<void>;
  updateQuantity: (variantId: string, quantity: number) => Promise<void>;
  removeItem: (variantId: string) => Promise<void>;
  clearCart: () => void;
  syncCart: () => Promise<void>;
  /** On sign-in: load the account's saved bag (merging local items) or save this bag to the account. */
  syncCustomerCart: (token: string) => Promise<void>;
  getCheckoutUrl: () => string | null;
  applyDiscountCode: (code: string) => Promise<{ ok: boolean; message: string }>;
  removeDiscountCode: (code: string) => Promise<void>;
  /** Attach the signed-in customer to the cart, then return a fresh checkout
   * URL -- or, on failure, WHY, so callers can show an honest message
   * instead of failing silently. `reason` is never shown to the shopper
   * verbatim; callers map it to their own wording. */
  prepareCheckout: () => Promise<
    | { url: string }
    | { url: null; reason: "no-cart" | "no-checkout-url" | "cart-not-found" | "user-error" | "exception" }
  >;
  /** Re-attaches the existing cart's buyer identity to whichever mode
   * (Personal/Business Shopping) is currently active and refreshes its
   * cost/items immediately -- used right after a mode switch, not only
   * at checkout. No-ops (returns true) when there's no cart or no buyer
   * to attach. Returns false only on a genuine failure the caller should
   * surface (already toasted via the existing reportProblems mechanism). */
  reconcileBuyerIdentity: () => Promise<boolean>;
  /**
   * Buy Now: creates a brand-new, standalone Shopify cart for exactly this
   * one line and returns its checkout URL -- WITHOUT ever touching this
   * store's own cartId/items/checkoutUrl state or the customer's saved
   * cart (customer_carts / saveCustomerCart). The regular persistent cart
   * (items/cartId above) is completely untouched by this call, in both
   * directions: nothing here is read from it, and nothing it does writes
   * back to it. If the shopper abandons this checkout, there is nothing
   * to roll back -- the throwaway cart this created was never linked to
   * their persistent cart or saved cart record in the first place, so
   * returning to the site shows their cart exactly as it was before Buy
   * Now was clicked. Returns null on any failure (reported via toast
   * inside this function, same pattern as addItem/prepareCheckout).
   */
  createStandaloneCheckout: (item: Omit<CartItem, "lineId">) => Promise<string | null>;
  /** Sets (or replaces) this order's one-time delivery address via
   * cartDeliveryAddressesReplace, by typing out the address fields inline
   * (oneTimeUse: true -- never saved to the customer's own address book).
   * Independent of buyerIdentity/B2B pricing and of the Company Location's
   * registered address -- see DeliveryAddressSelector.tsx for the UI that
   * calls this (new address, or an address copied from a past order). */
  setDeliveryAddress: (address: DeliveryAddressInput) => Promise<boolean>;
  /** Same cart field as setDeliveryAddress, but for picking one of the
   * signed-in customer's OWN saved addresses (a real CustomerAddress id) --
   * uses copyFromCustomerAddressId + oneTimeUse: false instead of
   * retyping the address inline, which is Shopify's documented way to
   * reference (not copy-and-detach) a saved address on the cart. */
  setDeliveryAddressFromSaved: (customerAddressId: string) => Promise<boolean>;
}

/** Maps prepareCheckout()'s failure `reason` to one honest, shopper-facing
 * message -- shared by every call site (cart.tsx, CartDrawer.tsx,
 * products.$slug.tsx) so the wording stays consistent in one place. */
export function checkoutFailureMessage(
  reason: "no-cart" | "no-checkout-url" | "cart-not-found" | "user-error" | "exception",
): string {
  switch (reason) {
    case "no-cart":
    case "no-checkout-url":
      return "Your bag is empty. Please add an item before checking out.";
    case "cart-not-found":
      return "Your bag expired. Please add your items again.";
    case "user-error":
    case "exception":
    default:
      return "Couldn't start checkout. Please try again.";
  }
}

export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => {
      /** Apply a Shopify cart payload to local state. */
      const applyCart = (cart: any) => {
        const { valid, orphaned } = extractLines(cart);
        const before = get().items.length;
        const items = reconcileItems(get().items, valid);
        set({
          items,
          discountCodes: cart?.discountCodes ?? get().discountCodes,
          cost: extractCost(cart),
          deliveryAddress: extractDeliveryAddress(cart),
          ...(cart?.checkoutUrl ? { checkoutUrl: formatCheckoutUrl(cart.checkoutUrl) } : {}),
        });
        return { orphaned, dropped: before - items.length };
      };

      /** Records what a rejected mutation just revealed about this
       * variant's real quantity rule -- merged field-by-field (a
       * MINIMUM_NOT_MET rejection only ever reveals `minimum`, never
       * `maximum`/`increment`, so this never overwrites a field Shopify
       * hasn't actually told us about). Scoped by the CURRENT buyer's
       * company location (see quantityRuleScopeKey) at the moment the
       * correction is learned -- a B2B rule revealed for one company
       * location, or an anonymous/B2C shopper's rule, is never read back
       * for a different buyer scope sharing the same browser tab. */
      const recordQuantityRuleCorrection = (variantId: string, correction: { field: keyof QuantityRuleOverride; value: number }) => {
        const key = scopedVariantKey(variantId, currentBuyerIdentity()?.companyLocationId);
        set((s) => ({
          quantityRuleOverrides: {
            ...s.quantityRuleOverrides,
            [key]: { ...s.quantityRuleOverrides[key], [correction.field]: correction.value },
          },
        }));
      };

      const removeOrphans = async (cartId: string, orphaned: string[]) => {
        if (orphaned.length === 0) return;
        try {
          const data = await storefrontApiRequest(CART_LINES_REMOVE_MUTATION, {
            cartId,
            lineIds: orphaned,
          });
          const cart = data?.data?.cartLinesRemove?.cart;
          if (cart) applyCart(cart);
        } catch (error) {
          console.error("Failed to remove unavailable lines:", error);
        }
      };

      /** Shopify's documented semantics for clearing an already-attached
       * companyLocationId via cartBuyerIdentityUpdate are not confirmed
       * (see currentBuyerIdentity's own comment) -- this is the fallback
       * for a switch TO Personal Shopping where the cart's own
       * buyerIdentity.purchasingCompany still isn't null afterward: build
       * a brand-new cart with the same lines and discount codes and no
       * buyerIdentity, and swap it in. Never silently leaves a B2B-priced
       * cart behind a shopper who believes they switched to Personal
       * Shopping. Delivery address, if one was set, does NOT carry over
       * to the new cart (cartCreate has no mechanism to copy it) -- an
       * accepted, minor side effect of this rare fallback path, not the
       * common case. */
      const rebuildCartWithoutCompanyLocation = async (): Promise<boolean> => {
        const { items, discountCodes } = get();
        if (items.length === 0) {
          set({ cartId: null, items: [], checkoutUrl: null, discountCodes: [], cost: { subtotal: null, total: null }, deliveryAddress: null });
          return true;
        }
        const lines = items.map((item) => ({
          merchandiseId: item.variantId,
          quantity: item.quantity,
          ...(item.lineAttributes?.length ? { attributes: toCheckoutLineAttributes(item.lineAttributes) } : {}),
        }));
        try {
          const data = await storefrontApiRequest(CART_CREATE_MUTATION, {
            input: {
              lines,
              ...(discountCodes.length ? { discountCodes: discountCodes.map((d) => d.code) } : {}),
            },
          });
          const payload = data?.data?.cartCreate;
          if (reportProblems(payload?.userErrors ?? [], payload?.warnings ?? [])) return false;
          const cart = payload?.cart;
          if (!cart) return false;
          const { valid } = extractLines(cart);
          set({
            cartId: cart.id,
            checkoutUrl: formatCheckoutUrl(cart.checkoutUrl),
            items: reconcileItems(items, valid),
            discountCodes: cart.discountCodes ?? [],
            cost: extractCost(cart),
            deliveryAddress: null,
          });
          const token = getCustomerToken();
          if (token) saveCustomerCart({ data: { token, cartId: cart.id } }).catch(() => {});
          return true;
        } catch (error) {
          console.error("Failed to rebuild cart without company location:", error);
          return false;
        }
      };

      return {
        items: [],
        cartId: null,
        checkoutUrl: null,
        discountCodes: [],
        cost: { subtotal: null, total: null },
        deliveryAddress: null,
        isLoading: false,
        isSyncing: false,
        quantityRuleOverrides: {},

        addItem: async (item) => {
          // Not just a UI concern -- every caller's own stepper already
          // floors at this, but this is the actual gate right before a
          // Shopify mutation is sent. This is only a BASELINE floor (see
          // variantMinimumQuantity's comment) -- each mutation attempt
          // below still self-corrects against Shopify's own real answer.
          const addMinQty = variantMinimumQuantity(item, get().quantityRuleOverrides, currentBuyerIdentity()?.companyLocationId);
          if (item.quantity < addMinQty) item = { ...item, quantity: addMinQty };
          set({ isLoading: true });
          const qtyBefore = get().items.find((i) => i.variantId === item.variantId)?.quantity ?? 0;
          try {
            const { items, cartId, clearCart } = get();
            // A customized purchase (lineAttributes present) always becomes
            // its own new line rather than merging into a prior plain line
            // for the same variant -- merging would bump that existing
            // line's quantity without ever attaching this item's
            // attributes, silently losing the customization.
            const existing = item.lineAttributes?.length ? undefined : items.find((i) => i.variantId === item.variantId);
            const lineInputBase = {
              merchandiseId: item.variantId,
              ...(item.lineAttributes?.length ? { attributes: toCheckoutLineAttributes(item.lineAttributes) } : {}),
            };

            if (!cartId) {
              const buyerIdentity = currentBuyerIdentity();
              const attributes = attributionAttributes();
              const { payload } = await runWithQuantityRuleRetry(
                item.variantId,
                item.quantity,
                async (quantity) => {
                  const data = await storefrontApiRequest(CART_CREATE_MUTATION, {
                    input: {
                      lines: [{ ...lineInputBase, quantity }],
                      ...(buyerIdentity ? { buyerIdentity } : {}),
                      ...(attributes.length ? { attributes } : {}),
                    },
                  });
                  return data?.data?.cartCreate ?? {};
                },
                recordQuantityRuleCorrection,
              );
              if (reportProblems(payload?.userErrors ?? [], payload?.warnings ?? [])) return;
              const cart = payload?.cart;
              if (!cart) return;
              const { valid } = extractLines(cart);
              const line = valid.find((l) => l.merchandise.id === item.variantId);
              if (!line) {
                toast.error("Sorry, this item is out of stock."); haptic("error");
                return;
              }
              set({
                cartId: cart.id,
                checkoutUrl: formatCheckoutUrl(cart.checkoutUrl),
                items: [{ ...item, lineId: line.id, quantity: line.quantity, image: resolveLineImage(line.merchandise.image, item.product?.node) }],
                discountCodes: cart.discountCodes ?? [],
                cost: extractCost(cart),
              });
              if (buyerIdentity) {
                saveCustomerCart({
                  data: { token: buyerIdentity.customerAccessToken, cartId: cart.id },
                }).catch(() => {});
              }
            } else if (existing) {
              if (!existing.lineId) return;
              const existingLineId = existing.lineId;
              const { payload } = await runWithQuantityRuleRetry(
                item.variantId,
                existing.quantity + item.quantity,
                async (quantity) => {
                  const data = await storefrontApiRequest(CART_LINES_UPDATE_MUTATION, {
                    cartId,
                    lines: [{ id: existingLineId, quantity }],
                  });
                  return data?.data?.cartLinesUpdate ?? {};
                },
                recordQuantityRuleCorrection,
              );
              const errors: UserError[] = payload?.userErrors ?? [];
              if (isCartNotFoundError(errors)) { clearCart(); return; }
              if (reportProblems(errors, payload?.warnings ?? [])) return;
              if (payload?.cart) applyCart(payload.cart);
            } else {
              const { payload } = await runWithQuantityRuleRetry(
                item.variantId,
                item.quantity,
                async (quantity) => {
                  const data = await storefrontApiRequest(CART_LINES_ADD_MUTATION, {
                    cartId,
                    lines: [{ ...lineInputBase, quantity }],
                  });
                  return data?.data?.cartLinesAdd ?? {};
                },
                recordQuantityRuleCorrection,
              );
              const errors: UserError[] = payload?.userErrors ?? [];
              if (isCartNotFoundError(errors)) {
                // Stale cart: start fresh with this item.
                clearCart();
                set({ isLoading: false });
                await get().addItem(item);
                return;
              }
              if (reportProblems(errors, payload?.warnings ?? [])) return;
              const cart = payload?.cart;
              if (!cart) return;
              const { valid } = extractLines(cart);
              const line = valid.find((l) => l.merchandise.id === item.variantId);
              if (!line) {
                toast.error("Sorry, this item is out of stock."); haptic("error");
                return;
              }
              set({ items: [...get().items, { ...item, lineId: line.id, quantity: line.quantity, image: resolveLineImage(line.merchandise.image, item.product?.node) }] });
              applyCart(cart);
            }
          } catch (error) {
            console.error("Failed to add item:", error);
            toast.error("Couldn't add this item to your bag. Please try again."); haptic("error");
          } finally {
            set({ isLoading: false });
            // Only fire once Shopify has actually accepted the line.
            const qtyAfter = get().items.find((i) => i.variantId === item.variantId)?.quantity ?? 0;
            if (qtyAfter > qtyBefore) {
              const addedQty = qtyAfter - qtyBefore;
              trackAddToCart({
                variantId: item.variantId,
                name: item.product.node.title,
                price: parseFloat(item.price.amount),
                currency: item.price.currencyCode,
                quantity: addedQty,
              });
              trackGoogleAddToCart({
                variantId: item.variantId,
                name: item.product.node.title,
                price: parseFloat(item.price.amount),
                currency: item.price.currencyCode,
                quantity: addedQty,
              });
            }
          }
        },

        updateQuantity: async (variantId, quantity) => {
          if (quantity <= 0) {
            await get().removeItem(variantId);
            return;
          }
          // A caller (e.g. the cart drawer's own -/+ ) can still ask for a
          // quantity below Shopify's configured minimum -- never below 0,
          // which stays a removal, never silently reduced below the
          // minimum. Dropping to 0/removing the line entirely is always
          // allowed regardless of the minimum -- that isn't "decreasing
          // below it", it's removing the line.
          const existingItem = get().items.find((i) => i.variantId === variantId);
          const clampedQuantity = existingItem ? Math.max(quantity, variantMinimumQuantity(existingItem, get().quantityRuleOverrides, currentBuyerIdentity()?.companyLocationId)) : quantity;
          set({
            isLoading: true,
            items: get().items.map((i) => (i.variantId === variantId ? { ...i, quantity: clampedQuantity } : i)),
          });
          await enqueue(variantId, async () => {
            const { items, cartId, clearCart } = get();
            const item = items.find((i) => i.variantId === variantId);
            if (!item?.lineId || !cartId) {
              set({ isLoading: false });
              return;
            }
            try {
              const lineId = item.lineId;
              const { payload } = await runWithQuantityRuleRetry(
                variantId,
                item.quantity,
                async (qty) => {
                  const data = await storefrontApiRequest(CART_LINES_UPDATE_MUTATION, {
                    cartId,
                    lines: [{ id: lineId, quantity: qty }],
                  });
                  return data?.data?.cartLinesUpdate ?? {};
                },
                recordQuantityRuleCorrection,
              );
              const errors: UserError[] = payload?.userErrors ?? [];
              if (isCartNotFoundError(errors)) { clearCart(); return; }
              if (reportProblems(errors, payload?.warnings ?? [])) {
                // Snap back to what Shopify actually holds.
                await get().syncCart();
                return;
              }
              if (payload?.cart) applyCart(payload.cart);
            } catch (error) {
              console.error("Failed to update quantity:", error);
              toast.error("Couldn't update the quantity. Please try again.");
              await get().syncCart();
            } finally {
              set({ isLoading: false });
            }
          });
        },

        removeItem: async (variantId) => {
          const { items, cartId, clearCart } = get();
          const item = items.find((i) => i.variantId === variantId);
          if (!item?.lineId || !cartId) {
            set({ items: items.filter((i) => i.variantId !== variantId) });
            return;
          }
          set({ isLoading: true, items: items.filter((i) => i.variantId !== variantId) });
          try {
            const data = await storefrontApiRequest(CART_LINES_REMOVE_MUTATION, {
              cartId,
              lineIds: [item.lineId],
            });
            const payload = data?.data?.cartLinesRemove;
            const errors: UserError[] = payload?.userErrors ?? [];
            if (isCartNotFoundError(errors)) { clearCart(); return; }
            if (reportProblems(errors)) return;
            const cart = payload?.cart;
            if (!cart) return;
            if (extractLines(cart).valid.length === 0) clearCart();
            else applyCart(cart);
            trackGoogleRemoveFromCart({
              variantId: item.variantId,
              name: item.product.node.title,
              price: parseFloat(item.price.amount),
              currency: item.price.currencyCode,
              quantity: item.quantity,
            });
          } catch (error) {
            console.error("Failed to remove item:", error);
            toast.error("Couldn't remove this item. Please try again.");
          } finally {
            set({ isLoading: false });
          }
        },

        clearCart: () =>
          set({
            items: [],
            cartId: null,
            checkoutUrl: null,
            discountCodes: [],
            cost: { subtotal: null, total: null },
            deliveryAddress: null,
          }),
        getCheckoutUrl: () => get().checkoutUrl,

        applyDiscountCode: async (rawCode) => {
          const code = rawCode.trim();
          const { cartId, discountCodes, clearCart } = get();
          if (!code) return { ok: false, message: "Enter a discount code." };
          if (!cartId) return { ok: false, message: "Add an item to your bag first." };
          const codes = Array.from(
            new Set([...discountCodes.map((d) => d.code), code].map((c) => c.toUpperCase())),
          );
          set({ isLoading: true });
          try {
            const data = await storefrontApiRequest(CART_DISCOUNT_CODES_UPDATE_MUTATION, {
              cartId,
              discountCodes: codes,
            });
            const payload = data?.data?.cartDiscountCodesUpdate;
            const errors: UserError[] = payload?.userErrors ?? [];
            if (isCartNotFoundError(errors)) { clearCart(); return { ok: false, message: "Your bag expired. Please add items again." }; }
            if (errors.length) return { ok: false, message: "This code isn't valid." };
            const cart = payload?.cart;
            if (!cart) return { ok: false, message: "Couldn't apply this code." };
            applyCart(cart);
            const applied = (cart.discountCodes as CartDiscountCode[]).find(
              (d) => d.code.toUpperCase() === code.toUpperCase(),
            );
            if (!applied?.applicable) {
              // Don't leave a non-applicable code sitting on the cart.
              await get().removeDiscountCode(code);
              return { ok: false, message: "This code isn't valid for the items in your bag." };
            }
            return { ok: true, message: `Code ${applied.code} applied.` };
          } catch (error) {
            console.error("Failed to apply discount:", error);
            return { ok: false, message: "Couldn't apply this code. Please try again." };
          } finally {
            set({ isLoading: false });
          }
        },

        removeDiscountCode: async (code) => {
          const { cartId, discountCodes } = get();
          if (!cartId) return;
          const remaining = discountCodes
            .map((d) => d.code)
            .filter((c) => c.toUpperCase() !== code.toUpperCase());
          set({ isLoading: true });
          try {
            const data = await storefrontApiRequest(CART_DISCOUNT_CODES_UPDATE_MUTATION, {
              cartId,
              discountCodes: remaining,
            });
            const cart = data?.data?.cartDiscountCodesUpdate?.cart;
            if (cart) applyCart(cart);
          } catch (error) {
            console.error("Failed to remove discount:", error);
          } finally {
            set({ isLoading: false });
          }
        },

        prepareCheckout: async () => {
          const { cartId, checkoutUrl, clearCart } = get();
          if (!cartId) return checkoutUrl ? { url: checkoutUrl } : { url: null, reason: "no-cart" as const };
          // Record attribution on the cart so it shows on the Shopify order.
          const attributes = attributionAttributes();
          if (attributes.length) {
            storefrontApiRequest(CART_ATTRIBUTES_UPDATE_MUTATION, { cartId, attributes }).catch(() => {});
          }
          const buyerIdentity = currentBuyerIdentity();
          if (!buyerIdentity) {
            // Guest checkout is a normal, supported path (buyerIdentity is
            // only non-null for a signed-in customer/company) -- a missing
            // checkoutUrl here means there's no cart to check out, not that
            // sign-in is required.
            return checkoutUrl ? { url: formatCheckoutUrl(checkoutUrl) } : { url: null, reason: "no-checkout-url" as const };
          }
          try {
            const data = await storefrontApiRequest(CART_BUYER_IDENTITY_UPDATE_MUTATION, {
              cartId,
              buyerIdentity,
            });
            const errors: UserError[] = data?.data?.cartBuyerIdentityUpdate?.userErrors ?? [];
            if (isCartNotFoundError(errors)) {
              clearCart();
              return { url: null, reason: "cart-not-found" as const };
            }
            if (errors.length > 0) {
              console.error("Buyer identity update failed:", errors);
              return checkoutUrl ? { url: checkoutUrl } : { url: null, reason: "user-error" as const };
            }
            const updatedCart = data?.data?.cartBuyerIdentityUpdate?.cart;
            const url = updatedCart?.checkoutUrl;
            if (!url) return checkoutUrl ? { url: checkoutUrl } : { url: null, reason: "no-checkout-url" as const };
            // Refresh cost/items now, not just checkoutUrl: attaching a
            // companyLocationId can change Shopify's computed price for
            // this cart, and the old behavior (only storing checkoutUrl)
            // left the visible subtotal/total stale until the next
            // syncCart() -- right before checkout is exactly the moment
            // that staleness mattered most.
            applyCart(updatedCart);
            const formatted = formatCheckoutUrl(url);
            return { url: formatted };
          } catch (error) {
            console.error("Failed to attach customer to cart:", error);
            return checkoutUrl ? { url: checkoutUrl } : { url: null, reason: "exception" as const };
          }
        },

        /** Re-attaches the cart's buyer identity under whichever mode is
         * CURRENTLY active and refreshes cost/items immediately --
         * usable mid-session (e.g. right after a Personal/Business
         * Shopping switch), not just right before checkout like
         * prepareCheckout. Kept as its own implementation rather than a
         * shared low-level extraction from prepareCheckout: the two have
         * different failure-handling needs (prepareCheckout always
         * degrades to "send them to checkout with whatever's current";
         * this one needs to detect and self-correct a company location
         * that didn't actually clear -- see rebuildCartWithoutCompanyLocation). */
        reconcileBuyerIdentity: async () => {
          const { cartId, clearCart } = get();
          if (!cartId) return true;
          const buyerIdentity = currentBuyerIdentity();
          if (!buyerIdentity) return true; // anonymous -- nothing to attach
          try {
            const data = await storefrontApiRequest(CART_BUYER_IDENTITY_UPDATE_MUTATION, {
              cartId,
              buyerIdentity,
            });
            const errors: UserError[] = data?.data?.cartBuyerIdentityUpdate?.userErrors ?? [];
            if (isCartNotFoundError(errors)) {
              clearCart();
              return true;
            }
            if (reportProblems(errors, [])) return false;
            const updatedCart = data?.data?.cartBuyerIdentityUpdate?.cart;
            if (!updatedCart) return false;

            const effectiveCompanyLocationId = getEffectiveCompanyLocationId(useB2BStore.getState());
            const actualLocationId = updatedCart?.buyerIdentity?.purchasingCompany?.location?.id ?? null;
            if (effectiveCompanyLocationId === null && actualLocationId !== null) {
              return await rebuildCartWithoutCompanyLocation();
            }
            applyCart(updatedCart);
            return true;
          } catch (error) {
            console.error("Failed to reconcile buyer identity:", error);
            return false;
          }
        },

        createStandaloneCheckout: async (item) => {
          // Same floor as addItem() -- Buy Now (plain PDP and the
          // Customizer's own Buy Now) both go through this one function.
          // Only a BASELINE (see variantMinimumQuantity's comment) -- the
          // cartCreate attempt below still self-corrects against
          // Shopify's own real answer if this baseline is wrong.
          const checkoutMinQty = variantMinimumQuantity(item, get().quantityRuleOverrides, currentBuyerIdentity()?.companyLocationId);
          if (item.quantity < checkoutMinQty) item = { ...item, quantity: checkoutMinQty };
          try {
            const buyerIdentity = currentBuyerIdentity();
            const attributes = attributionAttributes();
            const lineInputBase = {
              merchandiseId: item.variantId,
              ...(item.lineAttributes?.length ? { attributes: item.lineAttributes } : {}),
            };
            // Carry this product's own promotion code (if it is applied on the
            // main cart) into the one-item cart. Shopify validates it: an
            // inapplicable code just comes back applicable:false and checkout
            // proceeds at full price -- it never blocks Buy Now.
            const promoCode = getPromotionCodeToCarry(
              item.product.node.collections?.edges.map((e) => e.node.handle),
              get().discountCodes,
              useCouponStore.getState().selectedCode,
            );
            const { payload: createPayload } = await runWithQuantityRuleRetry(
              item.variantId,
              item.quantity,
              async (quantity) => {
                const createData = await storefrontApiRequest(CART_CREATE_MUTATION, {
                  input: {
                    lines: [{ ...lineInputBase, quantity }],
                    ...(buyerIdentity ? { buyerIdentity } : {}),
                    ...(attributes.length ? { attributes } : {}),
                    ...(promoCode ? { discountCodes: [promoCode] } : {}),
                  },
                });
                return createData?.data?.cartCreate ?? {};
              },
              recordQuantityRuleCorrection,
            );
            if (reportProblems(createPayload?.userErrors ?? [], createPayload?.warnings ?? [])) return null;
            let cart = createPayload?.cart;
            if (!cart) {
              // No userErrors, but also no cart -- an otherwise-silent gap;
              // give the same feedback as every other failure path below.
              toast.error("Couldn't start checkout. Please try again.");
              haptic("error");
              return null;
            }
            const { valid } = extractLines(cart);
            if (!valid.some((l) => l.merchandise.id === item.variantId)) {
              toast.error("Sorry, this item is out of stock.");
              haptic("error");
              return null;
            }

            // Same "attach buyer identity right before handoff" step
            // prepareCheckout does for the persistent cart -- a company
            // location can affect computed pricing, so this is re-applied
            // on this brand-new cart too rather than trusting cartCreate's
            // own buyerIdentity input alone to have already repriced it.
            if (buyerIdentity) {
              const updateData = await storefrontApiRequest(CART_BUYER_IDENTITY_UPDATE_MUTATION, {
                cartId: cart.id,
                buyerIdentity,
              });
              const updateErrors: UserError[] = updateData?.data?.cartBuyerIdentityUpdate?.userErrors ?? [];
              if (updateErrors.length === 0 && updateData?.data?.cartBuyerIdentityUpdate?.cart) {
                cart = updateData.data.cartBuyerIdentityUpdate.cart;
              }
              // A failure here just means checkout proceeds with the
              // cartCreate-time buyerIdentity/pricing instead -- never a
              // reason to fail the whole purchase.
            }

            if (promoCode) {
              const carried = (cart.discountCodes as CartDiscountCode[] | undefined)?.find(
                (d) => d.code.toUpperCase() === promoCode.toUpperCase(),
              );
              if (!carried?.applicable) {
                toast.info(`${promoCode} couldn't be applied to this item, so checkout continues at the regular price.`);
              }
            }
            return formatCheckoutUrl(cart.checkoutUrl);
          } catch (error) {
            console.error("Failed to create standalone checkout:", error);
            toast.error("Couldn't start checkout. Please try again.");
            return null;
          }
        },

        setDeliveryAddress: async (address) => {
          const { cartId } = get();
          if (!cartId) return false;
          set({ isLoading: true });
          try {
            const data = await storefrontApiRequest(CART_DELIVERY_ADDRESSES_REPLACE_MUTATION, {
              cartId,
              addresses: [
                {
                  address: {
                    deliveryAddress: {
                      firstName: address.firstName,
                      lastName: address.lastName,
                      address1: address.address1,
                      ...(address.address2 ? { address2: address.address2 } : {}),
                      city: address.city,
                      provinceCode: address.province,
                      zip: address.zip,
                      countryCode: "IN",
                      ...(address.phone ? { phone: address.phone } : {}),
                    },
                  },
                  selected: true,
                  oneTimeUse: true,
                },
              ],
            });
            const payload = data?.data?.cartDeliveryAddressesReplace;
            const errors: UserError[] = payload?.userErrors ?? [];
            if (isCartNotFoundError(errors)) {
              get().clearCart();
              return false;
            }
            if (reportProblems(errors)) return false;
            const cart = payload?.cart;
            if (!cart) return false;
            applyCart(cart);
            return true;
          } catch (error) {
            console.error("Failed to set delivery address:", error);
            toast.error("Couldn't save this delivery address. Please try again.");
            return false;
          } finally {
            set({ isLoading: false });
          }
        },

        setDeliveryAddressFromSaved: async (customerAddressId) => {
          const { cartId } = get();
          if (!cartId) return false;
          set({ isLoading: true });
          try {
            const data = await storefrontApiRequest(CART_DELIVERY_ADDRESSES_REPLACE_MUTATION, {
              cartId,
              addresses: [
                {
                  address: { copyFromCustomerAddressId: customerAddressId },
                  selected: true,
                  oneTimeUse: false,
                },
              ],
            });
            const payload = data?.data?.cartDeliveryAddressesReplace;
            const errors: UserError[] = payload?.userErrors ?? [];
            if (isCartNotFoundError(errors)) {
              get().clearCart();
              return false;
            }
            if (reportProblems(errors)) return false;
            const cart = payload?.cart;
            if (!cart) return false;
            applyCart(cart);
            return true;
          } catch (error) {
            console.error("Failed to set delivery address from saved address:", error);
            toast.error("Couldn't use this saved address. Please try again.");
            return false;
          } finally {
            set({ isLoading: false });
          }
        },

        /**
         * Full reconciliation with Shopify: lineIds, quantities, discounts,
         * totals. Drops lines whose product was deleted or unpublished.
         */
        syncCustomerCart: async (token) => {
          // Race guard: this function awaits several network calls, and a
          // NEWER sync for a different customer (or a sign-out) can start
          // and finish while an OLDER one for a previous identity is still
          // in flight -- without this, whichever call happens to resolve
          // LAST would win and overwrite the cart with the wrong
          // identity's data, even though it's no longer the active one.
          // `token` is this specific call's identity, captured once at the
          // start; re-checking it against the live getCustomerToken() after
          // every await is what lets a stale call recognize it's stale and
          // bail out before touching any state. Checked at every point
          // that's about to read `get()`'s current state or call `set()`.
          const isStale = () => getCustomerToken() !== token;
          set({ isSyncing: true });
          try {
            let remoteId: string | null = null;
            try {
              remoteId = (await getCustomerCart({ data: { token } })).cartId;
            } catch (error) {
              console.error("Couldn't look up saved bag:", error);
              return;
            }
            if (isStale()) return;
            const local = get();
            if (remoteId && remoteId !== local.cartId) {
              const data = await storefrontApiRequest(ADOPT_CART_QUERY, { id: remoteId });
              if (isStale()) return;
              let remote = data?.data?.cart;
              const remoteHasItems = !!remote && extractLines(remote).valid.length > 0;
              if (remote && remoteHasItems) {
                // Merge anything added on this device before signing in.
                const remoteVariants = new Set(
                  extractLines(remote).valid.map((l) => l.merchandise.id),
                );
                const extra = local.items
                  .filter((i) => !remoteVariants.has(i.variantId))
                  .map((i) => ({ quantity: i.quantity, merchandiseId: i.variantId }));
                if (extra.length) {
                  await storefrontApiRequest(CART_LINES_ADD_MUTATION, { cartId: remoteId, lines: extra });
                  if (isStale()) return;
                  const again = await storefrontApiRequest(ADOPT_CART_QUERY, { id: remoteId });
                  if (isStale()) return;
                  remote = again?.data?.cart ?? remote;
                }
                storefrontApiRequest(CART_BUYER_IDENTITY_UPDATE_MUTATION, {
                  cartId: remoteId,
                  buyerIdentity: currentBuyerIdentity() ?? { customerAccessToken: token, countryCode: "IN" },
                }).catch(() => {});
                if (isStale()) return;
                set({
                  cartId: remote.id,
                  checkoutUrl: formatCheckoutUrl(remote.checkoutUrl),
                  items: itemsFromRemote(remote),
                  discountCodes: remote.discountCodes ?? [],
                  cost: extractCost(remote),
                });
                return;
              }
            }
            // No usable saved bag: this device's bag becomes the account's bag.
            if (isStale()) return;
            const { cartId } = get();
            if (cartId && cartId !== remoteId) {
              saveCustomerCart({ data: { token, cartId } }).catch(() => {});
              storefrontApiRequest(CART_BUYER_IDENTITY_UPDATE_MUTATION, {
                cartId,
                buyerIdentity: currentBuyerIdentity() ?? { customerAccessToken: token, countryCode: "IN" },
              }).catch(() => {});
            }
          } catch (error) {
            console.error("Failed to sync account bag:", error);
          } finally {
            // A stale call must not flip isSyncing back off after a newer
            // call has already started its own sync (would show "not
            // syncing" while the real, current sync is still running).
            if (!isStale()) set({ isSyncing: false });
          }
        },

        syncCart: async () => {
          const { cartId, isSyncing, clearCart } = get();
          if (!cartId || isSyncing) return;
          set({ isSyncing: true });
          try {
            const data = await storefrontApiRequest(CART_QUERY, { id: cartId });
            if (!data) return;
            const cart = data?.data?.cart;
            if (!cart) {
              clearCart();
              return;
            }
            const { valid, orphaned } = extractLines(cart);
            if (valid.length === 0) {
              if (get().items.length > 0 && orphaned.length > 0) {
                toast.error("A product in your bag is no longer available and was removed.");
              }
              clearCart();
              return;
            }
            const { dropped } = applyCart(cart);
            if (orphaned.length > 0 || dropped > 0) {
              toast.error("A product in your bag is no longer available and was removed.");
              await removeOrphans(cartId, orphaned);
            }
          } catch (error) {
            console.error("Failed to sync cart with Shopify:", error);
          } finally {
            set({ isSyncing: false });
          }
        },
      };
    },
    {
      name: "shopify-cart",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        items: state.items,
        cartId: state.cartId,
        checkoutUrl: state.checkoutUrl,
        discountCodes: state.discountCodes,
        cost: state.cost,
        deliveryAddress: state.deliveryAddress,
      }),
    },
  ),
);

/**
 * Single visibility rule for every customized cart line (Buy Now, Add to
 * Cart, single products and gift sets all pass through addItem): only
 * "Printing Method" stays customer-visible. Every other key gets a leading
 * "_", which Shopify checkout treats as a private line property -- still
 * stored on the order for staff and the paid-order PDF webhook.
 */
const CUSTOMER_VISIBLE_LINE_ATTRIBUTES = new Set(["Printing Method"]);
function toCheckoutLineAttributes(attrs: Array<{ key: string; value: string }>) {
  return attrs.map((a) =>
    CUSTOMER_VISIBLE_LINE_ATTRIBUTES.has(a.key) || a.key.startsWith("_") ? a : { ...a, key: `_${a.key}` },
  );
}
