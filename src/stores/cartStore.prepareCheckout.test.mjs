// Regression test for prepareCheckout()'s discriminated return shape and
// checkoutFailureMessage() -- added because the function used to return a
// bare `string | null` with no way for a caller to know WHY a null meant
// failure (no cart, not signed in, cart-not-found, a Shopify userError, or
// a thrown exception all looked identical). See cart.tsx/CartDrawer.tsx/
// products.$slug.tsx's handleCheckout(s), which now switch on `.reason`.
//
// Run with: npx tsx --test --experimental-test-module-mocks src/stores/cartStore.prepareCheckout.test.mjs
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

let currentToken = null; // what getCustomerToken() returns
mock.module("@/lib/customer", { namedExports: { getCustomerToken: () => currentToken } });
mock.module("@/lib/meta-pixel", { namedExports: { trackAddToCart: () => {}, trackInitiateCheckout: () => {} } });
mock.module("@/lib/attribution", { namedExports: { appendAttribution: (url) => url, getAttribution: () => ({}) } });

// Controls what the mocked cartBuyerIdentityUpdate mutation returns, per test.
let buyerIdentityUpdateResult = null; // { errors?: [...], cart?: {...} } | "throw"
mock.module("@/lib/shopify", {
  namedExports: {
    storefrontApiRequest: async (query) => {
      if (query.includes("cartAttributesUpdate")) return { data: {} };
      if (query.includes("cartBuyerIdentityUpdate")) {
        if (buyerIdentityUpdateResult === "throw") throw new Error("network down");
        return {
          data: {
            cartBuyerIdentityUpdate: {
              userErrors: buyerIdentityUpdateResult?.errors ?? [],
              cart: buyerIdentityUpdateResult?.cart ?? null,
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

function resetCart(overrides = {}) {
  useCartStore.setState({
    cartId: null,
    items: [],
    checkoutUrl: null,
    discountCodes: [],
    cost: { subtotal: null, total: null },
    ...overrides,
  });
  useB2BStore.setState({ companyLocationId: null });
  currentToken = null;
  buyerIdentityUpdateResult = null;
}

test("prepareCheckout: no cart at all and no stored checkoutUrl -> reason 'no-cart'", async () => {
  resetCart();
  const result = await useCartStore.getState().prepareCheckout();
  assert.deepEqual(result, { url: null, reason: "no-cart" });
});

test("prepareCheckout: no cartId but a stale checkoutUrl is still returned as-is (unchanged existing behavior)", async () => {
  resetCart({ checkoutUrl: "https://example.com/checkout/stale" });
  const result = await useCartStore.getState().prepareCheckout();
  assert.deepEqual(result, { url: "https://example.com/checkout/stale" });
});

test("prepareCheckout: a cart exists but the shopper is a guest (no token) and no checkoutUrl yet -> reason 'no-checkout-url', never 'not signed in'", async () => {
  resetCart({ cartId: "gid://shopify/Cart/1" });
  const result = await useCartStore.getState().prepareCheckout();
  assert.deepEqual(result, { url: null, reason: "no-checkout-url" });
});

test("prepareCheckout: a guest with an existing checkoutUrl succeeds (guest checkout is a normal path)", async () => {
  resetCart({ cartId: "gid://shopify/Cart/1", checkoutUrl: "https://example.com/checkout/1" });
  const result = await useCartStore.getState().prepareCheckout();
  assert.ok(result.url, "guest checkout must still produce a usable url");
  assert.ok(result.url.includes("channel=online_store"));
});

test("prepareCheckout: cartBuyerIdentityUpdate reports cart-not-found -> clears the cart and returns reason 'cart-not-found'", async () => {
  resetCart({ cartId: "gid://shopify/Cart/1" });
  currentToken = "token-abc";
  buyerIdentityUpdateResult = { errors: [{ field: null, message: "Cart does not exist", code: "INVALID" }] };
  const result = await useCartStore.getState().prepareCheckout();
  assert.deepEqual(result, { url: null, reason: "cart-not-found" });
  assert.equal(useCartStore.getState().cartId, null, "cart-not-found must clear the stale local cart");
});

test("prepareCheckout: cartBuyerIdentityUpdate returns some other userError -> falls back to the existing checkoutUrl if one exists", async () => {
  resetCart({ cartId: "gid://shopify/Cart/1", checkoutUrl: "https://example.com/checkout/old" });
  currentToken = "token-abc";
  buyerIdentityUpdateResult = { errors: [{ field: ["buyerIdentity"], message: "Some other error", code: "SOME_ERROR" }] };
  const result = await useCartStore.getState().prepareCheckout();
  assert.deepEqual(result, { url: "https://example.com/checkout/old" });
});

test("prepareCheckout: cartBuyerIdentityUpdate returns some other userError with no prior checkoutUrl -> reason 'user-error'", async () => {
  resetCart({ cartId: "gid://shopify/Cart/1" });
  currentToken = "token-abc";
  buyerIdentityUpdateResult = { errors: [{ field: ["buyerIdentity"], message: "Some other error", code: "SOME_ERROR" }] };
  const result = await useCartStore.getState().prepareCheckout();
  assert.deepEqual(result, { url: null, reason: "user-error" });
});

test("prepareCheckout: success returns a formatted url and refreshes cart cost/items", async () => {
  resetCart({ cartId: "gid://shopify/Cart/1" });
  currentToken = "token-abc";
  buyerIdentityUpdateResult = {
    cart: {
      id: "gid://shopify/Cart/1",
      checkoutUrl: "https://example.com/checkout/1",
      totalQuantity: 1,
      discountCodes: [],
      cost: { subtotalAmount: { amount: "100", currencyCode: "INR" }, totalAmount: { amount: "100", currencyCode: "INR" } },
      lines: { edges: [] },
    },
  };
  const result = await useCartStore.getState().prepareCheckout();
  assert.ok(result.url, "a successful attach must return a real url");
  assert.ok(result.url.startsWith("https://example.com/checkout/1"));
});

test("prepareCheckout: a thrown network error falls back to the existing checkoutUrl if one exists, else reason 'exception'", async () => {
  resetCart({ cartId: "gid://shopify/Cart/1" });
  currentToken = "token-abc";
  buyerIdentityUpdateResult = "throw";
  const withStale = await (async () => {
    useCartStore.setState({ checkoutUrl: "https://example.com/checkout/old" });
    return useCartStore.getState().prepareCheckout();
  })();
  assert.deepEqual(withStale, { url: "https://example.com/checkout/old" });

  useCartStore.setState({ checkoutUrl: null });
  const withoutStale = await useCartStore.getState().prepareCheckout();
  assert.deepEqual(withoutStale, { url: null, reason: "exception" });
});

// --- checkoutFailureMessage() -- the shared wording used by every caller ---

const { checkoutFailureMessage } = await import("@/stores/cartStore");

test("checkoutFailureMessage: every reason maps to a non-empty, honest message (never a raw technical string)", () => {
  for (const reason of ["no-cart", "no-checkout-url", "cart-not-found", "user-error", "exception"]) {
    const message = checkoutFailureMessage(reason);
    assert.equal(typeof message, "string");
    assert.ok(message.length > 0);
  }
});

test("checkoutFailureMessage: 'no-cart' and 'no-checkout-url' share the same empty-bag wording", () => {
  assert.equal(checkoutFailureMessage("no-cart"), checkoutFailureMessage("no-checkout-url"));
});

test("checkoutFailureMessage: 'cart-not-found' has its own distinct, accurate wording", () => {
  const message = checkoutFailureMessage("cart-not-found");
  assert.match(message, /expired/i);
});
