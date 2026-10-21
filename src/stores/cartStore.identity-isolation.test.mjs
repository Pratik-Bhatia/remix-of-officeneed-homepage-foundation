// Regression test for the cart identity-isolation fix in
// src/hooks/useCartSync.ts and src/stores/cartStore.ts's syncCustomerCart.
//
// Run with: npx tsx --test --experimental-test-module-mocks src/stores/cartStore.identity-isolation.test.mjs
// (Node's built-in test runner + module mocking -- no new dependency added
// to the project for this.)
//
// What this guards against: a signed-in customer's local cart being
// silently inherited by a DIFFERENT customer who signs in without an
// intermediate sign-out (officeneed_customer_token is one shared
// localStorage key, so this is reachable e.g. across two browser tabs),
// and a slower, now-stale in-flight cart sync for an OLDER identity
// overwriting state after a NEWER identity has already signed in and its
// own (faster) sync has already applied.
import { test, mock } from "node:test";
import assert from "node:assert/strict";

if (typeof globalThis.localStorage === "undefined") {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  };
}
if (typeof globalThis.window === "undefined") {
  globalThis.window = { localStorage: globalThis.localStorage, addEventListener() {}, removeEventListener() {}, dispatchEvent() {} };
}

let currentToken = null; // what getCustomerToken() returns -- flipped mid-test to simulate a newer sign-in
let getCustomerCartDelayMs = {};

mock.module("@/lib/customer", {
  namedExports: { getCustomerToken: () => currentToken },
});

// Real Shopify sign-ins issue a fresh customerAccessToken string every
// time, even for the exact same person signing back in -- but the
// server-side saved-cart lookup (customer_carts in Supabase, see
// src/lib/customer-cart.functions.ts) is keyed by the CUSTOMER ID that
// token resolves to, not the token string itself. This map models that:
// several different token strings can belong to the same real customer.
const TOKEN_TO_CUSTOMER = {
  "token-A": "customer-A",
  "token-B": "customer-B",
  "token-A-second-signin": "customer-A", // same person, re-logged-in token
};
const CUSTOMER_SAVED_CART = {
  "customer-A": "gid://shopify/Cart/AAA",
  "customer-B": "gid://shopify/Cart/BBB",
};

mock.module("@/lib/customer-cart.functions", {
  namedExports: {
    getCustomerCart: async ({ data: { token } }) => {
      const delay = getCustomerCartDelayMs[token] ?? 0;
      if (delay) await new Promise((r) => setTimeout(r, delay));
      const customer = TOKEN_TO_CUSTOMER[token];
      const cartId = customer ? (CUSTOMER_SAVED_CART[customer] ?? null) : "gid://shopify/Cart/BBB"; // unmapped tokens fall back to B's cart, matching every earlier test's assumption
      return { cartId };
    },
    saveCustomerCart: async () => ({ ok: true }),
  },
});

mock.module("@/lib/shopify", {
  namedExports: {
    storefrontApiRequest: async (query, variables) => {
      if (query.includes("adoptCart")) {
        return {
          data: {
            cart: {
              id: variables.id,
              checkoutUrl: "https://example.com/checkout",
              totalQuantity: 1,
              discountCodes: [],
              cost: { subtotalAmount: { amount: "100", currencyCode: "INR" }, totalAmount: { amount: "100", currencyCode: "INR" } },
              lines: {
                edges: [
                  {
                    node: {
                      id: `gid://shopify/CartLine/${variables.id.split("/").pop()}`,
                      quantity: 1,
                      merchandise: {
                        id: "gid://shopify/ProductVariant/1",
                        title: "Test Variant",
                        price: { amount: "100", currencyCode: "INR" },
                        selectedOptions: [],
                        image: null,
                        product: {
                          id: "gid://shopify/Product/1",
                          title: "Test Product",
                          handle: "test-product",
                          images: { edges: [] },
                        },
                      },
                    },
                  },
                ],
              },
            },
          },
        };
      }
      if (query.includes("cartBuyerIdentityUpdate")) {
        return { data: { cartBuyerIdentityUpdate: { cart: null, userErrors: [] } } };
      }
      return { data: {} };
    },
    formatMoney: (amount, currency) => `${currency} ${amount}`,
  },
});

mock.module("@/lib/meta-pixel", {
  namedExports: { trackAddToCart: () => {}, trackInitiateCheckout: () => {} },
});
mock.module("@/lib/attribution", {
  namedExports: { appendAttribution: (url) => url, getAttribution: () => ({}) },
});

const { useCartStore } = await import("@/stores/cartStore");

test("stale (slower) sync for an older identity must not overwrite a newer identity's cart", async () => {
  useCartStore.setState({ cartId: null, items: [], checkoutUrl: null, discountCodes: [], cost: { subtotal: null, total: null } });
  getCustomerCartDelayMs = { "token-A": 80, "token-B": 0 };

  currentToken = "token-A";
  const syncA = useCartStore.getState().syncCustomerCart("token-A"); // in flight, slow

  currentToken = "token-B"; // B signs in before A's sync has resolved
  const syncB = useCartStore.getState().syncCustomerCart("token-B"); // fast

  await Promise.all([syncA, syncB]);

  const finalCartId = useCartStore.getState().cartId;
  assert.equal(finalCartId, "gid://shopify/Cart/BBB", `Expected B's cart to win, got ${finalCartId}`);
  assert.equal(useCartStore.getState().isSyncing, false, "isSyncing must settle to false, not get stuck true by the stale call's finally block");
});

test("non-stale sync still applies normally when no race occurs", async () => {
  useCartStore.setState({ cartId: null, items: [], checkoutUrl: null, discountCodes: [], cost: { subtotal: null, total: null } });
  getCustomerCartDelayMs = { "token-A": 0 };
  currentToken = "token-A";
  await useCartStore.getState().syncCustomerCart("token-A");
  assert.equal(useCartStore.getState().cartId, "gid://shopify/Cart/AAA");
});

test("the SAME customer signing out and back in (a fresh token string, same real identity) restores THEIR OWN cart -- not a leak, the correct outcome", async () => {
  // This is the exact scenario from the live bug report: sign in, add an
  // item, sign out, sign back in with the same email/password. Shopify
  // issues a different token string each sign-in, but it's still the
  // same real customer -- so getCustomerCart correctly returns the SAME
  // saved cart both times, via TOKEN_TO_CUSTOMER above mapping both
  // tokens to "customer-A". Seeing the item again here is proof the
  // system correctly reunited one person with their own cart, not proof
  // of a cross-customer leak (which the earlier race/switch tests above
  // already cover and guard against).
  useCartStore.setState({ cartId: null, items: [], checkoutUrl: null, discountCodes: [], cost: { subtotal: null, total: null } });
  getCustomerCartDelayMs = {};

  currentToken = "token-A";
  await useCartStore.getState().syncCustomerCart("token-A");
  assert.equal(useCartStore.getState().cartId, "gid://shopify/Cart/AAA", "first sign-in picks up the saved cart");

  // Sign out: useCartSync.ts's own clearCart() on token -> null is exercised
  // in the live app, not inside syncCustomerCart itself -- simulated directly
  // here since this test targets the store layer.
  useCartStore.getState().clearCart();
  currentToken = null;
  assert.equal(useCartStore.getState().cartId, null, "signing out clears the local cart");

  // Sign back in as the SAME person -- a fresh token, same customer.
  currentToken = "token-A-second-signin";
  await useCartStore.getState().syncCustomerCart("token-A-second-signin");
  assert.equal(useCartStore.getState().cartId, "gid://shopify/Cart/AAA", "re-signing in as the SAME customer must restore their own cart");
});
