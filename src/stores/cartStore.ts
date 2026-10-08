import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { toast } from "sonner";
import { storefrontApiRequest, type ShopifyProduct, type ShopifyProductNode, type ShopifyImage } from "@/lib/shopify";
import { getCustomerToken } from "@/lib/customer";
import { useB2BStore } from "@/stores/b2bStore";
import { appendAttribution, getAttribution } from "@/lib/attribution";
import { getCustomerCart, saveCustomerCart } from "@/lib/customer-cart.functions";
import { trackAddToCart } from "@/lib/meta-pixel";

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
}

/** Selected-variant image, falling back to the product's featured image,
 * then its first image -- never the reverse. This is the single place that
 * decides a cart line's thumbnail, so CartDrawer/cart.tsx/CartLineItem all
 * stay in sync by construction. */
function resolveLineImage(variantImage: ShopifyImage | null | undefined, productNode: ShopifyProductNode | undefined): ShopifyImage | null {
  return variantImage ?? productNode?.featuredImage ?? productNode?.images?.edges?.[0]?.node ?? null;
}

export interface CartDiscountCode {
  code: string;
  applicable: boolean;
}

export interface CartCost {
  subtotal: { amount: string; currencyCode: string } | null;
  total: { amount: string; currencyCode: string } | null;
}

/** A one-time delivery address set on the cart for this order only (via
 * cartDeliveryAddressesReplace) -- independent of the B2B Company
 * Location's registered business address, which this never reads from or
 * writes to. See B2BDeliveryAddress.tsx for the UI that collects this. */
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
  mutation cartDiscountCodesUpdate($cartId: ID!, $discountCodes: [String!]) {
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
  const { companyLocationId } = useB2BStore.getState();
  return companyLocationId
    ? { customerAccessToken: token, countryCode: "IN", companyLocationId }
    : { customerAccessToken: token, countryCode: "IN" };
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
    console.error("Shopify cart error:", errors);
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
  /** Attach the signed-in customer to the cart, then return a fresh checkout URL. */
  prepareCheckout: () => Promise<string | null>;
  /** Sets (or replaces) this order's one-time delivery address via
   * cartDeliveryAddressesReplace. Independent of buyerIdentity/B2B pricing
   * and of the Company Location's registered address -- see
   * B2BDeliveryAddress.tsx for the UI that calls this. */
  setDeliveryAddress: (address: DeliveryAddressInput) => Promise<boolean>;
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

      return {
        items: [],
        cartId: null,
        checkoutUrl: null,
        discountCodes: [],
        cost: { subtotal: null, total: null },
        deliveryAddress: null,
        isLoading: false,
        isSyncing: false,

        addItem: async (item) => {
          set({ isLoading: true });
          const qtyBefore = get().items.find((i) => i.variantId === item.variantId)?.quantity ?? 0;
          try {
            const { items, cartId, clearCart } = get();
            const existing = items.find((i) => i.variantId === item.variantId);

            if (!cartId) {
              const buyerIdentity = currentBuyerIdentity();
              const attributes = attributionAttributes();
              const data = await storefrontApiRequest(CART_CREATE_MUTATION, {
                input: {
                  lines: [{ quantity: item.quantity, merchandiseId: item.variantId }],
                  ...(buyerIdentity ? { buyerIdentity } : {}),
                  ...(attributes.length ? { attributes } : {}),
                },
              });
              const payload = data?.data?.cartCreate;
              if (reportProblems(payload?.userErrors ?? [], payload?.warnings ?? [])) return;
              const cart = payload?.cart;
              if (!cart) return;
              const { valid } = extractLines(cart);
              const line = valid.find((l) => l.merchandise.id === item.variantId);
              if (!line) {
                toast.error("Sorry, this item is out of stock.");
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
              const newQty = existing.quantity + item.quantity;
              const data = await storefrontApiRequest(CART_LINES_UPDATE_MUTATION, {
                cartId,
                lines: [{ id: existing.lineId, quantity: newQty }],
              });
              const payload = data?.data?.cartLinesUpdate;
              const errors: UserError[] = payload?.userErrors ?? [];
              if (isCartNotFoundError(errors)) { clearCart(); return; }
              if (reportProblems(errors, payload?.warnings ?? [])) return;
              if (payload?.cart) applyCart(payload.cart);
            } else {
              const data = await storefrontApiRequest(CART_LINES_ADD_MUTATION, {
                cartId,
                lines: [{ quantity: item.quantity, merchandiseId: item.variantId }],
              });
              const payload = data?.data?.cartLinesAdd;
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
                toast.error("Sorry, this item is out of stock.");
                return;
              }
              set({ items: [...get().items, { ...item, lineId: line.id, quantity: line.quantity, image: resolveLineImage(line.merchandise.image, item.product?.node) }] });
              applyCart(cart);
            }
          } catch (error) {
            console.error("Failed to add item:", error);
            toast.error("Couldn't add this item to your bag. Please try again.");
          } finally {
            set({ isLoading: false });
            // Only fire once Shopify has actually accepted the line.
            const qtyAfter = get().items.find((i) => i.variantId === item.variantId)?.quantity ?? 0;
            if (qtyAfter > qtyBefore) {
              trackAddToCart({
                variantId: item.variantId,
                name: item.product.node.title,
                price: parseFloat(item.price.amount),
                currency: item.price.currencyCode,
                quantity: qtyAfter - qtyBefore,
              });
            }
          }
        },

        updateQuantity: async (variantId, quantity) => {
          if (quantity <= 0) {
            await get().removeItem(variantId);
            return;
          }
          set({
            isLoading: true,
            items: get().items.map((i) => (i.variantId === variantId ? { ...i, quantity } : i)),
          });
          await enqueue(variantId, async () => {
            const { items, cartId, clearCart } = get();
            const item = items.find((i) => i.variantId === variantId);
            if (!item?.lineId || !cartId) {
              set({ isLoading: false });
              return;
            }
            try {
              const data = await storefrontApiRequest(CART_LINES_UPDATE_MUTATION, {
                cartId,
                lines: [{ id: item.lineId, quantity: item.quantity }],
              });
              const payload = data?.data?.cartLinesUpdate;
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
          if (!cartId) return checkoutUrl;
          // Record attribution on the cart so it shows on the Shopify order.
          const attributes = attributionAttributes();
          if (attributes.length) {
            storefrontApiRequest(CART_ATTRIBUTES_UPDATE_MUTATION, { cartId, attributes }).catch(() => {});
          }
          const buyerIdentity = currentBuyerIdentity();
          if (!buyerIdentity) return checkoutUrl ? formatCheckoutUrl(checkoutUrl) : null;
          try {
            const data = await storefrontApiRequest(CART_BUYER_IDENTITY_UPDATE_MUTATION, {
              cartId,
              buyerIdentity,
            });
            const errors: UserError[] = data?.data?.cartBuyerIdentityUpdate?.userErrors ?? [];
            if (isCartNotFoundError(errors)) { clearCart(); return null; }
            if (errors.length > 0) {
              console.error("Buyer identity update failed:", errors);
              return checkoutUrl;
            }
            const updatedCart = data?.data?.cartBuyerIdentityUpdate?.cart;
            const url = updatedCart?.checkoutUrl;
            if (!url) return checkoutUrl;
            // Refresh cost/items now, not just checkoutUrl: attaching a
            // companyLocationId can change Shopify's computed price for
            // this cart, and the old behavior (only storing checkoutUrl)
            // left the visible subtotal/total stale until the next
            // syncCart() -- right before checkout is exactly the moment
            // that staleness mattered most.
            applyCart(updatedCart);
            const formatted = formatCheckoutUrl(url);
            return formatted;
          } catch (error) {
            console.error("Failed to attach customer to cart:", error);
            return checkoutUrl;
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

        /**
         * Full reconciliation with Shopify: lineIds, quantities, discounts,
         * totals. Drops lines whose product was deleted or unpublished.
         */
        syncCustomerCart: async (token) => {
          set({ isSyncing: true });
          try {
            let remoteId: string | null = null;
            try {
              remoteId = (await getCustomerCart({ data: { token } })).cartId;
            } catch (error) {
              console.error("Couldn't look up saved bag:", error);
              return;
            }
            const local = get();
            if (remoteId && remoteId !== local.cartId) {
              const data = await storefrontApiRequest(ADOPT_CART_QUERY, { id: remoteId });
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
                  const again = await storefrontApiRequest(ADOPT_CART_QUERY, { id: remoteId });
                  remote = again?.data?.cart ?? remote;
                }
                storefrontApiRequest(CART_BUYER_IDENTITY_UPDATE_MUTATION, {
                  cartId: remoteId,
                  buyerIdentity: currentBuyerIdentity() ?? { customerAccessToken: token, countryCode: "IN" },
                }).catch(() => {});
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
            set({ isSyncing: false });
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
