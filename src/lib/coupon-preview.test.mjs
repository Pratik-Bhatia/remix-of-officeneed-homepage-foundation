// Run with: npx tsx --test src/lib/coupon-preview.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { interpretPreviewCart } from "./coupon-preview.ts";

const cart = (codes, line) => ({
  cart: { discountCodes: codes, lines: { edges: line ? [{ node: line }] : [] } },
  userErrors: [],
});
const line = (sub, total, quantity = 1) => ({
  quantity,
  cost: { subtotalAmount: { amount: String(sub), currencyCode: "INR" }, totalAmount: { amount: String(total), currencyCode: "INR" } },
});

test("an applicable code reports Shopify's own before/after line totals and the savings", () => {
  const r = interpretPreviewCart(cart([{ code: "OFFICENEED20", applicable: true }], line("11210.0", "8968.0")), "OFFICENEED20");
  assert.equal(r.status, "applied");
  assert.equal(r.originalTotal, 11210);
  assert.equal(r.discountedTotal, 8968);
  assert.equal(r.savings, 2242);
  assert.equal(r.currencyCode, "INR");
});

test("quantity is reported and the totals are for the whole line", () => {
  const r = interpretPreviewCart(cart([{ code: "OFFICENEED10", applicable: true }], line(1197, 1077.3, 3)), "officeneed10");
  assert.equal(r.status, "applied");
  assert.equal(r.quantity, 3);
  assert.equal(r.savings, 119.7);
});

test("a code Shopify marks not applicable is never shown as applied (invalid, expired, ineligible, below minimum all look alike)", () => {
  assert.deepEqual(interpretPreviewCart(cart([{ code: "OFFICENEED20", applicable: false }], line(100, 100)), "OFFICENEED20"), { status: "not-applicable", code: "OFFICENEED20" });
  assert.equal(interpretPreviewCart(cart([], line(100, 100)), "NOPE").status, "not-applicable");
});

test("'applicable' with nothing actually taken off the line is not an applied discount", () => {
  assert.equal(interpretPreviewCart(cart([{ code: "X", applicable: true }], line(500, 500)), "X").status, "not-applicable");
});

test("Shopify user errors and a missing cart become an error, never a discount", () => {
  assert.equal(interpretPreviewCart({ cart: null, userErrors: [{ message: "Out of stock" }] }, "X").status, "error");
  assert.equal(interpretPreviewCart({ cart: null, userErrors: [] }, "X").status, "error");
  assert.equal(interpretPreviewCart(undefined, "X").status, "error");
});

test("an applicable code without usable prices is reported as an error rather than guessed", () => {
  assert.equal(interpretPreviewCart(cart([{ code: "X", applicable: true }], { quantity: 1, cost: {} }), "X").status, "error");
  assert.equal(interpretPreviewCart(cart([{ code: "X", applicable: true }], null), "X").status, "error");
});

// --- Whole-cart previews + caching -------------------------------------------
import {
  interpretCodesPreview, savingsForCode, isCodeApplicable, discountedVariants,
  resolveEligibility, resolveSavings, resetCouponPreviewCache,
} from "./coupon-preview.ts";

const A = "gid://shopify/ProductVariant/A", B = "gid://shopify/ProductVariant/B", C = "gid://shopify/ProductVariant/C";
const node = (id, alloc) => ({ merchandise: { id }, cost: { totalAmount: { amount: "1", currencyCode: "INR" } }, discountAllocations: alloc });
const payload = (codes, nodes) => ({ cart: { discountCodes: codes, lines: { edges: nodes.map((n) => ({ node: n })) } }, userErrors: [] });

test("interpretCodesPreview reads Shopify per-line code allocations and never invents amounts", () => {
  const p = interpretCodesPreview(payload([{ code: "OFFICENEED10", applicable: true }], [
    node(A, [{ code: "OFFICENEED10", discountedAmount: { amount: "124.9", currencyCode: "INR" } }]),
    node(B, []),
    node(C, [{ code: null, discountedAmount: { amount: "5", currencyCode: "INR" } }]), // automatic discount: no code
  ]));
  assert.equal(p.status, "ok");
  assert.equal(savingsForCode(p, "officeneed10"), 124.9);
  assert.equal(isCodeApplicable(p, "OFFICENEED10"), true);
  assert.deepEqual([...discountedVariants(p, "OFFICENEED10")], [A]);
  assert.equal(interpretCodesPreview({ cart: null, userErrors: [{ message: "bad" }] }).status, "error");
  assert.equal(interpretCodesPreview(null).status, "error");
});

function fakeFetcher(eligible) {
  const fn = async (codes, lines) => {
    fn.calls.push(lines.map((l) => `${l.variantId}:${l.quantity}`));
    return interpretCodesPreview(payload(codes.map((c) => ({ code: c, applicable: lines.some((l) => eligible.has(l.variantId)) })),
      lines.map((l) => node(l.variantId, eligible.has(l.variantId) ? [{ code: codes[0], discountedAmount: { amount: String(10 * l.quantity), currencyCode: "INR" } }] : []))));
  };
  fn.calls = [];
  return fn;
}

test("eligibility is cached per variant: quantity changes and repeat checks make no new preview", async () => {
  resetCouponPreviewCache();
  const f = fakeFetcher(new Set([A]));
  let r = await resolveEligibility("OFFICENEED10", "guest|personal", [{ variantId: A, quantity: 1 }, { variantId: B, quantity: 1 }], f);
  assert.deepEqual(Object.fromEntries(r), { [A]: true, [B]: false });
  r = await resolveEligibility("OFFICENEED10", "guest|personal", [{ variantId: A, quantity: 7 }, { variantId: B, quantity: 3 }], f);
  assert.deepEqual(Object.fromEntries(r), { [A]: true, [B]: false });
  assert.equal(f.calls.length, 1, "one preview for both variants, none for the quantity change");
});

test("only newly seen variants are previewed, in one batch", async () => {
  resetCouponPreviewCache();
  const f = fakeFetcher(new Set([C]));
  await resolveEligibility("OFFICENEED10", "s", [{ variantId: A, quantity: 1 }], f);
  await resolveEligibility("OFFICENEED10", "s", [{ variantId: A, quantity: 1 }, { variantId: B, quantity: 2 }, { variantId: C, quantity: 1 }], f);
  assert.deepEqual(f.calls, [[`${A}:1`], [`${B}:2`, `${C}:1`]]);
});

test("a buyer-identity change (scope) starts from an empty cache", async () => {
  resetCouponPreviewCache();
  const f = fakeFetcher(new Set([A]));
  await resolveEligibility("OFFICENEED20", "guest|personal", [{ variantId: A, quantity: 1 }], f);
  await resolveEligibility("OFFICENEED20", "c:abc|gid://shopify/CompanyLocation/9", [{ variantId: A, quantity: 1 }], f);
  assert.equal(f.calls.length, 2);
});

test("errors are never cached and fail closed (nothing reported eligible)", async () => {
  resetCouponPreviewCache();
  let fail = true;
  const f = async (codes, lines) => (fail ? { status: "error", message: "down" } : fakeFetcher(new Set([A]))(codes, lines));
  let r = await resolveEligibility("OFFICENEED10", "s", [{ variantId: A, quantity: 1 }], f);
  assert.equal(r.size, 0);
  fail = false;
  r = await resolveEligibility("OFFICENEED10", "s", [{ variantId: A, quantity: 1 }], f);
  assert.equal(r.get(A), true);
});

test("a line Shopify dropped from the preview is unknown, not ineligible", async () => {
  resetCouponPreviewCache();
  const f = async (codes) => interpretCodesPreview(payload([{ code: codes[0], applicable: false }], [node(A, [])]));
  const r = await resolveEligibility("OFFICENEED10", "s", [{ variantId: A, quantity: 1 }, { variantId: B, quantity: 1 }], f);
  assert.equal(r.get(A), false);
  assert.equal(r.has(B), false);
});

test("savings are the Shopify sum for the exact cart contents, cached until the contents change", async () => {
  resetCouponPreviewCache();
  const f = fakeFetcher(new Set([A]));
  const lines = [{ variantId: A, quantity: 2 }, { variantId: B, quantity: 1 }];
  let s = await resolveSavings("OFFICENEED10", "s", lines, f);
  assert.deepEqual(s, { status: "ok", applicable: true, savings: 20, discountedLineCount: 1, currencyCode: "INR" });
  await resolveSavings("OFFICENEED10", "s", [...lines].reverse(), f);
  assert.equal(f.calls.length, 1, "same contents in a different order is a cache hit");
  s = await resolveSavings("OFFICENEED10", "s", [{ variantId: A, quantity: 3 }, { variantId: B, quantity: 1 }], f);
  assert.equal(s.savings, 30);
  assert.equal(f.calls.length, 2);
});

// --- Review fixes: 5-minute TTL (L4) and eligibility seeded by savings (M4) ---
import { ELIGIBILITY_TTL_MS } from "./coupon-preview.ts";

test("L4: eligibility answers expire after 5 minutes", async () => {
  assert.equal(ELIGIBILITY_TTL_MS, 5 * 60 * 1000);
  resetCouponPreviewCache();
  const f = fakeFetcher(new Set([A]));
  const realNow = Date.now;
  let now = realNow();
  Date.now = () => now;
  try {
    await resolveEligibility("OFFICENEED10", "s", [{ variantId: A, quantity: 1 }], f);
    now += 4 * 60 * 1000;
    await resolveEligibility("OFFICENEED10", "s", [{ variantId: A, quantity: 1 }], f);
    assert.equal(f.calls.length, 1, "still cached at 4 minutes");
    now += 2 * 60 * 1000;
    await resolveEligibility("OFFICENEED10", "s", [{ variantId: A, quantity: 1 }], f);
    assert.equal(f.calls.length, 2, "re-checked with Shopify after 5 minutes");
  } finally {
    Date.now = realNow;
  }
});

test("M4: one whole-bag savings preview also answers eligibility -- no second preview", async () => {
  resetCouponPreviewCache();
  const f = fakeFetcher(new Set([A]));
  await resolveSavings("OFFICENEED20", "s", [{ variantId: A, quantity: 2 }, { variantId: B, quantity: 1 }], f);
  const r = await resolveEligibility("OFFICENEED20", "s", [{ variantId: A, quantity: 2 }, { variantId: B, quantity: 1 }], f);
  assert.deepEqual(Object.fromEntries(r), { [A]: true, [B]: false });
  assert.equal(f.calls.length, 1);
});

test("M4: concurrent identical savings requests share one Shopify preview", async () => {
  resetCouponPreviewCache();
  const f = fakeFetcher(new Set([A]));
  const lines = [{ variantId: A, quantity: 1 }];
  const [x, y] = await Promise.all([resolveSavings("OFFICENEED10", "s", lines, f), resolveSavings("OFFICENEED10", "s", lines, f)]);
  assert.deepEqual(x, y);
  assert.equal(f.calls.length, 1);
});
