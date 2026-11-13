// Final review fixes: request-order guard + resync, cart-id guard, Bug J
// (removing a code forgets the matching selection), unchecked apply is
// internal, first cart carries Shopify line pricing.
//
// Run with: npx tsx --test --experimental-test-module-mocks src/stores/cartStore.coupon-final.test.mjs
import { test, mock, beforeEach } from "node:test";
import assert from "node:assert/strict";

for (const name of ["localStorage", "sessionStorage"]) {
  if (typeof globalThis[name] === "undefined") {
    const store = new Map();
    globalThis[name] = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k), clear: () => store.clear() };
  }
}
if (typeof globalThis.window === "undefined") {
  globalThis.window = { localStorage: globalThis.localStorage, sessionStorage: globalThis.sessionStorage, addEventListener() {}, removeEventListener() {}, dispatchEvent() {} };
}

mock.module("@/lib/customer", { namedExports: { getCustomerToken: () => null } });
mock.module("sonner", { namedExports: { toast: { error() {}, success() {}, warning() {}, info() {} } } });
mock.module("@/lib/meta-pixel", { namedExports: { trackAddToCart: () => {}, trackInitiateCheckout: () => {} } });
mock.module("@/lib/google-analytics", { namedExports: { trackGoogleAddToCart: () => {}, trackGoogleRemoveFromCart: () => {} } });
mock.module("@/lib/attribution", { namedExports: { appendAttribution: (u) => u, getAttribution: () => ({}), captureAttribution: () => {} } });
mock.module("@/lib/customer-cart.functions", { namedExports: { getCustomerCart: async () => ({ cartId: null }), saveCustomerCart: async () => ({ ok: true }) } });

const V_BAG = "gid://shopify/ProductVariant/bag", V_DIARY = "gid://shopify/ProductVariant/diary", V_PERFUME = "gid://shopify/ProductVariant/perfume";
const PRICE = { [V_BAG]: 1249, [V_DIARY]: 229, [V_PERFUME]: 2000 };
const ELIGIBLE = { OFFICENEED10: new Set([V_BAG, V_DIARY]), OFFICENEED20: new Set([V_PERFUME]) };
const PCT = { OFFICENEED10: 0.1, OFFICENEED20: 0.2 };
const money = (n) => ({ amount: n.toFixed(2), currencyCode: "INR" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let clock = Date.parse("2026-11-13T10:00:00Z");
const carts = new Map();
let lineDelays = {};        // variantId -> ms before the response returns
let processAtResponse = {}; // variantId -> true: Shopify applies the change only when responding (out-of-order processing)
let cartQueries = 0;
let nextCartId = 1;

function payload(id) {
  const c = carts.get(id);
  const promo = c.codes.filter((x) => PCT[x] && c.lines.some((l) => ELIGIBLE[x].has(l.id)));
  const winner = promo[0] ?? null;
  const nodes = c.lines.map((l) => {
    const sub = PRICE[l.id] * l.qty, alloc = winner && ELIGIBLE[winner].has(l.id) ? sub * PCT[winner] : 0;
    return {
      id: `line-${l.id}`, quantity: l.qty, merchandise: { id: l.id, image: null },
      cost: { amountPerQuantity: money(PRICE[l.id]), subtotalAmount: money(sub), totalAmount: money(sub - alloc) },
      discountAllocations: alloc ? [{ code: winner, discountedAmount: money(alloc) }] : [],
    };
  });
  const tot = nodes.reduce((t, n) => t + parseFloat(n.cost.totalAmount.amount), 0);
  // whole-second stamps, like Shopify
  return {
    id, checkoutUrl: `https://checkout.officeneed.store/cart/c/${id.split("/").pop()}`, updatedAt: new Date(Math.floor(clock / 1000) * 1000).toISOString(),
    totalQuantity: 1, discountCodes: c.codes.map((x) => ({ code: x, applicable: x === winner })),
    cost: { subtotalAmount: money(tot), totalAmount: money(tot) }, buyerIdentity: null, delivery: { addresses: [] },
    lines: { edges: nodes.map((node) => ({ node })) },
  };
}

mock.module("@/lib/shopify", {
  namedExports: {
    storefrontApiRequest: async (query, v) => {
      if (query.includes("mutation cartLinesUpdate")) {
        const c = carts.get(v.cartId);
        const u = v.lines[0];
        const vid = u.id.replace(/^line-/, "");
        const applyChange = () => { const l = c.lines.find((x) => x.id === vid); if (l) l.qty = u.quantity; };
        if (!processAtResponse[vid]) applyChange();        // Shopify processes on arrival (normal)
        const snapshot = processAtResponse[vid] ? null : payload(v.cartId);
        await sleep(lineDelays[vid] ?? 0);
        if (processAtResponse[vid]) applyChange();          // processed late (out of send order)
        return { data: { cartLinesUpdate: { cart: snapshot ?? payload(v.cartId), userErrors: [], warnings: [] } } };
      }
      if (query.includes("mutation cartDiscountCodesUpdate")) {
        carts.get(v.cartId).codes = v.discountCodes;
        return { data: { cartDiscountCodesUpdate: { cart: payload(v.cartId), userErrors: [], warnings: [] } } };
      }
      if (query.includes("mutation couponCartPreview")) {
        return { data: { cartCreate: { cart: { discountCodes: v.input.discountCodes.map((x) => ({ code: x, applicable: true })), lines: { edges: [] } }, userErrors: [] } } };
      }
      if (query.includes("mutation cartCreate")) {
        const id = `gid://shopify/Cart/NEW-${nextCartId++}`;
        carts.set(id, { codes: [], lines: v.input.lines.map((l) => ({ id: l.merchandiseId, qty: l.quantity })) });
        return { data: { cartCreate: { cart: payload(id), userErrors: [], warnings: [] } } };
      }
      if (query.includes("query cart(")) { cartQueries++; return { data: { cart: carts.has(v.id) ? payload(v.id) : null } }; }
      throw new Error("unexpected call: " + query.slice(0, 60));
    },
  },
});

const { useCartStore } = await import("./cartStore.ts");
const { useCouponStore } = await import("./couponStore.ts");
const { resetCouponPreviewCache } = await import("../lib/coupon-preview.ts");

const productNode = (vid) => ({ id: `p-${vid}`, title: vid.split("/").pop(), handle: vid.split("/").pop(), collections: { edges: [] }, images: { edges: [] }, variants: { edges: [{ node: { id: vid, title: "D", price: money(PRICE[vid]), availableForSale: true, selectedOptions: [] } }] } });

function setup(id, lines, codes = []) {
  clock += 5000;
  carts.set(id, { codes: [...codes], lines: lines.map(([vid, qty]) => ({ id: vid, qty })) });
  const p = payload(id);
  useCartStore.getState().clearCart();
  useCartStore.setState({
    cartId: id, checkoutUrl: p.checkoutUrl, discountCodes: p.discountCodes, cost: { subtotal: p.cost.subtotalAmount, total: p.cost.totalAmount },
    items: p.lines.edges.map(({ node: n }) => ({
      lineId: n.id, variantId: n.merchandise.id, variantTitle: "D", quantity: n.quantity, selectedOptions: [], price: money(PRICE[n.merchandise.id]),
      product: { node: productNode(n.merchandise.id) },
      lineCost: { subtotal: n.cost.subtotalAmount, total: n.cost.totalAmount, perQuantity: n.cost.amountPerQuantity },
      lineDiscounts: n.discountAllocations.map((a) => ({ code: a.code, amount: a.discountedAmount })),
    })),
  });
}
const qty = (vid) => useCartStore.getState().items.find((i) => i.variantId === vid)?.quantity;

beforeEach(() => {
  lineDelays = {}; processAtResponse = {}; cartQueries = 0;
  resetCouponPreviewCache();
  useCouponStore.getState().resetSession();
});

// ---- request order --------------------------------------------------------
test("a slower, earlier-sent response never overwrites a later-sent one (same second)", async () => {
  setup("gid://shopify/Cart/R1", [[V_BAG, 1], [V_DIARY, 1]]);
  lineDelays = { [V_BAG]: 80, [V_DIARY]: 5 };
  await Promise.all([
    useCartStore.getState().updateQuantity(V_BAG, 2),   // sent first, answers last (snapshot: bag 2, diary 1)
    useCartStore.getState().updateQuantity(V_DIARY, 3), // sent second, answers first (bag 2, diary 3)
  ]);
  assert.equal(qty(V_BAG), 2);
  assert.equal(qty(V_DIARY), 3, "the earlier request's older snapshot (diary 1) was ignored");
});

test("if Shopify processed requests in the opposite order, one resync converges the bag to Shopify's actual cart", async () => {
  setup("gid://shopify/Cart/R2", [[V_BAG, 1], [V_DIARY, 1]]);
  lineDelays = { [V_BAG]: 80, [V_DIARY]: 5 };
  processAtResponse = { [V_BAG]: true, [V_DIARY]: true }; // diary processed before bag
  await Promise.all([useCartStore.getState().updateQuantity(V_BAG, 2), useCartStore.getState().updateQuantity(V_DIARY, 3)]);
  // diary's response (bag still 1) was applied; bag's newer server state arrived with an older send number and was ignored
  await sleep(600); // scheduled resync
  assert.ok(cartQueries >= 1, "a fresh cart read was scheduled after ignoring a response");
  assert.equal(qty(V_BAG), 2);
  assert.equal(qty(V_DIARY), 3);
});

test("sequential quantity changes, removals and discount changes still apply normally", async () => {
  setup("gid://shopify/Cart/R3", [[V_BAG, 1], [V_PERFUME, 1]]);
  await useCartStore.getState().updateQuantity(V_BAG, 2);
  await useCartStore.getState().updateQuantity(V_BAG, 3);
  assert.equal(qty(V_BAG), 3);
  const r = await useCartStore.getState().applyDiscountCodeChecked("OFFICENEED10");
  assert.equal(r.status, "applied");
  assert.equal(useCartStore.getState().items.find((i) => i.variantId === V_BAG).lineDiscounts[0].amount.amount, "374.70");
  await useCartStore.getState().removeDiscountCode("OFFICENEED10");
  assert.deepEqual(useCartStore.getState().discountCodes, []);
});

// ---- cart-id guard ---------------------------------------------------------
test("a response for a cart that was cleared (sign-out) is ignored", async () => {
  setup("gid://shopify/Cart/R4", [[V_BAG, 1]]);
  lineDelays = { [V_BAG]: 60 };
  const pending = useCartStore.getState().updateQuantity(V_BAG, 4);
  await sleep(10);
  useCartStore.getState().clearCart();
  await pending;
  assert.equal(useCartStore.getState().cartId, null);
  assert.deepEqual(useCartStore.getState().items, [], "old cart's items did not reappear");
});

test("a response for the previous cart after the bag switched carts (sign-in adoption) is ignored", async () => {
  setup("gid://shopify/Cart/GUEST", [[V_BAG, 1]]);
  clock += 1000;
  carts.set("gid://shopify/Cart/ACCOUNT", { codes: [], lines: [{ id: V_PERFUME, qty: 1 }] });
  lineDelays = { [V_BAG]: 60 };
  const pending = useCartStore.getState().updateQuantity(V_BAG, 5);
  await sleep(10);
  useCartStore.setState({ cartId: "gid://shopify/Cart/ACCOUNT", items: [{ lineId: "line-x", variantId: V_PERFUME, variantTitle: "D", quantity: 1, selectedOptions: [], price: money(2000), product: { node: productNode(V_PERFUME) } }] });
  await pending;
  assert.equal(useCartStore.getState().cartId, "gid://shopify/Cart/ACCOUNT");
  assert.deepEqual(useCartStore.getState().items.map((i) => i.variantId), [V_PERFUME], "guest cart's late response didn't overwrite the account bag");
});

// ---- Bug J ---------------------------------------------------------------------
test("Bug J: removing a code from the bag forgets the matching product-page selection", async () => {
  setup("gid://shopify/Cart/J1", [[V_BAG, 1]], ["OFFICENEED10"]);
  useCouponStore.getState().select("OFFICENEED10");
  await useCartStore.getState().removeDiscountCode("officeneed10");
  assert.equal(useCouponStore.getState().selectedCode, null);
});

test("Bug J: removing a different code leaves the selection alone", async () => {
  setup("gid://shopify/Cart/J2", [[V_PERFUME, 1]], ["OFFICENEED20"]);
  useCouponStore.getState().select("OFFICENEED10");
  await useCartStore.getState().removeDiscountCode("OFFICENEED20");
  assert.equal(useCouponStore.getState().selectedCode, "OFFICENEED10");
});

test("Bug J: a code Shopify declines during Apply is dropped from the bag WITHOUT forgetting the product-page selection", async () => {
  setup("gid://shopify/Cart/J3", [[V_PERFUME, 1]]); // no OFFICENEED10 item in the bag yet
  useCouponStore.getState().select("OFFICENEED10");
  const r = await useCartStore.getState().applyDiscountCodeChecked("OFFICENEED10");
  assert.equal(r.status, "not-applicable");
  assert.equal(useCouponStore.getState().selectedCode, "OFFICENEED10", "still carried for that product's Add to Cart / Buy Now");
});

// ---- cleanup --------------------------------------------------------------------
test("the unchecked apply is no longer on the public store (every path is conflict-checked)", () => {
  assert.equal(typeof useCartStore.getState().applyDiscountCode, "undefined");
  assert.equal(typeof useCartStore.getState().applyDiscountCodeChecked, "function");
});

test("the first cart created by Add to Cart already carries Shopify's line pricing", async () => {
  useCartStore.getState().clearCart();
  await useCartStore.getState().addItem({ variantId: V_DIARY, variantTitle: "D", quantity: 2, selectedOptions: [], price: money(229), product: { node: productNode(V_DIARY) } });
  const i = useCartStore.getState().items[0];
  assert.ok(useCartStore.getState().cartId?.startsWith("gid://shopify/Cart/NEW-"));
  assert.deepEqual([i.lineCost?.subtotal?.amount, i.lineCost?.total?.amount, i.lineCost?.perQuantity?.amount], ["458.00", "458.00", "229.00"]);
  assert.deepEqual(i.lineDiscounts, []);
});
