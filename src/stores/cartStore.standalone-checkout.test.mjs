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

// Captures toast.error calls so the new "!cart with no userErrors" fix
// (createStandaloneCheckout used to return null here with ZERO feedback)
// can be asserted on directly, not just "it didn't throw".
let toastErrorCalls = [];
mock.module("sonner", {
  namedExports: {
    toast: {
      error: (message) => { toastErrorCalls.push(message); },
      success: () => {},
      warning: () => {},
      info: () => {},
    },
  },
});

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
let simulateNullCart = false;
let lastCartCreateLines = null;

mock.module("@/lib/shopify", {
  namedExports: {
    storefrontApiRequest: async (query, variables) => {
      if (query.includes("mutation cartCreate")) {
        cartCreateCallCount++;
        lastCartCreateLines = variables.input.lines;
        const line = variables.input.lines[0];
        if (simulateNullCart) {
          // Models a cartCreate response with no userErrors AND no cart --
          // the one silent gap createStandaloneCheckout used to have.
          return { data: { cartCreate: { cart: null, userErrors: [], warnings: [] } } };
        }
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

test("Buy Now with 8 unrelated products already in the cart: checkout line is only the selected product, and the existing 8 are completely untouched", async () => {
  // Literal acceptance scenario from "Fix Buy Now Checkout Including
  // Previous Cart Items" -- products.$slug.tsx's own Buy Now button used
  // to add the clicked variant to THIS SAME persistent cart and check out
  // the whole thing (prepareCheckout()), so every one of these 8 other
  // items would have ended up on the checkout too. Fixed by switching
  // that button to call this same createStandaloneCheckout the
  // ProductCustomizer's Buy Now already used correctly.
  const existingItems = Array.from({ length: 8 }, (_, i) => ({
    lineId: `gid://shopify/CartLine/existing-${i}`,
    product: { node: PRODUCT_NODE },
    variantId: `gid://shopify/ProductVariant/existing-${i}`,
    variantTitle: `Existing ${i}`,
    price: { amount: "100", currencyCode: "INR" },
    quantity: 1,
    selectedOptions: [],
  }));
  useCartStore.setState({
    cartId: "gid://shopify/Cart/persistent-many",
    items: existingItems,
    checkoutUrl: "https://example.com/checkout/persistent-many",
    discountCodes: [],
    cost: { subtotal: { amount: "800", currencyCode: "INR" }, total: { amount: "800", currencyCode: "INR" } },
  });

  nextCreatedCartId = "gid://shopify/Cart/standalone-buynow";
  lastCartCreateLines = null;
  const url = await useCartStore.getState().createStandaloneCheckout(
    buyNowItem({ variantId: "gid://shopify/ProductVariant/just-this-one", quantity: 3 }),
  );

  assert.ok(url);
  // Exactly one line was sent to Shopify, for exactly the clicked variant
  // and quantity -- never the 8 other products.
  assert.equal(lastCartCreateLines.length, 1);
  assert.equal(lastCartCreateLines[0].merchandiseId, "gid://shopify/ProductVariant/just-this-one");
  assert.equal(lastCartCreateLines[0].quantity, 3);
  // The regular cart -- all 8 existing items, cartId, checkoutUrl -- is
  // byte-identical to before Buy Now was clicked.
  const state = useCartStore.getState();
  assert.equal(state.cartId, "gid://shopify/Cart/persistent-many");
  assert.deepEqual(state.items, existingItems);
  assert.equal(state.items.length, 8);
  assert.equal(state.checkoutUrl, "https://example.com/checkout/persistent-many");
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

test("a cartCreate response with no userErrors and no cart now shows a toast instead of failing silently", async () => {
  useCartStore.setState({ cartId: null, items: [], checkoutUrl: null, discountCodes: [], cost: { subtotal: null, total: null } });
  toastErrorCalls = [];
  simulateNullCart = true;
  try {
    nextCreatedCartId = "gid://shopify/Cart/standalone-6";
    const url = await useCartStore.getState().createStandaloneCheckout(buyNowItem());
    assert.equal(url, null);
    assert.deepEqual(toastErrorCalls, ["Couldn't start checkout. Please try again."]);
  } finally {
    simulateNullCart = false;
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
