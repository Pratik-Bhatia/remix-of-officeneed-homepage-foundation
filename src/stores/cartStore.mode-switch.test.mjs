// Unit tests for cartStore.ts's reconcileBuyerIdentity() -- the mid-session
// cart re-pricing step the Personal/Business Shopping mode switcher calls
// right after flipping shoppingMode (see
// src/components/officeneed/ShoppingModeSwitcher.tsx), as distinct from
// prepareCheckout (checkout-time only, unchanged).
//
// Run with: npx tsx --test --experimental-test-module-mocks src/stores/cartStore.mode-switch.test.mjs
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

let mockCustomerToken = "token-reconcile-test";
mock.module("@/lib/customer", { namedExports: { getCustomerToken: () => mockCustomerToken } });
mock.module("sonner", { namedExports: { toast: { error: () => {}, success: () => {}, warning: () => {}, info: () => {} } } });
mock.module("@/lib/customer-cart.functions", {
  namedExports: { getCustomerCart: async () => ({ cartId: null }), saveCustomerCart: async () => ({ ok: true }) },
});
mock.module("@/lib/meta-pixel", { namedExports: { trackAddToCart: () => {}, trackInitiateCheckout: () => {} } });
mock.module("@/lib/attribution", { namedExports: { appendAttribution: (url) => url, getAttribution: () => ({}) } });

let lastBuyerIdentityMutationVars = null;
let buyerIdentityUpdateCallCount = 0;
// Controls what cartBuyerIdentityUpdate's response claims the cart's
// resulting purchasingCompany actually is -- independent of what was
// requested, to simulate Shopify's undocumented clear-vs-omit behavior
// either way (see cartStore.ts's own comment above currentBuyerIdentity).
let respondedLocationId = null;
let simulateCartNotFound = false;
let simulateUserError = false;
let lastCartCreateLines = null;
let cartCreateCallCount = 0;

function cartPayload({ id, lines, locationId }) {
  return {
    id,
    checkoutUrl: `https://example.com/checkout/${id.split("/").pop()}`,
    totalQuantity: lines.reduce((s, l) => s + l.quantity, 0),
    discountCodes: [],
    cost: { subtotalAmount: { amount: "500", currencyCode: "INR" }, totalAmount: { amount: "500", currencyCode: "INR" } },
    buyerIdentity: {
      purchasingCompany: locationId ? { company: { id: "gid://shopify/Company/1" }, location: { id: locationId } } : null,
    },
    lines: {
      edges: lines.map((l, i) => ({
        node: { id: `${id}/line/${i}`, quantity: l.quantity, merchandise: { id: l.merchandiseId ?? l.id, image: null } },
      })),
    },
  };
}

mock.module("@/lib/shopify", {
  namedExports: {
    storefrontApiRequest: async (query, variables) => {
      if (query.includes("mutation cartBuyerIdentityUpdate")) {
        buyerIdentityUpdateCallCount++;
        lastBuyerIdentityMutationVars = variables;
        if (simulateCartNotFound) {
          return { data: { cartBuyerIdentityUpdate: { cart: null, userErrors: [{ field: null, message: "Cart does not exist", code: null }] } } };
        }
        if (simulateUserError) {
          return { data: { cartBuyerIdentityUpdate: { cart: null, userErrors: [{ field: ["buyerIdentity"], message: "Some other error", code: "SOME_ERROR" }] } } };
        }
        return {
          data: {
            cartBuyerIdentityUpdate: {
              cart: cartPayload({ id: variables.cartId, lines: [{ id: "existing-line", quantity: 1 }], locationId: respondedLocationId }),
              userErrors: [],
            },
          },
        };
      }
      if (query.includes("mutation cartCreate")) {
        cartCreateCallCount++;
        lastCartCreateLines = variables.input.lines;
        return {
          data: {
            cartCreate: {
              cart: cartPayload({ id: "gid://shopify/Cart/rebuilt", lines: variables.input.lines, locationId: null }),
              userErrors: [],
              warnings: [],
            },
          },
        };
      }
      return { data: {} };
    },
    formatMoney: (amount, currency) => `${currency} ${amount}`,
  },
});

const { useCartStore } = await import("@/stores/cartStore");
const { useB2BStore } = await import("@/stores/b2bStore");

function existingItem(overrides = {}) {
  return {
    lineId: "gid://shopify/CartLine/existing",
    product: { node: { id: "p", title: "t", handle: "h", images: { edges: [] }, priceRange: { minVariantPrice: { amount: "500", currencyCode: "INR" } }, variants: { edges: [{ node: { id: "gid://shopify/ProductVariant/existing" } }] } } },
    variantId: "gid://shopify/ProductVariant/existing",
    variantTitle: "Default",
    price: { amount: "500", currencyCode: "INR" },
    quantity: 1,
    selectedOptions: [],
    ...overrides,
  };
}

test("no-ops (returns true) when there is no cart at all", async () => {
  useCartStore.setState({ cartId: null, items: [], checkoutUrl: null, discountCodes: [], cost: { subtotal: null, total: null } });
  buyerIdentityUpdateCallCount = 0;
  const result = await useCartStore.getState().reconcileBuyerIdentity();
  assert.equal(result, true);
  assert.equal(buyerIdentityUpdateCallCount, 0, "must not call Shopify at all with no cart");
});

test("no-ops (returns true) when the shopper is anonymous (no customer token)", async () => {
  useCartStore.setState({ cartId: "gid://shopify/Cart/anon", items: [existingItem()], checkoutUrl: "https://example.com/checkout/anon", discountCodes: [], cost: { subtotal: null, total: null } });
  mockCustomerToken = null;
  buyerIdentityUpdateCallCount = 0;
  const result = await useCartStore.getState().reconcileBuyerIdentity();
  assert.equal(result, true);
  assert.equal(buyerIdentityUpdateCallCount, 0);
  mockCustomerToken = "token-reconcile-test";
});

test("sends a buyerIdentity reflecting the CURRENT b2bStore state (Business mode) and applies the returned cost", async () => {
  useB2BStore.setState({ status: "b2b", shoppingMode: "b2b", companyLocationId: "gid://shopify/CompanyLocation/1", resolved: true });
  useCartStore.setState({ cartId: "gid://shopify/Cart/b2b", items: [existingItem()], checkoutUrl: "https://example.com/checkout/b2b", discountCodes: [], cost: { subtotal: null, total: null } });
  respondedLocationId = "gid://shopify/CompanyLocation/1"; // Shopify confirms the attach took.

  const result = await useCartStore.getState().reconcileBuyerIdentity();

  assert.equal(result, true);
  assert.equal(lastBuyerIdentityMutationVars.buyerIdentity.companyLocationId, "gid://shopify/CompanyLocation/1");
  assert.equal(useCartStore.getState().cost.subtotal.amount, "500");
});

test("switching to Personal Shopping omits companyLocationId, and when Shopify's response confirms it actually cleared, the SAME cart is kept (no rebuild)", async () => {
  useB2BStore.setState({ status: "b2b", shoppingMode: "b2c", companyLocationId: "gid://shopify/CompanyLocation/1", resolved: true });
  useCartStore.setState({ cartId: "gid://shopify/Cart/switch-to-b2c", items: [existingItem()], checkoutUrl: "https://example.com/checkout/switch-to-b2c", discountCodes: [], cost: { subtotal: null, total: null } });
  respondedLocationId = null; // Shopify confirms the detach took.
  cartCreateCallCount = 0;

  const result = await useCartStore.getState().reconcileBuyerIdentity();

  assert.equal(result, true);
  assert.equal(lastBuyerIdentityMutationVars.buyerIdentity.companyLocationId, undefined, "Personal Shopping must never send a companyLocationId");
  assert.equal(cartCreateCallCount, 0, "no rebuild needed -- Shopify already confirmed the company cleared");
  assert.equal(useCartStore.getState().cartId, "gid://shopify/Cart/switch-to-b2c", "same cart kept");
});

test("switching to Personal Shopping, but Shopify's response STILL shows the old company -- self-corrects by rebuilding a fresh cart with the same lines", async () => {
  useB2BStore.setState({ status: "b2b", shoppingMode: "b2c", companyLocationId: "gid://shopify/CompanyLocation/1", resolved: true });
  const item = existingItem({ quantity: 3 });
  useCartStore.setState({ cartId: "gid://shopify/Cart/stuck", items: [item], checkoutUrl: "https://example.com/checkout/stuck", discountCodes: [], cost: { subtotal: null, total: null } });
  respondedLocationId = "gid://shopify/CompanyLocation/1"; // Shopify did NOT actually clear it -- the undocumented-behavior case.
  cartCreateCallCount = 0;
  lastCartCreateLines = null;

  const result = await useCartStore.getState().reconcileBuyerIdentity();

  assert.equal(result, true, "the fallback itself must succeed, not just detect the problem");
  assert.equal(cartCreateCallCount, 1, "exactly one fresh cart was built");
  assert.equal(lastCartCreateLines[0].merchandiseId, "gid://shopify/ProductVariant/existing");
  assert.equal(lastCartCreateLines[0].quantity, 3, "the same quantity carried over to the rebuilt cart");
  assert.equal(useCartStore.getState().cartId, "gid://shopify/Cart/rebuilt", "the store now points at the NEW, company-free cart");
});

test("a cart-not-found error clears the cart and still reports success (nothing left to reconcile)", async () => {
  useB2BStore.setState({ status: "b2b", shoppingMode: "b2b", companyLocationId: "gid://shopify/CompanyLocation/1", resolved: true });
  useCartStore.setState({ cartId: "gid://shopify/Cart/gone", items: [existingItem()], checkoutUrl: "https://example.com/checkout/gone", discountCodes: [], cost: { subtotal: null, total: null } });
  simulateCartNotFound = true;

  const result = await useCartStore.getState().reconcileBuyerIdentity();

  assert.equal(result, true);
  assert.equal(useCartStore.getState().cartId, null);
  simulateCartNotFound = false;
});

test("a genuine Shopify userError (not cart-not-found) reports failure", async () => {
  useB2BStore.setState({ status: "b2b", shoppingMode: "b2b", companyLocationId: "gid://shopify/CompanyLocation/1", resolved: true });
  useCartStore.setState({ cartId: "gid://shopify/Cart/err", items: [existingItem()], checkoutUrl: "https://example.com/checkout/err", discountCodes: [], cost: { subtotal: null, total: null } });
  simulateUserError = true;

  const result = await useCartStore.getState().reconcileBuyerIdentity();

  assert.equal(result, false);
  simulateUserError = false;
});
