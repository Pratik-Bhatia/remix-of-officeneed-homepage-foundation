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

mock.module("@/lib/customer-cart.functions", {
  namedExports: {
    getCustomerCart: async ({ data: { token } }) => {
      const delay = getCustomerCartDelayMs[token] ?? 0;
      if (delay) await new Promise((r) => setTimeout(r, delay));
      const cartId = token === "token-A" ? "gid://shopify/Cart/AAA" : "gid://shopify/Cart/BBB";
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
