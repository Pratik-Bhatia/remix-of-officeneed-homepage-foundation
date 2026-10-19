// Regression tests for the self-correcting quantity-rule retry added after
// a REAL production failure: Buy Now for H935 ("5-in-1 Corporate Gift
// Set") was rejected by an actual Shopify cart mutation with
// `MINIMUM_NOT_MET -- "This item has a minimum of 25."`, even though our
// own read of ProductVariant.quantityRule (via a plain product() query,
// with and without @inContext/buyerIdentity.countryCode -- all tested live
// this session) never reflects H935's real, catalog-scoped minimum of 25.
// That read-based value is therefore only ever a BASELINE -- see
// variantMinimumQuantity's comment in cartStore.ts. This file asserts the
// actual fix: when Shopify's own mutation reveals the real rule via a
// CartUserError, cartStore.ts parses it, retries exactly once with the
// corrected quantity, and remembers it (quantityRuleOverrides) so later
// attempts for that variant use the right number from the start.
//
// Run with: npx tsx --test --experimental-test-module-mocks src/stores/cartStore.quantity-rule-self-correct.test.mjs
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

// Controllable (not a fixed null) so the scoping test below can simulate
// a signed-in buyer -- currentBuyerIdentity() in cartStore.ts treats a
// null token as always-anonymous.
let mockCustomerToken = null;
mock.module("@/lib/customer", { namedExports: { getCustomerToken: () => mockCustomerToken } });

const warnCalls = [];
const errorCalls = [];
mock.module("sonner", {
  namedExports: {
    toast: {
      error: (m) => errorCalls.push(m),
      success: () => {},
      warning: (m) => warnCalls.push(m),
      info: () => {},
    },
  },
});
mock.module("@/lib/customer-cart.functions", {
  namedExports: {
    getCustomerCart: async () => ({ cartId: null }),
    saveCustomerCart: async () => ({ ok: true }),
  },
});
mock.module("@/lib/meta-pixel", { namedExports: { trackAddToCart: () => {}, trackInitiateCheckout: () => {} } });
mock.module("@/lib/attribution", { namedExports: { appendAttribution: (url) => url, getAttribution: () => ({}) } });

let cartCreateCallCount = 0;
let cartCreateAttemptedQuantities = [];
// Controls how the mock responds to each successive cartCreate attempt --
// set per test. `null` means "always succeed".
let rejectUntilQuantityAtLeast = null;
// Simulates a persistent failure that quantity correction can never
// resolve (e.g. the line is rejected for some other unrelated reason that
// just happens to also report MINIMUM_NOT_MET) -- every attempt, at any
// quantity, is rejected with the exact same message.
let alwaysRejectMinimumNotMet = false;

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

let cartIdCounter = 0;
let lastCartLinesAddLines = null;
let lastCartLinesUpdateLines = null;
let cartLinesAddCallCount = 0;
let cartLinesUpdateCallCount = 0;

mock.module("@/lib/shopify", {
  namedExports: {
    storefrontApiRequest: async (query, variables) => {
      if (query.includes("mutation cartCreate")) {
        cartCreateCallCount++;
        const requestedQty = variables.input.lines[0].quantity;
        cartCreateAttemptedQuantities.push(requestedQty);
        if (alwaysRejectMinimumNotMet) {
          return {
            data: {
              cartCreate: {
                cart: null,
                userErrors: [{ field: ["lines", "0", "quantity"], message: "This item has a minimum of 25.", code: "MINIMUM_NOT_MET" }],
                warnings: [],
              },
            },
          };
        }
        if (rejectUntilQuantityAtLeast !== null && requestedQty < rejectUntilQuantityAtLeast) {
          return {
            data: {
              cartCreate: {
                cart: null,
                userErrors: [{ field: ["lines", "0", "quantity"], message: `This item has a minimum of ${rejectUntilQuantityAtLeast}.`, code: "MINIMUM_NOT_MET" }],
                warnings: [],
              },
            },
          };
        }
        cartIdCounter++;
        const id = `gid://shopify/Cart/test-${cartIdCounter}`;
        return { data: { cartCreate: { cart: cartPayload(id, variables.input.lines), userErrors: [], warnings: [] } } };
      }
      if (query.includes("mutation cartLinesAdd")) {
        cartLinesAddCallCount++;
        const requestedQty = variables.lines[0].quantity;
        lastCartLinesAddLines = variables.lines;
        if (rejectUntilQuantityAtLeast !== null && requestedQty < rejectUntilQuantityAtLeast) {
          return {
            data: {
              cartLinesAdd: {
                cart: null,
                userErrors: [{ field: ["lines", "0", "quantity"], message: `This item has a minimum of ${rejectUntilQuantityAtLeast}.`, code: "MINIMUM_NOT_MET" }],
                warnings: [],
              },
            },
          };
        }
        return { data: { cartLinesAdd: { cart: cartPayload(variables.cartId, variables.lines), userErrors: [], warnings: [] } } };
      }
      if (query.includes("mutation cartLinesUpdate")) {
        cartLinesUpdateCallCount++;
        const requestedQty = variables.lines[0].quantity;
        lastCartLinesUpdateLines = variables.lines;
        if (rejectUntilQuantityAtLeast !== null && requestedQty < rejectUntilQuantityAtLeast) {
          return {
            data: {
              cartLinesUpdate: {
                cart: null,
                userErrors: [{ field: ["lines", "0", "quantity"], message: `This item has a minimum of ${rejectUntilQuantityAtLeast}.`, code: "MINIMUM_NOT_MET" }],
                warnings: [],
              },
            },
          };
        }
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

const { useCartStore, quantityRuleScopeKey } = await import("@/stores/cartStore");
const { useB2BStore } = await import("@/stores/b2bStore");

// H935's own real shape: our READ of quantityRule shows minimum: 1 (the
// baseline that under-reports the real, catalog-scoped rule -- confirmed
// live this session), but the real Shopify mutation enforces 25.
function h935Product(overrides = {}) {
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
              id: "gid://shopify/ProductVariant/935-real",
              quantityRule: { increment: 1, minimum: 1, maximum: null },
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

test("createStandaloneCheckout (Buy Now): a real MINIMUM_NOT_MET rejection is parsed and retried once, succeeding at the corrected quantity", async () => {
  const product = h935Product({ id: "gid://shopify/ProductVariant/935-buynow" });
  rejectUntilQuantityAtLeast = 25;
  cartCreateAttemptedQuantities = [];
  warnCalls.length = 0;
  errorCalls.length = 0;

  const url = await useCartStore.getState().createStandaloneCheckout(itemFor(product, 1));

  assert.ok(url, "the retry must succeed and still return a checkout URL -- this is the literal H935 production bug");
  assert.deepEqual(cartCreateAttemptedQuantities, [1, 25], "first attempt at the UI's requested 1, exactly one retry at Shopify's own revealed minimum of 25");
  assert.equal(errorCalls.length, 0, "a successful self-correction must never surface as a user-facing error");
  assert.ok(warnCalls.some((m) => m.includes("25")), "the shopper must be told their quantity was adjusted, honestly naming the real number");

  // Scoped by buyer context (anonymous here, since getCustomerToken() is
  // mocked to null) -- see quantityRuleScopeKey in cartStore.ts.
  const key = `gid://shopify/ProductVariant/935-buynow::${quantityRuleScopeKey(null)}`;
  const override = useCartStore.getState().quantityRuleOverrides[key];
  assert.equal(override?.minimum, 25, "Shopify's own revealed minimum must be remembered for this variant, scoped to this (anonymous) buyer context");
});

test("addItem (brand-new cart): the same MINIMUM_NOT_MET self-correction applies to cartCreate", async () => {
  useCartStore.setState({ cartId: null, items: [], checkoutUrl: null, discountCodes: [], cost: { subtotal: null, total: null }, quantityRuleOverrides: {} });
  const product = h935Product({ id: "gid://shopify/ProductVariant/935-addcart" });
  rejectUntilQuantityAtLeast = 25;
  cartCreateAttemptedQuantities = [];

  await useCartStore.getState().addItem(itemFor(product, 1));

  assert.deepEqual(cartCreateAttemptedQuantities, [1, 25]);
  assert.equal(useCartStore.getState().items[0]?.quantity, 25, "the cart item's own stored quantity must reflect what Shopify actually accepted, not the original request");
});

test("addItem (existing cart, cartLinesAdd branch): the same self-correction applies", async () => {
  useCartStore.setState({
    cartId: "gid://shopify/Cart/existing-self-correct",
    items: [{ lineId: "gid://shopify/CartLine/other", product: h935Product({ id: "gid://shopify/ProductVariant/other-sc" }), variantId: "gid://shopify/ProductVariant/other-sc", variantTitle: "Other", price: { amount: "100", currencyCode: "INR" }, quantity: 2, selectedOptions: [] }],
    checkoutUrl: "https://example.com/checkout/existing-self-correct",
    discountCodes: [],
    cost: { subtotal: null, total: null },
    quantityRuleOverrides: {},
  });
  const product = h935Product({ id: "gid://shopify/ProductVariant/935-cartlinesadd" });
  rejectUntilQuantityAtLeast = 25;
  lastCartLinesAddLines = null;

  await useCartStore.getState().addItem(itemFor(product, 1));

  assert.equal(lastCartLinesAddLines[0].quantity, 25, "cartLinesAdd's own retry must have been sent the corrected quantity");
});

test("updateQuantity: a MINIMUM_NOT_MET rejection on an existing line is parsed and retried once", async () => {
  lineIdToVariantId.set("gid://shopify/CartLine/935-update", "gid://shopify/ProductVariant/935-update");
  useCartStore.setState({
    cartId: "gid://shopify/Cart/existing-update-sc",
    items: [{ lineId: "gid://shopify/CartLine/935-update", product: h935Product({ id: "gid://shopify/ProductVariant/935-update" }), variantId: "gid://shopify/ProductVariant/935-update", variantTitle: "Blue", price: { amount: "500", currencyCode: "INR" }, quantity: 1, selectedOptions: [] }],
    checkoutUrl: "https://example.com/checkout/existing-update-sc",
    discountCodes: [],
    cost: { subtotal: null, total: null },
    quantityRuleOverrides: {},
  });
  rejectUntilQuantityAtLeast = 25;
  lastCartLinesUpdateLines = null;

  // The item's own local quantity is already 1 (set above) -- updateQuantity
  // re-sends whatever quantity the store item currently holds.
  await useCartStore.getState().updateQuantity("gid://shopify/ProductVariant/935-update", 1);

  assert.equal(lastCartLinesUpdateLines[0].quantity, 25);
});

test("the retry never loops a second time -- if Shopify rejects even the corrected quantity, it fails once, honestly, not forever", async () => {
  const product = h935Product({ id: "gid://shopify/ProductVariant/935-stillfails" });
  // Every attempt, at any quantity, is rejected with the same message --
  // simulates the correction genuinely not resolving it. The retry must
  // stop after exactly one extra attempt, never loop a third time.
  alwaysRejectMinimumNotMet = true;
  cartCreateAttemptedQuantities = [];
  errorCalls.length = 0;

  const url = await useCartStore.getState().createStandaloneCheckout(itemFor(product, 1));

  assert.equal(url, null, "a quantity Shopify still rejects after the one retry must fail, not loop or silently succeed");
  assert.deepEqual(cartCreateAttemptedQuantities, [1, 25], "exactly two attempts total -- the original request and exactly one correction, never more");
  assert.ok(errorCalls.length > 0, "a final failure must still surface as a user-facing error");
  alwaysRejectMinimumNotMet = false;
});

test("a mutation that succeeds on the first attempt is never retried at all", async () => {
  const product = h935Product({ id: "gid://shopify/ProductVariant/935-nofailure" });
  rejectUntilQuantityAtLeast = null;
  cartCreateAttemptedQuantities = [];

  const url = await useCartStore.getState().createStandaloneCheckout(itemFor(product, 1));

  assert.ok(url);
  assert.deepEqual(cartCreateAttemptedQuantities, [1], "no retry at all when the first attempt already succeeds");
});

test("a quantity-rule correction learned for one B2B company location is never applied to a different buyer scope in the same tab", async () => {
  // Real root-cause scenario this guards against: H935's minimum of 25 is
  // a genuine B2B company-location-scoped catalog rule (confirmed live
  // this session via Admin API contextualPricing) -- it must never leak
  // into an anonymous/B2C session, or a DIFFERENT company's session, that
  // happens to share the same browser tab afterwards.
  const product = h935Product({ id: "gid://shopify/ProductVariant/935-scoping" });
  rejectUntilQuantityAtLeast = 25;
  cartCreateAttemptedQuantities = [];

  // 1. A signed-in B2B buyer at company location "A" triggers the
  // correction via a real (mocked) MINIMUM_NOT_MET rejection + retry.
  mockCustomerToken = "token-company-a";
  useB2BStore.setState({ status: "b2b", companyLocationId: "gid://shopify/CompanyLocation/A", resolved: true, resolvedForToken: "token-company-a" });
  const urlForA = await useCartStore.getState().createStandaloneCheckout(itemFor(product, 1));
  assert.ok(urlForA, "company A's own corrected purchase must still succeed");
  assert.deepEqual(cartCreateAttemptedQuantities, [1, 25]);

  const keyForA = `gid://shopify/ProductVariant/935-scoping::${quantityRuleScopeKey("gid://shopify/CompanyLocation/A")}`;
  assert.equal(useCartStore.getState().quantityRuleOverrides[keyForA]?.minimum, 25, "company A's own scope must have learned the correction");

  // 2. The SAME browser tab, now anonymous (e.g. the B2B buyer signed
  // out) -- variantMinimumQuantity's baseline floor must come from the
  // plain Storefront-read quantityRule (minimum: 1 on this fixture), NOT
  // from company A's remembered 25, since the anonymous scope key is
  // different and was never written to.
  mockCustomerToken = null;
  useB2BStore.setState({ status: "idle", companyLocationId: null, resolved: true, resolvedForToken: null });
  cartCreateAttemptedQuantities = [];
  rejectUntilQuantityAtLeast = null; // this anonymous buyer's own real rule is "no override" -- qty 1 must succeed as-is.
  const urlAnon = await useCartStore.getState().createStandaloneCheckout(itemFor(product, 1));
  assert.ok(urlAnon);
  assert.deepEqual(cartCreateAttemptedQuantities, [1], "the anonymous scope must send the UI's plain quantity of 1, never company A's remembered 25");

  // 3. A DIFFERENT company (B) must also never read company A's entry.
  mockCustomerToken = "token-company-b";
  useB2BStore.setState({ status: "b2b", companyLocationId: "gid://shopify/CompanyLocation/B", resolved: true, resolvedForToken: "token-company-b" });
  cartCreateAttemptedQuantities = [];
  rejectUntilQuantityAtLeast = null; // company B's own real rule, for this test, is also "no override".
  const urlB = await useCartStore.getState().createStandaloneCheckout(itemFor(product, 1));
  assert.ok(urlB);
  assert.deepEqual(cartCreateAttemptedQuantities, [1], "company B must never read company A's remembered correction either");

  // Reset shared mock state for any tests that might run after this one.
  mockCustomerToken = null;
  useB2BStore.setState({ status: "idle", companyLocationId: null, resolved: true, resolvedForToken: null });
});
