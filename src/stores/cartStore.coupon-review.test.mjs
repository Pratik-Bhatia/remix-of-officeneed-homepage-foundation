// Production-readiness fixes: H2 line display, L1 stale responses + ordering,
// L5 one-discount-change-at-a-time, conflict-check request savings, M2 guest
// code on sign-in, L6 identity helpers. Shopify is a fake discount engine
// (eligible variants per code, non-combinable, updatedAt stamps).
//
// Run with: npx tsx --test --experimental-test-module-mocks src/stores/cartStore.coupon-review.test.mjs
import { test, mock, beforeEach } from "node:test";
import assert from "node:assert/strict";

for (const name of ["localStorage", "sessionStorage"]) {
  if (typeof globalThis[name] === "undefined") {
    const store = new Map();
    globalThis[name] = {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
      clear: () => store.clear(),
    };
  }
}
if (typeof globalThis.window === "undefined") {
  globalThis.window = { localStorage: globalThis.localStorage, sessionStorage: globalThis.sessionStorage, addEventListener() {}, removeEventListener() {}, dispatchEvent() {} };
}

let customerToken = null;
mock.module("@/lib/customer", { namedExports: { getCustomerToken: () => customerToken } });
const toasts = [];
mock.module("sonner", { namedExports: { toast: { error: (m) => toasts.push(["error", m]), success: (m) => toasts.push(["success", m]), warning: (m) => toasts.push(["warning", m]), info: (m) => toasts.push(["info", m]) } } });
mock.module("@/lib/meta-pixel", { namedExports: { trackAddToCart: () => {}, trackInitiateCheckout: () => {} } });
mock.module("@/lib/attribution", { namedExports: { appendAttribution: (url) => url, getAttribution: () => ({}), captureAttribution: () => {} } });
let savedCartId = null;
mock.module("@/lib/customer-cart.functions", {
  namedExports: { getCustomerCart: async () => ({ cartId: savedCartId }), saveCustomerCart: async () => ({ ok: true }) },
});

// ---- fake Shopify ----------------------------------------------------------
const V_BAG = "gid://shopify/ProductVariant/bag", V_PERFUME = "gid://shopify/ProductVariant/perfume";
const PRICE = { [V_BAG]: 1249, [V_PERFUME]: 2000 };
const ELIGIBLE = { OFFICENEED10: new Set([V_BAG]), OFFICENEED20: new Set([V_PERFUME]) };
const PCT = { OFFICENEED10: 0.1, OFFICENEED20: 0.2 };
const money = (n) => ({ amount: n.toFixed(2), currencyCode: "INR" });
let clock = Date.parse("2026-11-13T10:00:00Z");
const carts = new Map();
let events = [];
let previews = 0;
let lineUpdateDelay = 0;
let staleSyncFor = null; // cart id whose next `query cart` returns an OLD snapshot

function evaluate(codes, lines) {
  const promo = codes.filter((c) => PCT[c] && lines.some((l) => ELIGIBLE[c].has(l.id)));
  let winner = null, best = -1;
  for (const c of promo) {
    const s = lines.filter((l) => ELIGIBLE[c].has(l.id)).reduce((t, l) => t + PRICE[l.id] * l.qty * PCT[c], 0);
    if (s > best) { best = s; winner = c; }
  }
  return {
    discountCodes: codes.map((c) => ({ code: c, applicable: c === winner })),
    nodes: lines.map((l) => {
      const sub = PRICE[l.id] * l.qty, alloc = winner && ELIGIBLE[winner].has(l.id) ? sub * PCT[winner] : 0;
      return {
        id: `line-${l.id}`, quantity: l.qty,
        merchandise: {
          id: l.id, title: "Default", price: money(PRICE[l.id]), selectedOptions: [], image: null,
          product: { id: `p-${l.id}`, title: l.id.split("/").pop(), handle: l.id.split("/").pop(), description: "", productType: "", vendor: "",
            priceRange: { minVariantPrice: money(PRICE[l.id]) }, images: { edges: [] }, collections: { edges: [] } },
        },
        cost: { amountPerQuantity: money(PRICE[l.id]), subtotalAmount: money(sub), totalAmount: money(sub - alloc) },
        discountAllocations: alloc ? [{ code: winner, discountedAmount: money(alloc) }] : [],
      };
    }),
  };
}
function payload(id, stamp) {
  const c = carts.get(id);
  const ev = evaluate(c.codes, c.lines);
  const tot = ev.nodes.reduce((t, n) => t + parseFloat(n.cost.totalAmount.amount), 0);
  return {
    id, checkoutUrl: `https://checkout.officeneed.store/cart/c/${id.split("/").pop()}`, updatedAt: new Date(stamp ?? c.stamp).toISOString(),
    totalQuantity: 1, discountCodes: ev.discountCodes, cost: { subtotalAmount: money(tot), totalAmount: money(tot) },
    buyerIdentity: null, delivery: { addresses: [] }, lines: { edges: ev.nodes.map((node) => ({ node })) },
  };
}
const touch = (id) => { clock += 1000; carts.get(id).stamp = clock; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

mock.module("@/lib/shopify", {
  namedExports: {
    storefrontApiRequest: async (query, v) => {
      if (query.includes("mutation couponCartPreview")) {
        previews++;
        const ev = evaluate(v.input.discountCodes, v.input.lines.map((l) => ({ id: l.merchandiseId, qty: l.quantity })));
        return { data: { cartCreate: { cart: { discountCodes: ev.discountCodes, lines: { edges: ev.nodes.map((node) => ({ node })) } }, userErrors: [] } } };
      }
      if (query.includes("mutation cartDiscountCodesUpdate")) {
        events.push("discount:start");
        carts.get(v.cartId).codes = v.discountCodes; touch(v.cartId);
        return { data: { cartDiscountCodesUpdate: { cart: payload(v.cartId), userErrors: [], warnings: [] } } };
      }
      if (query.includes("mutation cartLinesUpdate")) {
        events.push("lines:start");
        await sleep(lineUpdateDelay);
        const c = carts.get(v.cartId);
        for (const u of v.lines) { const l = c.lines.find((x) => `line-${x.id}` === u.id); if (l) l.qty = u.quantity; }
        touch(v.cartId);
        events.push("lines:end");
        return { data: { cartLinesUpdate: { cart: payload(v.cartId), userErrors: [], warnings: [] } } };
      }
      if (query.includes("mutation cartLinesAdd")) {
        const c = carts.get(v.cartId);
        for (const l of v.lines) c.lines.push({ id: l.merchandiseId, qty: l.quantity });
        touch(v.cartId);
        return { data: { cartLinesAdd: { cart: payload(v.cartId), userErrors: [], warnings: [] } } };
      }
      if (query.includes("query adoptCart")) return { data: { cart: carts.has(v.id) ? payload(v.id) : null } };
      if (query.includes("query cart(")) {
        if (staleSyncFor === v.id) { staleSyncFor = null; return { data: { cart: { ...payload(v.id, carts.get(v.id).stamp - 60000), discountCodes: [] } } }; }
        return { data: { cart: payload(v.id) } };
      }
      if (query.includes("mutation cartBuyerIdentityUpdate")) return { data: { cartBuyerIdentityUpdate: { cart: payload(v.cartId), userErrors: [] } } };
      throw new Error("unexpected call: " + query.slice(0, 60));
    },
  },
});

const { useCartStore, getLineDisplay } = await import("./cartStore.ts");
const { resolveSavings, resetCouponPreviewCache } = await import("../lib/coupon-preview.ts");
const { couponPreviewScope, previewCodesOnLines } = await import("./cartStore.ts");
const { useCouponStore } = await import("./couponStore.ts");
const { isCustomerTokenStorageChange } = await import("../hooks/useCartSync.ts");

function setup(id, lines, codes = []) {
  clock += 1000;
  carts.set(id, { codes: [...codes], lines: lines.map(([vid, qty]) => ({ id: vid, qty })), stamp: clock });
  const p = payload(id);
  useCartStore.getState().clearCart();
  useCartStore.setState({
    cartId: id, checkoutUrl: p.checkoutUrl, discountCodes: p.discountCodes,
    cost: { subtotal: p.cost.subtotalAmount, total: p.cost.totalAmount },
    items: p.lines.edges.map(({ node: n }) => ({
      lineId: n.id, variantId: n.merchandise.id, variantTitle: "Default", quantity: n.quantity, selectedOptions: [],
      price: n.merchandise.price, product: { node: { ...n.merchandise.product, variants: { edges: [] } } },
      lineCost: { subtotal: n.cost.subtotalAmount, total: n.cost.totalAmount, perQuantity: n.cost.amountPerQuantity },
      lineDiscounts: n.discountAllocations.map((a) => ({ code: a.code, amount: a.discountedAmount })),
    })),
  });
}

beforeEach(() => {
  customerToken = null; savedCartId = null; events = []; previews = 0; lineUpdateDelay = 0; staleSyncFor = null; toasts.length = 0;
  resetCouponPreviewCache();
  useCouponStore.getState().resetSession();
});

// ---- H2: line display -------------------------------------------------------
const lineItem = (over) => ({ lineId: "l", variantId: V_BAG, variantTitle: "D", quantity: 2, selectedOptions: [], price: money(1249), product: { node: { title: "x" } }, ...over });

test("H2: a B2B-priced line shows Shopify's line total and unit price, not the catalogue price", () => {
  const d = getLineDisplay(lineItem({ lineCost: { subtotal: money(999), total: money(999), perQuantity: money(499.5) }, lineDiscounts: [] }));
  assert.deepEqual([d.total.amount, d.original, d.each.amount, d.discount, d.fromShopify], ["999.00", null, "499.50", 0, true]);
});

test("H2: a discounted line shows Shopify's discounted total with the original struck -- never discounted twice", () => {
  const d = getLineDisplay(lineItem({
    lineCost: { subtotal: money(1000), total: money(900), perQuantity: money(500) },
    lineDiscounts: [{ code: "OFFICENEED10", amount: money(100) }],
  }));
  assert.equal(d.total.amount, "900.00", "totalAmount is already after the discount; nothing is subtracted again");
  assert.equal(d.original.amount, "1000.00");
  assert.equal(d.discount, 100);
  assert.deepEqual(d.codes, ["OFFICENEED10"]);
});

test("H2: before Shopify line pricing exists, no discount is shown even if allocations are present", () => {
  const d = getLineDisplay(lineItem({ lineDiscounts: [{ code: "OFFICENEED10", amount: money(100) }] }));
  assert.deepEqual([d.total.amount, d.original, d.discount, d.fromShopify], ["2498.00", null, 0, false]);
});

test("H2: live cart lines satisfy Shopify's own arithmetic (per-unit x qty = subtotal; subtotal - allocations = total)", async () => {
  setup("gid://shopify/Cart/A", [[V_BAG, 3]]);
  await useCartStore.getState().applyDiscountCodeChecked("OFFICENEED10");
  const i = useCartStore.getState().items[0];
  assert.equal(parseFloat(i.lineCost.perQuantity.amount) * i.quantity, parseFloat(i.lineCost.subtotal.amount));
  assert.equal(Math.round((parseFloat(i.lineCost.subtotal.amount) - parseFloat(i.lineDiscounts[0].amount.amount)) * 100) / 100, parseFloat(i.lineCost.total.amount));
});

// ---- L1: stale responses and ordering --------------------------------------
test("L1: an older Shopify cart snapshot never overwrites a newer one", async () => {
  setup("gid://shopify/Cart/B", [[V_BAG, 1]]);
  await useCartStore.getState().applyDiscountCodeChecked("OFFICENEED10");
  assert.deepEqual(useCartStore.getState().discountCodes, [{ code: "OFFICENEED10", applicable: true }]);
  staleSyncFor = "gid://shopify/Cart/B";
  await useCartStore.getState().syncCart(); // returns an older snapshot without the code
  assert.deepEqual(useCartStore.getState().discountCodes, [{ code: "OFFICENEED10", applicable: true }], "stale answer ignored");
  await useCartStore.getState().syncCart(); // current snapshot
  assert.deepEqual(useCartStore.getState().discountCodes, [{ code: "OFFICENEED10", applicable: true }]);
});

test("L1: a discount change waits for an in-flight quantity change, so Shopify prices the bag the shopper sees", async () => {
  setup("gid://shopify/Cart/C", [[V_BAG, 1]]);
  lineUpdateDelay = 60;
  const q = useCartStore.getState().updateQuantity(V_BAG, 3);
  const r = await useCartStore.getState().applyDiscountCodeChecked("OFFICENEED10");
  await q;
  assert.deepEqual(events, ["lines:start", "lines:end", "discount:start"]);
  assert.equal(r.status, "applied");
  const i = useCartStore.getState().items[0];
  assert.equal(i.quantity, 3);
  assert.equal(i.lineDiscounts[0].amount.amount, "374.70");
});

// ---- L5: one discount change at a time -------------------------------------
test("L5: two simultaneous applies never stack -- the second sees the first and asks to replace", async () => {
  setup("gid://shopify/Cart/D", [[V_BAG, 1], [V_PERFUME, 1]]);
  const [a, b] = await Promise.all([
    useCartStore.getState().applyDiscountCodeChecked("OFFICENEED10"),
    useCartStore.getState().applyDiscountCodeChecked("OFFICENEED20"),
  ]);
  assert.equal(a.status, "applied");
  assert.equal(b.status, "conflict");
  assert.deepEqual(carts.get("gid://shopify/Cart/D").codes, ["OFFICENEED10"]);
});

test("L5: discountBusy is true while a discount change runs and false afterwards", async () => {
  setup("gid://shopify/Cart/E", [[V_BAG, 1]]);
  const seen = [];
  const unsub = useCartStore.subscribe((s) => seen.push(s.discountBusy));
  await useCartStore.getState().applyDiscountCodeChecked("OFFICENEED10");
  unsub();
  assert.ok(seen.includes(true));
  assert.equal(useCartStore.getState().discountBusy, false);
});

// ---- Performance: conflict checks -----------------------------------------
test("conflict between our two non-combinable codes needs no 'together' preview, and reuses cached savings", async () => {
  setup("gid://shopify/Cart/F", [[V_BAG, 1], [V_PERFUME, 1]], ["OFFICENEED20"]);
  let r = await useCartStore.getState().applyDiscountCodeChecked("OFFICENEED10");
  assert.equal(r.status, "conflict");
  assert.equal(previews, 1, "only the candidate's savings preview");
  resetCouponPreviewCache(); previews = 0;
  // the card already priced OFFICENEED10 for this exact bag
  await resolveSavings("OFFICENEED10", couponPreviewScope(), [{ variantId: V_BAG, quantity: 1 }, { variantId: V_PERFUME, quantity: 1 }], previewCodesOnLines);
  previews = 0;
  r = await useCartStore.getState().applyDiscountCodeChecked("OFFICENEED10");
  assert.equal(r.status, "conflict");
  assert.equal(r.candidateSavings, 124.9);
  assert.equal(previews, 0, "no preview at all -- cached Shopify answer reused");
});

// ---- M2: guest code on sign-in ----------------------------------------------
test("M2: a guest code is carried into the account's saved bag when that bag has no code", async () => {
  clock += 1000;
  carts.set("gid://shopify/Cart/SAVED", { codes: [], lines: [{ id: V_PERFUME, qty: 1 }], stamp: clock });
  setup("gid://shopify/Cart/GUEST", [[V_BAG, 1]], ["OFFICENEED10"]);
  savedCartId = "gid://shopify/Cart/SAVED"; customerToken = "tok";
  await useCartStore.getState().syncCustomerCart("tok");
  const s = useCartStore.getState();
  assert.equal(s.cartId, "gid://shopify/Cart/SAVED");
  assert.deepEqual(carts.get("gid://shopify/Cart/SAVED").codes, ["OFFICENEED10"]);
  assert.deepEqual(s.discountCodes, [{ code: "OFFICENEED10", applicable: true }]);
  assert.equal(s.items.length, 2);
  assert.ok(s.items.find((i) => i.variantId === V_BAG).lineDiscounts.length === 1, "per-line allocation restored too");
});

test("M2: the account bag's own code is never replaced -- the shopper is told instead", async () => {
  clock += 1000;
  carts.set("gid://shopify/Cart/SAVED2", { codes: ["OFFICENEED20"], lines: [{ id: V_PERFUME, qty: 1 }], stamp: clock });
  setup("gid://shopify/Cart/GUEST2", [[V_BAG, 1]], ["OFFICENEED10"]);
  savedCartId = "gid://shopify/Cart/SAVED2"; customerToken = "tok2";
  await useCartStore.getState().syncCustomerCart("tok2");
  assert.deepEqual(carts.get("gid://shopify/Cart/SAVED2").codes, ["OFFICENEED20"]);
  assert.ok(toasts.some(([kind, m]) => kind === "info" && m.includes("OFFICENEED20") && m.includes("OFFICENEED10")));
});

test("M2: no guest code means no discount change on the saved bag", async () => {
  clock += 1000;
  carts.set("gid://shopify/Cart/SAVED3", { codes: [], lines: [{ id: V_PERFUME, qty: 1 }], stamp: clock });
  setup("gid://shopify/Cart/GUEST3", [[V_BAG, 1]]);
  savedCartId = "gid://shopify/Cart/SAVED3"; customerToken = "tok3";
  await useCartStore.getState().syncCustomerCart("tok3");
  assert.ok(!events.includes("discount:start"));
});

// ---- L6: identity helpers -----------------------------------------------------
test("L6: a token change in another tab is recognised; the coupon session resets on sign-out", () => {
  assert.equal(isCustomerTokenStorageChange("officeneed_customer_token"), true);
  assert.equal(isCustomerTokenStorageChange(null), true);
  assert.equal(isCustomerTokenStorageChange("shopify-cart"), false);
  useCouponStore.getState().select("officeneed20");
  useCouponStore.getState().setPendingLinkCode("officeneed10");
  useCouponStore.getState().resetSession();
  assert.deepEqual([useCouponStore.getState().selectedCode, useCouponStore.getState().pendingLinkCode], [null, null]);
});

// ---- Bug K + deferred-notice persistence (coupon session store) -------------
test("Bug K: declining a link code (Keep) forgets both the pending code and the matching selection", () => {
  const c = useCouponStore.getState();
  c.select("OFFICENEED10");
  c.setPendingLinkCode("OFFICENEED10");
  useCouponStore.getState().forgetLinkCode("officeneed10");
  assert.deepEqual([useCouponStore.getState().selectedCode, useCouponStore.getState().pendingLinkCode], [null, null]);
});

test("Bug K: forgetting a link code never clears an unrelated selection", () => {
  useCouponStore.getState().select("OFFICENEED20");
  useCouponStore.getState().setPendingLinkCode("OFFICENEED10");
  useCouponStore.getState().forgetLinkCode("OFFICENEED10");
  assert.equal(useCouponStore.getState().selectedCode, "OFFICENEED20");
  assert.equal(useCouponStore.getState().pendingLinkCode, null);
});

test("deferred link notice: the tried-for bag is remembered for the session and reset by a new link or a clear", () => {
  const c = useCouponStore.getState();
  c.setPendingLinkCode("OFFICENEED10");
  useCouponStore.getState().markPendingLinkTried("v1,v2");
  assert.equal(useCouponStore.getState().pendingLinkTriedFor, "v1,v2");
  const stored = JSON.parse(sessionStorage.getItem("officeneed-selected-coupon")).state;
  assert.equal(stored.pendingLinkTriedFor, "v1,v2", "persisted, so a reload doesn't re-try or re-announce it");
  useCouponStore.getState().setPendingLinkCode("OFFICENEED20");
  assert.equal(useCouponStore.getState().pendingLinkTriedFor, null, "a new link starts fresh");
  useCouponStore.getState().markPendingLinkTried("v1");
  useCouponStore.getState().clearPendingLinkCode();
  assert.equal(useCouponStore.getState().pendingLinkTriedFor, null);
});
