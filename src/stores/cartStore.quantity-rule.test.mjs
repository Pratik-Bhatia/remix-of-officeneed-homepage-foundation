// Regression tests for Shopify minimum-order-quantity (quantityRule) sync --
// added to fix H935 ("5-in-1 Corporate Gift Set") showing quantity 1 on the
// live product page even though Shopify has its minimum configured to 25.
//
// cartStore.ts's addItem/createStandaloneCheckout/updateQuantity are the
// actual Shopify mutation call sites shared by the plain PDP, the Product
// Customizer, and the cart drawer/cart page -- these tests assert the floor
// is enforced there too, not just in each caller's own UI stepper (see
// variantMinimumQuantity in cartStore.ts).
//
// Run with: npx tsx --test --experimental-test-module-mocks src/stores/cartStore.quantity-rule.test.mjs
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
mock.module("sonner", {
  namedExports: {
    toast: { error: () => {}, success: () => {}, warning: () => {}, info: () => {} },
  },
});
mock.module("@/lib/customer-cart.functions", {
  namedExports: {
    getCustomerCart: async () => ({ cartId: null }),
    saveCustomerCart: async () => ({ ok: true }),
  },
});
mock.module("@/lib/meta-pixel", { namedExports: { trackAddToCart: () => {}, trackInitiateCheckout: () => {} } });
// cartStore reports add/remove-to-cart to Google Analytics, which injects its
// script into `document` -- absent under node:test. Analytics is not what
// these tests cover, so stub it like meta-pixel above (no production change).
mock.module("@/lib/google-analytics", {
  namedExports: Object.fromEntries(
    ["initGoogleAnalytics", "trackGooglePageView", "trackGoogleViewItem", "trackGoogleViewItemList", "trackGoogleSearch", "trackGoogleAddToCart", "trackGoogleRemoveFromCart", "trackGoogleViewCart", "trackGoogleBeginCheckout", "trackGooglePurchase"].map((n) => [n, () => {}]),
  ),
});
mock.module("@/lib/attribution", { namedExports: { appendAttribution: (url) => url, getAttribution: () => ({}) } });

let lastCartCreateLines = null;
let lastCartLinesAddLines = null;
let lastCartLinesUpdateLines = null;
let cartIdCounter = 0;

// cartLinesUpdate/cartLinesRemove line inputs only carry {id, quantity} --
// never merchandiseId (unlike cartCreate/cartLinesAdd's lineInput) -- so
// this tracks which variant a given line id belongs to, the same way
// Shopify itself does server-side, to build a realistic response for
// those two mutations too.
const lineIdToVariantId = new Map();

function cartPayload(id, lines) {
  return {
    id,
    checkoutUrl: `https://example.com/checkout/${id.split("/").pop()}`,
    totalQuantity: lines.reduce((s, l) => s + l.quantity, 0),
    discountCodes: [],
    cost: { subtotalAmount: { amount: "500", currencyCode: "INR" }, totalAmount: { amount: "500", currencyCode: "INR" } },
    lines: {
      edges: lines.map((l, i) => {
        const lineId = l.id ?? `${id}/line/${i}`;
        const variantId = l.merchandiseId ?? lineIdToVariantId.get(l.id);
        lineIdToVariantId.set(lineId, variantId);
        return { node: { id: lineId, quantity: l.quantity, merchandise: { id: variantId, image: null } } };
      }),
    },
  };
}

mock.module("@/lib/shopify", {
  namedExports: {
    storefrontApiRequest: async (query, variables) => {
      if (query.includes("mutation cartCreate")) {
        lastCartCreateLines = variables.input.lines;
        cartIdCounter++;
        const id = `gid://shopify/Cart/test-${cartIdCounter}`;
        return { data: { cartCreate: { cart: cartPayload(id, variables.input.lines), userErrors: [], warnings: [] } } };
      }
      if (query.includes("mutation cartLinesAdd")) {
        lastCartLinesAddLines = variables.lines;
        return { data: { cartLinesAdd: { cart: cartPayload(variables.cartId, variables.lines), userErrors: [], warnings: [] } } };
      }
      if (query.includes("mutation cartLinesUpdate")) {
        lastCartLinesUpdateLines = variables.lines;
        return { data: { cartLinesUpdate: { cart: cartPayload(variables.cartId, variables.lines), userErrors: [], warnings: [] } } };
      }
      if (query.includes("cartBuyerIdentityUpdate")) {
        return { data: { cartBuyerIdentityUpdate: { cart: null, userErrors: [] } } };
      }
      return { data: {} };
    },
    formatMoney: (amount, currency) => `${currency} ${amount}`,
  },
});

const { useCartStore } = await import("@/stores/cartStore");

// H935's own real shape: a product whose variant carries Shopify's
// configured minimum=25 (see this session's live Admin API probe).
function productWithMinimum(minimum, overrides = {}) {
  return {
    node: {
      id: "gid://shopify/Product/935",
      title: "5-in-1 Corporate Gift Set - H935",
      handle: "5-in-1-corporate-gift-set",
      images: { edges: [] },
      priceRange: { minVariantPrice: { amount: "500", currencyCode: "INR" } },
      variants: {
        edges: [
          {
            node: {
              id: "gid://shopify/ProductVariant/935-blue",
              quantityRule: { increment: 1, minimum, maximum: null },
              ...overrides,
            },
          },
        ],
      },
    },
  };
}

function itemFor(product, quantity, overrides = {}) {
  return {
    product,
    variantId: product.node.variants.edges[0].node.id,
    variantTitle: "Blue",
    price: { amount: "500", currencyCode: "INR" },
    quantity,
    selectedOptions: [],
    ...overrides,
  };
}

test("createStandaloneCheckout (Buy Now) floors a below-minimum quantity to Shopify's configured minimum before sending to Shopify", async () => {
  const product = productWithMinimum(25);
  lastCartCreateLines = null;
  const url = await useCartStore.getState().createStandaloneCheckout(itemFor(product, 1));
  assert.ok(url);
  assert.equal(lastCartCreateLines[0].quantity, 25, "H935's own acceptance case: Buy Now with quantity 1 must actually check out 25");
});

test("createStandaloneCheckout never raises a quantity that is already at or above the minimum", async () => {
  const product = productWithMinimum(25);
  lastCartCreateLines = null;
  await useCartStore.getState().createStandaloneCheckout(itemFor(product, 40));
  assert.equal(lastCartCreateLines[0].quantity, 40);
});

test("addItem (brand-new cart) floors a below-minimum quantity before cartCreate", async () => {
  useCartStore.setState({ cartId: null, items: [], checkoutUrl: null, discountCodes: [], cost: { subtotal: null, total: null } });
  const product = productWithMinimum(25);
  lastCartCreateLines = null;
  await useCartStore.getState().addItem(itemFor(product, 1));
  assert.equal(lastCartCreateLines[0].quantity, 25);
  assert.equal(useCartStore.getState().items[0].quantity, 25, "the store's own item state must reflect the floored quantity, not the requested 1");
});

test("addItem (adding a new line to an existing cart) floors a below-minimum quantity before cartLinesAdd", async () => {
  useCartStore.setState({
    cartId: "gid://shopify/Cart/existing",
    items: [{ lineId: "gid://shopify/CartLine/other", product: productWithMinimum(1, { id: "gid://shopify/ProductVariant/other" }), variantId: "gid://shopify/ProductVariant/other", variantTitle: "Other", price: { amount: "100", currencyCode: "INR" }, quantity: 2, selectedOptions: [] }],
    checkoutUrl: "https://example.com/checkout/existing",
    discountCodes: [],
    cost: { subtotal: null, total: null },
  });
  const product = productWithMinimum(25, { id: "gid://shopify/ProductVariant/935-blue-2" });
  lastCartLinesAddLines = null;
  await useCartStore.getState().addItem(itemFor(product, 1));
  assert.equal(lastCartLinesAddLines[0].quantity, 25);
});

test("a product with no quantityRule at all is completely unaffected -- the universal default (never a hardcoded 1 that changes behaviour)", async () => {
  useCartStore.setState({ cartId: null, items: [], checkoutUrl: null, discountCodes: [], cost: { subtotal: null, total: null } });
  const product = { node: { id: "gid://shopify/Product/plain", title: "Plain Product", handle: "plain-product", images: { edges: [] }, priceRange: { minVariantPrice: { amount: "100", currencyCode: "INR" } }, variants: { edges: [{ node: { id: "gid://shopify/ProductVariant/plain" } }] } } };
  lastCartCreateLines = null;
  await useCartStore.getState().addItem(itemFor(product, 1));
  assert.equal(lastCartCreateLines[0].quantity, 1);
});

test("updateQuantity never lets an existing cart line drop below the variant's configured minimum", async () => {
  const product = productWithMinimum(25, { id: "gid://shopify/ProductVariant/935-blue-3" });
  // This test seeds the cart's item directly via setState (never through
  // cartCreate/cartLinesAdd), so the mock's lineId->variantId tracking
  // needs the same seed for its cartLinesUpdate response to look real.
  lineIdToVariantId.set("gid://shopify/CartLine/935", "gid://shopify/ProductVariant/935-blue-3");
  useCartStore.setState({
    cartId: "gid://shopify/Cart/existing2",
    items: [{ lineId: "gid://shopify/CartLine/935", product, variantId: "gid://shopify/ProductVariant/935-blue-3", variantTitle: "Blue", price: { amount: "500", currencyCode: "INR" }, quantity: 25, selectedOptions: [] }],
    checkoutUrl: "https://example.com/checkout/existing2",
    discountCodes: [],
    cost: { subtotal: null, total: null },
  });
  lastCartLinesUpdateLines = null;
  // The cart drawer's own decrement button asks for 24 (25 - 1) -- the
  // store must refuse to go below 25, not just clamp the display.
  await useCartStore.getState().updateQuantity("gid://shopify/ProductVariant/935-blue-3", 24);
  assert.equal(useCartStore.getState().items[0].quantity, 25, "the optimistic store state must already be clamped back to 25");
  assert.equal(lastCartLinesUpdateLines[0].quantity, 25, "the actual Shopify mutation must never be sent a below-minimum quantity");
});

test("updateQuantity to 0 still removes the line entirely -- removal is never blocked by the minimum", async () => {
  const product = productWithMinimum(25, { id: "gid://shopify/ProductVariant/935-blue-4" });
  useCartStore.setState({
    cartId: "gid://shopify/Cart/existing3",
    items: [{ lineId: "gid://shopify/CartLine/935-4", product, variantId: "gid://shopify/ProductVariant/935-blue-4", variantTitle: "Blue", price: { amount: "500", currencyCode: "INR" }, quantity: 25, selectedOptions: [] }],
    checkoutUrl: "https://example.com/checkout/existing3",
    discountCodes: [],
    cost: { subtotal: null, total: null },
  });
  await useCartStore.getState().updateQuantity("gid://shopify/ProductVariant/935-blue-4", 0);
  assert.equal(useCartStore.getState().items.find((i) => i.variantId === "gid://shopify/ProductVariant/935-blue-4"), undefined, "quantity 0 must still remove the line, not clamp it to the minimum");
});
