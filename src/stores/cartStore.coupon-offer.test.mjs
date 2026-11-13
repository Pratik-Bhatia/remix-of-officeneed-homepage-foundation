// Cart coupon offer: conflict-checked apply, confirmed replace (with restore),
// Shopify per-line allocations, buyer-scoped previews. Shopify is replaced by
// a small fake discount engine (eligible variants per code, non-combinable
// codes, one-use-per-customer) -- the store must only ever READ its answers.
//
// Run with: npx tsx --test --experimental-test-module-mocks src/stores/cartStore.coupon-offer.test.mjs
import { test, mock, beforeEach } from "node:test";
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

let customerToken = null;
mock.module("@/lib/customer", { namedExports: { getCustomerToken: () => customerToken } });
mock.module("sonner", { namedExports: { toast: { error() {}, success() {}, warning() {}, info() {} } } });
mock.module("@/lib/meta-pixel", { namedExports: { trackAddToCart: () => {}, trackInitiateCheckout: () => {} } });
mock.module("@/lib/attribution", { namedExports: { appendAttribution: (url) => url, getAttribution: () => ({}) } });
let saveCustomerCartCalls = 0;
mock.module("@/lib/customer-cart.functions", {
  namedExports: { getCustomerCart: async () => ({ cartId: null }), saveCustomerCart: async () => { saveCustomerCartCalls++; return { ok: true }; } },
});

// ---- fake Shopify discount engine ---------------------------------------
const V_BAG = "gid://shopify/ProductVariant/bag";        // OFFICENEED10 collection
const V_PERFUME = "gid://shopify/ProductVariant/perfume"; // OFFICENEED20 collection
const V_PAPER = "gid://shopify/ProductVariant/paper";    // no promotion
const PRICE = { [V_BAG]: 1249, [V_PERFUME]: 2000, [V_PAPER]: 300 };
const ELIGIBLE = { OFFICENEED10: new Set([V_BAG]), OFFICENEED20: new Set([V_PERFUME]) };
const PCT = { OFFICENEED10: 0.1, OFFICENEED20: 0.2 };
const COMBINABLE = new Set(["FREESHIP"]); // a code that combines with anything, applies to nothing per-line
let usedByCustomer = new Set();
const money = (n) => ({ amount: n.toFixed(2), currencyCode: "INR" });

function evaluate(codes, lines) {
  const promo = codes.filter((c) => PCT[c] && !usedByCustomer.has(c) && lines.some((l) => ELIGIBLE[c].has(l.id)));
  let winner = null, best = -1; // non-combinable: Shopify applies at most one
  for (const c of promo) {
    const s = lines.filter((l) => ELIGIBLE[c].has(l.id)).reduce((t, l) => t + PRICE[l.id] * l.qty * PCT[c], 0);
    if (s > best) { best = s; winner = c; }
  }
  return {
    discountCodes: codes.map((c) => ({ code: c, applicable: c === winner || COMBINABLE.has(c) })),
    lineNodes: lines.map((l) => {
      const sub = PRICE[l.id] * l.qty;
      const alloc = winner && ELIGIBLE[winner].has(l.id) ? sub * PCT[winner] : 0;
      return {
        id: `line-${l.id}`, quantity: l.qty,
        merchandise: { id: l.id, image: null },
        cost: { subtotalAmount: money(sub), totalAmount: money(sub - alloc) },
        discountAllocations: alloc ? [{ code: winner, discountedAmount: money(alloc) }] : [],
      };
    }),
  };
}

let realCart = null; // { id, codes, lines:[{id, qty}] }
let calls = { update: 0, preview: 0 };
let lastPreviewInput = null;
function cartPayload() {
  const ev = evaluate(realCart.codes, realCart.lines);
  const sub = ev.lineNodes.reduce((t, n) => t + parseFloat(n.cost.totalAmount.amount), 0);
  return {
    id: realCart.id, checkoutUrl: "https://checkout.officeneed.store/cart/c/x", totalQuantity: 1,
    discountCodes: ev.discountCodes,
    cost: { subtotalAmount: money(sub), totalAmount: money(sub) },
    buyerIdentity: null, delivery: { addresses: [] },
    lines: { edges: ev.lineNodes.map((node) => ({ node })) },
  };
}

mock.module("@/lib/shopify", {
  namedExports: {
    storefrontApiRequest: async (query, variables) => {
      if (query.includes("mutation couponCartPreview")) {
        calls.preview++;
        lastPreviewInput = variables.input;
        const lines = variables.input.lines.map((l) => ({ id: l.merchandiseId, qty: l.quantity }));
        const ev = evaluate(variables.input.discountCodes, lines);
        return { data: { cartCreate: { cart: { discountCodes: ev.discountCodes, lines: { edges: ev.lineNodes.map((node) => ({ node })) } }, userErrors: [] } } };
      }
      if (query.includes("mutation cartDiscountCodesUpdate")) {
        calls.update++;
        realCart.codes = variables.discountCodes;
        return { data: { cartDiscountCodesUpdate: { cart: cartPayload(), userErrors: [], warnings: [] } } };
      }
      throw new Error("unexpected Shopify call in this test: " + query.slice(0, 60));
    },
  },
});

const { useCartStore, couponPreviewScope, summarizeCartPricing, previewCodesOnLines } = await import("./cartStore.ts");
const { useB2BStore } = await import("./b2bStore.ts");

const item = (variantId, quantity = 1, handles = []) => ({
  lineId: `line-${variantId}`, variantId, variantTitle: "Default", quantity, selectedOptions: [],
  price: { amount: String(PRICE[variantId]), currencyCode: "INR" },
  product: { node: { id: `p-${variantId}`, title: variantId.split("/").pop(), handle: variantId.split("/").pop(), collections: { edges: handles.map((h) => ({ node: { handle: h } })) }, images: { edges: [] }, variants: { edges: [] } } },
});

function setup(lines, codes = []) {
  realCart = { id: "gid://shopify/Cart/REAL-1", codes: [...codes], lines: lines.map(([id, qty]) => ({ id, qty })) };
  const payload = cartPayload();
  const byId = Object.fromEntries(payload.lines.edges.map((e) => [e.node.merchandise.id, e.node]));
  useCartStore.setState({
    cartId: realCart.id,
    checkoutUrl: payload.checkoutUrl,
    discountCodes: payload.discountCodes,
    cost: { subtotal: payload.cost.subtotalAmount, total: payload.cost.totalAmount },
    items: lines.map(([id, qty]) => {
      const n = byId[id];
      return {
        ...item(id, qty),
        lineCost: { subtotal: n.cost.subtotalAmount, total: n.cost.totalAmount },
        lineDiscounts: n.discountAllocations.map((a) => ({ code: a.code, amount: a.discountedAmount })),
      };
    }),
  });
  calls = { update: 0, preview: 0 };
  lastPreviewInput = null;
}

beforeEach(() => {
  usedByCustomer = new Set();
  customerToken = null;
  saveCustomerCartCalls = 0;
  useB2BStore.setState({ status: "idle", shoppingMode: "b2c", companyLocationId: null });
});

test("no existing code: OFFICENEED10 applies and the store holds Shopify's per-line allocation and pricing", async () => {
  setup([[V_BAG, 1]]);
  const r = await useCartStore.getState().applyDiscountCodeChecked("officeneed10");
  assert.equal(r.status, "applied");
  const s = useCartStore.getState();
  assert.deepEqual(s.discountCodes, [{ code: "OFFICENEED10", applicable: true }]);
  assert.deepEqual(s.items[0].lineDiscounts, [{ code: "OFFICENEED10", amount: { amount: "124.90", currencyCode: "INR" } }]);
  assert.equal(s.items[0].lineCost.total.amount, "1124.10");
  const p = summarizeCartPricing(s.items, s.cost);
  assert.deepEqual([p.subtotal, p.discount, p.total, p.fromShopifyLines], [1249, 124.9, 1124.1, true]);
  assert.equal(s.cartId, "gid://shopify/Cart/REAL-1", "same cart -- never swapped for a preview cart");
});

test("already applied: reports the applied state without touching the cart", async () => {
  setup([[V_BAG, 1]], ["OFFICENEED10"]);
  const r = await useCartStore.getState().applyDiscountCodeChecked("OFFICENEED10");
  assert.equal(r.status, "already-applied");
  assert.equal(calls.update + calls.preview, 0);
});

test("ineligible-only cart: Shopify says not applicable and the code is not left on the cart", async () => {
  setup([[V_PAPER, 2]]);
  const r = await useCartStore.getState().applyDiscountCodeChecked("OFFICENEED10");
  assert.equal(r.status, "not-applicable");
  assert.deepEqual(useCartStore.getState().discountCodes, []);
});

test("conflict: another non-combinable code is applied -> returns both Shopify savings and does NOT change the cart", async () => {
  setup([[V_BAG, 1], [V_PERFUME, 1]], ["OFFICENEED20"]);
  const before = structuredClone(useCartStore.getState().discountCodes);
  const r = await useCartStore.getState().applyDiscountCodeChecked("OFFICENEED10");
  assert.equal(r.status, "conflict");
  assert.deepEqual(r.existing, [{ code: "OFFICENEED20", applicable: true, savings: 400 }]);
  assert.equal(r.candidateSavings, 124.9);
  assert.equal(calls.update, 0, "the real cart was not modified");
  assert.deepEqual(useCartStore.getState().discountCodes, before);
  assert.deepEqual(realCart.codes, ["OFFICENEED20"]);
});

test("replace after confirmation: OFFICENEED20 -> OFFICENEED10, and back again", async () => {
  setup([[V_BAG, 1], [V_PERFUME, 1]], ["OFFICENEED20"]);
  let r = await useCartStore.getState().replaceDiscountCode("OFFICENEED10");
  assert.equal(r.status, "applied");
  assert.deepEqual(realCart.codes, ["OFFICENEED10"]);
  assert.equal(useCartStore.getState().items.find((i) => i.variantId === V_BAG).lineDiscounts[0].amount.amount, "124.90");
  r = await useCartStore.getState().replaceDiscountCode("OFFICENEED20");
  assert.equal(r.status, "applied");
  assert.deepEqual(realCart.codes, ["OFFICENEED20"]);
});

test("replace that Shopify rejects restores the previous code -- the shopper never ends up worse off", async () => {
  setup([[V_PERFUME, 1]], ["OFFICENEED20"]);
  const r = await useCartStore.getState().replaceDiscountCode("OFFICENEED10"); // no bag in cart -> not applicable
  assert.equal(r.status, "not-applicable");
  assert.match(r.message, /previous discount was kept/);
  assert.deepEqual(realCart.codes, ["OFFICENEED20"]);
  assert.deepEqual(useCartStore.getState().discountCodes, [{ code: "OFFICENEED20", applicable: true }]);
});

test("combinable codes are added without a confirmation (nothing is replaced)", async () => {
  setup([[V_BAG, 1]], ["FREESHIP"]);
  const r = await useCartStore.getState().applyDiscountCodeChecked("OFFICENEED10");
  assert.equal(r.status, "applied");
  assert.deepEqual(realCart.codes.sort(), ["FREESHIP", "OFFICENEED10"]);
});

test("one use per customer: a customer who already used OFFICENEED20 is told so, nothing is applied", async () => {
  usedByCustomer.add("OFFICENEED20");
  setup([[V_PERFUME, 1]]);
  const r = await useCartStore.getState().applyDiscountCodeChecked("OFFICENEED20");
  assert.equal(r.status, "not-applicable");
  assert.match(r.message, /already been used on your account/);
  assert.deepEqual(useCartStore.getState().discountCodes, []);
});

test("a manual code that conflicts also goes through confirmation (no silent stacking)", async () => {
  setup([[V_BAG, 1], [V_PERFUME, 1]], ["OFFICENEED10"]);
  const r = await useCartStore.getState().applyDiscountCodeChecked("  officeneed20 ");
  assert.equal(r.status, "conflict");
  assert.equal(r.code, "OFFICENEED20");
  assert.equal(calls.update, 0);
});

test("previews run under the shopper's B2B identity and never touch the real cart or the saved cart", async () => {
  customerToken = "tok-b2b";
  useB2BStore.setState({ status: "b2b", shoppingMode: "b2b", companyLocationId: "gid://shopify/CompanyLocation/9" });
  setup([[V_BAG, 25]]);
  const p = await previewCodesOnLines(["OFFICENEED10"], [{ variantId: V_BAG, quantity: 25 }]);
  assert.equal(p.status, "ok");
  assert.equal(lastPreviewInput.buyerIdentity.companyLocationId, "gid://shopify/CompanyLocation/9");
  assert.equal(lastPreviewInput.buyerIdentity.customerAccessToken, "tok-b2b");
  assert.equal(useCartStore.getState().cartId, "gid://shopify/Cart/REAL-1");
  assert.equal(saveCustomerCartCalls, 0);
});

test("preview scope changes with sign-in, account and Personal/Business mode", () => {
  const guest = couponPreviewScope();
  customerToken = "tok-a";
  const a = couponPreviewScope();
  customerToken = "tok-b";
  const b = couponPreviewScope();
  useB2BStore.setState({ status: "b2b", shoppingMode: "b2b", companyLocationId: "gid://shopify/CompanyLocation/9" });
  const biz = couponPreviewScope();
  useB2BStore.setState({ shoppingMode: "b2c" });
  const personal = couponPreviewScope();
  assert.equal(new Set([guest, a, b, biz]).size, 4);
  assert.equal(personal, b, "switching back to Personal returns to the personal scope");
  assert.ok(!a.includes("tok-a"), "the token itself never appears in the cache key");
});

test("L3: before per-line pricing arrives, the summary shows Shopify's cart subtotal and NO derived discount", () => {
  const items = [item(V_BAG, 2)]; // catalogue 2 x 1249 = 2498, Shopify says 2248.20 (e.g. B2B price)
  const p = summarizeCartPricing(items, { subtotal: money(2248.2), total: money(2248.2) });
  assert.equal(p.fromShopifyLines, false);
  assert.equal(p.discount, 0, "a catalogue-vs-Shopify price gap is never shown as a discount");
  assert.equal(p.subtotal, 2248.2);
  assert.equal(p.total, 2248.2);
});
