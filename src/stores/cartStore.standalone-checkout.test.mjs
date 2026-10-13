// Regression test for Buy Now's standalone checkout (cartStore.ts's
// createStandaloneCheckout), added to fix abandoned Buy Now checkouts
// leaving an item sitting in the customer's regular persistent cart.
//
// Run with: npx tsx --test --experimental-test-module-mocks src/stores/cartStore.standalone-checkout.test.mjs
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

mock.module("@/lib/customer", { namedExports: { getCustomerToken: () => null } });

let saveCustomerCartCallCount = 0;
mock.module("@/lib/customer-cart.functions", {
  namedExports: {
    getCustomerCart: async () => ({ cartId: null }),
    saveCustomerCart: async () => {
      saveCustomerCartCallCount++;
      return { ok: true };
    },
  },
});

let cartCreateCallCount = 0;
let nextCreatedCartId = "gid://shopify/Cart/standalone-1";
let simulateOutOfStock = false;
let lastCartCreateLines = null;

mock.module("@/lib/shopify", {
  namedExports: {
    storefrontApiRequest: async (query, variables) => {
      if (query.includes("mutation cartCreate")) {
        cartCreateCallCount++;
        lastCartCreateLines = variables.input.lines;
        const line = variables.input.lines[0];
        return {
          data: {
            cartCreate: {
              cart: {
                id: nextCreatedCartId,
                checkoutUrl: `https://example.com/checkout/${nextCreatedCartId.split("/").pop()}`,
                totalQuantity: line.quantity,
                discountCodes: [],
                cost: { subtotalAmount: { amount: "500", currencyCode: "INR" }, totalAmount: { amount: "500", currencyCode: "INR" } },
                lines: {
                  edges: simulateOutOfStock
                    ? []
                    : [
                        {
                          node: {
                            id: `gid://shopify/CartLine/${nextCreatedCartId.split("/").pop()}`,
                            quantity: line.quantity,
                            merchandise: { id: line.merchandiseId, image: null },
                          },
                        },
                      ],
                },
              },
              userErrors: [],
              warnings: [],
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

mock.module("@/lib/meta-pixel", { namedExports: { trackAddToCart: () => {}, trackInitiateCheckout: () => {} } });
mock.module("@/lib/attribution", { namedExports: { appendAttribution: (url) => url, getAttribution: () => ({}) } });

const { useCartStore } = await import("@/stores/cartStore");

const PRODUCT_NODE = {
  id: "gid://shopify/Product/1",
  title: "Corporate Gift Set",
  handle: "corporate-gift-set",
  images: { edges: [] },
  priceRange: { minVariantPrice: { amount: "500", currencyCode: "INR" } },
};

function buyNowItem(overrides = {}) {
  return {
    product: { node: PRODUCT_NODE },
    variantId: "gid://shopify/ProductVariant/1",
    variantTitle: "Default",
    price: { amount: "500", currencyCode: "INR" },
    quantity: 1,
    selectedOptions: [],
    ...overrides,
  };
}

test("createStandaloneCheckout returns a real checkout URL without touching the store's own cartId/items/checkoutUrl", async () => {
  cartCreateCallCount = 0;
  useCartStore.setState({ cartId: null, items: [], checkoutUrl: null, discountCodes: [], cost: { subtotal: null, total: null } });

  const url = await useCartStore.getState().createStandaloneCheckout(buyNowItem());

  assert.ok(url, "expected a checkout URL back");
  assert.match(url, /\/checkout\/standalone-1(\?|$)/);
  assert.equal(cartCreateCallCount, 1);
  const state = useCartStore.getState();
  assert.equal(state.cartId, null, "the persistent cart's own cartId must stay untouched");
  assert.deepEqual(state.items, [], "the persistent cart's own items must stay untouched");
  assert.equal(state.checkoutUrl, null, "the persistent cart's own checkoutUrl must stay untouched");
});

test("an existing persistent cart with real items is completely unchanged after a Buy Now standalone checkout -- the abandoned-checkout scenario", async () => {
  const existingItems = [
    { lineId: "gid://shopify/CartLine/existing", product: { node: PRODUCT_NODE }, variantId: "gid://shopify/ProductVariant/existing", variantTitle: "Existing", price: { amount: "250", currencyCode: "INR" }, quantity: 2, selectedOptions: [] },
  ];
  useCartStore.setState({
    cartId: "gid://shopify/Cart/persistent-1",
    items: existingItems,
    checkoutUrl: "https://example.com/checkout/persistent-1",
    discountCodes: [],
    cost: { subtotal: { amount: "500", currencyCode: "INR" }, total: { amount: "500", currencyCode: "INR" } },
  });

  nextCreatedCartId = "gid://shopify/Cart/standalone-2";
  const url = await useCartStore.getState().createStandaloneCheckout(buyNowItem({ variantId: "gid://shopify/ProductVariant/different" }));

  assert.ok(url);
  const state = useCartStore.getState();
  // This is the exact acceptance test from the task: existing cart, Buy
  // Now, (simulated) abandon -- the regular cart must be byte-identical
  // to before Buy Now was ever clicked, since createStandaloneCheckout
  // never writes to this store's state at all.
  assert.equal(state.cartId, "gid://shopify/Cart/persistent-1");
  assert.deepEqual(state.items, existingItems);
  assert.equal(state.checkoutUrl, "https://example.com/checkout/persistent-1");
});

test("createStandaloneCheckout never saves to the customer's persisted saved-cart record", async () => {
  saveCustomerCartCallCount = 0;
  nextCreatedCartId = "gid://shopify/Cart/standalone-3";
  await useCartStore.getState().createStandaloneCheckout(buyNowItem());
  assert.equal(saveCustomerCartCallCount, 0, "a standalone Buy Now checkout must never be written to customer_carts -- it was never meant to be the customer's remembered cart");
});

test("an out-of-stock variant returns null and still leaves the persistent cart untouched", async () => {
  useCartStore.setState({ cartId: "gid://shopify/Cart/persistent-2", items: [], checkoutUrl: "https://example.com/checkout/persistent-2", discountCodes: [], cost: { subtotal: null, total: null } });
  simulateOutOfStock = true;
  try {
    nextCreatedCartId = "gid://shopify/Cart/standalone-4";
    const url = await useCartStore.getState().createStandaloneCheckout(buyNowItem());
    assert.equal(url, null);
    const state = useCartStore.getState();
    assert.equal(state.cartId, "gid://shopify/Cart/persistent-2");
    assert.equal(state.checkoutUrl, "https://example.com/checkout/persistent-2");
  } finally {
    simulateOutOfStock = false;
  }
});

test("customization line attributes are sent on the standalone cart's own line, not silently dropped", async () => {
  lastCartCreateLines = null;
  nextCreatedCartId = "gid://shopify/Cart/standalone-5";
  await useCartStore.getState().createStandaloneCheckout(
    buyNowItem({ lineAttributes: [{ key: "_Logo File", value: "acme-logo.png" }, { key: "Printing Method", value: "Laser Engraving" }] }),
  );
  assert.ok(lastCartCreateLines, "expected the cartCreate mutation to have been called");
  assert.deepEqual(lastCartCreateLines[0].attributes, [{ key: "_Logo File", value: "acme-logo.png" }, { key: "Printing Method", value: "Laser Engraving" }]);
});
