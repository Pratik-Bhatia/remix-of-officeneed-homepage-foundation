import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { storefrontApiRequest, type ShopifyProduct } from "@/lib/shopify";

export interface CartItem {
  lineId: string | null;
  product: ShopifyProduct;
  variantId: string;
  variantTitle: string;
  price: { amount: string; currencyCode: string };
  quantity: number;
  selectedOptions: Array<{ name: string; value: string }>;
}

const CART_LINE_FIELDS = `
  id
  quantity
  merchandise {
    ... on ProductVariant {
      id
    }
  }
`;

const FULL_CART_FIELDS = `
  id
  checkoutUrl
  totalQuantity
  lines(first: 100) {
    edges {
      node {
        id
        quantity
        merchandise {
          ... on ProductVariant {
            id
          }
        }
      }
    }
  }
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
    cartCreate(input: $input) {
      cart { ${FULL_CART_FIELDS} }
      userErrors { field message }
    }
  }
`;

const CART_LINES_ADD_MUTATION = `
  mutation cartLinesAdd($cartId: ID!, $lines: [CartLineInput!]!) {
    cartLinesAdd(cartId: $cartId, lines: $lines) {
      cart { ${FULL_CART_FIELDS} }
      userErrors { field message }
    }
  }
`;

const CART_LINES_UPDATE_MUTATION = `
  mutation cartLinesUpdate($cartId: ID!, $lines: [CartLineUpdateInput!]!) {
    cartLinesUpdate(cartId: $cartId, lines: $lines) {
      cart { ${FULL_CART_FIELDS} }
      userErrors { field message }
    }
  }
`;

const CART_LINES_REMOVE_MUTATION = `
  mutation cartLinesRemove($cartId: ID!, $lineIds: [ID!]!) {
    cartLinesRemove(cartId: $cartId, lineIds: $lineIds) {
      cart { ${FULL_CART_FIELDS} }
      userErrors { field message }
    }
  }
`;

function formatCheckoutUrl(checkoutUrl: string): string {
  try {
    const url = new URL(checkoutUrl);
    url.searchParams.set("channel", "online_store");
    return url.toString();
  } catch {
    return checkoutUrl;
  }
}

type UserError = { field: string[] | null; message: string };
type ShopifyLine = { id: string; quantity: number; merchandise: { id: string } };

function isCartNotFoundError(userErrors: UserError[]): boolean {
  return userErrors.some(
    (e) =>
      e.message.toLowerCase().includes("cart not found") ||
      e.message.toLowerCase().includes("does not exist"),
  );
}

/** Extract line objects from a Shopify cart response */
function extractLines(cart: any): ShopifyLine[] {
  return (cart?.lines?.edges ?? []).map((e: any) => e.node as ShopifyLine);
}

/**
 * Merge Shopify-confirmed line data (lineId, quantity) into local CartItem array.
 * Items missing from Shopify are dropped; quantities are updated to match Shopify.
 */
function reconcileItems(localItems: CartItem[], shopifyLines: ShopifyLine[]): CartItem[] {
  const lineMap = new Map<string, ShopifyLine>();
  for (const line of shopifyLines) {
    lineMap.set(line.merchandise.id, line);
  }
  return localItems
    .filter((item) => lineMap.has(item.variantId))
    .map((item) => {
      const sl = lineMap.get(item.variantId)!;
      return { ...item, lineId: sl.id, quantity: sl.quantity };
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
  isLoading: boolean;
  isSyncing: boolean;
  addItem: (item: Omit<CartItem, "lineId">) => Promise<void>;
  updateQuantity: (variantId: string, quantity: number) => Promise<void>;
  removeItem: (variantId: string) => Promise<void>;
  clearCart: () => void;
  syncCart: () => Promise<void>;
  getCheckoutUrl: () => string | null;
}

export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => ({
      items: [],
      cartId: null,
      checkoutUrl: null,
      isLoading: false,
      isSyncing: false,

      addItem: async (item) => {
        set({ isLoading: true });
        try {
          const { items, cartId, clearCart } = get();
          const existing = items.find((i) => i.variantId === item.variantId);

          if (!cartId) {
            // ── Create brand-new Shopify cart ─────────────────────────────
            const data = await storefrontApiRequest(CART_CREATE_MUTATION, {
              input: { lines: [{ quantity: item.quantity, merchandiseId: item.variantId }] },
            });
            const errors: UserError[] = data?.data?.cartCreate?.userErrors ?? [];
            if (errors.length > 0) { console.error("Cart creation failed:", errors); return; }
            const cart = data?.data?.cartCreate?.cart;
            if (!cart) return;
            const lines = extractLines(cart);
            const lineId = lines.find((l) => l.merchandise.id === item.variantId)?.id ?? null;
            set({
              cartId: cart.id,
              checkoutUrl: formatCheckoutUrl(cart.checkoutUrl),
              items: [{ ...item, lineId }],
            });

          } else if (existing) {
            // ── Increment existing line ───────────────────────────────────
            if (!existing.lineId) return;
            const newQty = existing.quantity + item.quantity;
            const data = await storefrontApiRequest(CART_LINES_UPDATE_MUTATION, {
              cartId,
              lines: [{ id: existing.lineId, quantity: newQty }],
            });
            const errors: UserError[] = data?.data?.cartLinesUpdate?.userErrors ?? [];
            if (isCartNotFoundError(errors)) { clearCart(); return; }
            if (errors.length > 0) { console.error("Update failed:", errors); return; }
            const cart = data?.data?.cartLinesUpdate?.cart;
            if (!cart) return;
            set({ items: reconcileItems(get().items, extractLines(cart)) });

          } else {
            // ── Add new line to existing cart ─────────────────────────────
            const data = await storefrontApiRequest(CART_LINES_ADD_MUTATION, {
              cartId,
              lines: [{ quantity: item.quantity, merchandiseId: item.variantId }],
            });
            const errors: UserError[] = data?.data?.cartLinesAdd?.userErrors ?? [];
            if (isCartNotFoundError(errors)) { clearCart(); return; }
            if (errors.length > 0) { console.error("Add line failed:", errors); return; }
            const cart = data?.data?.cartLinesAdd?.cart;
            if (!cart) return;
            const lines = extractLines(cart);
            const lineId = lines.find((l) => l.merchandise.id === item.variantId)?.id ?? null;
            set({ items: [...get().items, { ...item, lineId }] });
          }
        } catch (error) {
          console.error("Failed to add item:", error);
        } finally {
          set({ isLoading: false });
        }
      },

      updateQuantity: async (variantId, quantity) => {
        if (quantity <= 0) {
          await get().removeItem(variantId);
          return;
        }
        // Optimistic update for instant UI feedback
        set({
          isLoading: true,
          items: get().items.map((i) =>
            i.variantId === variantId ? { ...i, quantity } : i,
          ),
        });
        // Queue mutations per-variant to prevent race conditions on rapid clicks
        await enqueue(variantId, async () => {
          const { items, cartId, clearCart } = get();
          const item = items.find((i) => i.variantId === variantId);
          if (!item?.lineId || !cartId) return;
          try {
            const data = await storefrontApiRequest(CART_LINES_UPDATE_MUTATION, {
              cartId,
              lines: [{ id: item.lineId, quantity: item.quantity }],
            });
            const errors: UserError[] = data?.data?.cartLinesUpdate?.userErrors ?? [];
            if (isCartNotFoundError(errors)) { clearCart(); return; }
            if (errors.length > 0) { console.error("Update failed:", errors); return; }
            const cart = data?.data?.cartLinesUpdate?.cart;
            if (!cart) return;
            // Confirm with Shopify-authoritative data
            set({ items: reconcileItems(get().items, extractLines(cart)) });
          } catch (error) {
            console.error("Failed to update quantity:", error);
          } finally {
            set({ isLoading: false });
          }
        });
      },

      removeItem: async (variantId) => {
        const { items, cartId, clearCart } = get();
        const item = items.find((i) => i.variantId === variantId);
        if (!item?.lineId || !cartId) return;

        // Optimistic removal
        set({
          isLoading: true,
          items: items.filter((i) => i.variantId !== variantId),
        });
        try {
          const data = await storefrontApiRequest(CART_LINES_REMOVE_MUTATION, {
            cartId,
            lineIds: [item.lineId],
          });
          const errors: UserError[] = data?.data?.cartLinesRemove?.userErrors ?? [];
          if (isCartNotFoundError(errors)) { clearCart(); return; }
          if (errors.length > 0) { console.error("Remove failed:", errors); return; }
          const cart = data?.data?.cartLinesRemove?.cart;
          if (!cart) return;
          const shopifyLines = extractLines(cart);
          if (shopifyLines.length === 0) {
            clearCart();
          } else {
            set({ items: reconcileItems(get().items, shopifyLines) });
          }
        } catch (error) {
          console.error("Failed to remove item:", error);
        } finally {
          set({ isLoading: false });
        }
      },

      clearCart: () => set({ items: [], cartId: null, checkoutUrl: null }),
      getCheckoutUrl: () => get().checkoutUrl,

      /**
       * Full reconciliation: fetch actual Shopify cart data and update local
       * lineIds + quantities. Called when the cart drawer opens.
       */
      syncCart: async () => {
        const { cartId, isSyncing, clearCart } = get();
        if (!cartId || isSyncing) return;
        set({ isSyncing: true });
        try {
          const data = await storefrontApiRequest(CART_QUERY, { id: cartId });
          if (!data) return;
          const cart = data?.data?.cart;
          if (!cart) {
            // Cart expired or was completed on Shopify
            clearCart();
            return;
          }
          const shopifyLines = extractLines(cart);
          if (shopifyLines.length === 0) {
            clearCart();
            return;
          }
          // Update lineIds and quantities from Shopify-authoritative data
          const reconciled = reconcileItems(get().items, shopifyLines);
          set({
            items: reconciled,
            checkoutUrl: formatCheckoutUrl(cart.checkoutUrl),
          });
        } catch (error) {
          console.error("Failed to sync cart with Shopify:", error);
        } finally {
          set({ isSyncing: false });
        }
      },
    }),
    {
      name: "shopify-cart",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        items: state.items,
        cartId: state.cartId,
        checkoutUrl: state.checkoutUrl,
      }),
    },
  ),
);
