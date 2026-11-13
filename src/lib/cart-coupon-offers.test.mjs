// Cart coupon card states (pure). Run with: npx tsx --test src/lib/cart-coupon-offers.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildOfferViews, candidateItems } from "./cart-coupon-offers.ts";
import { getPromotionByCode } from "../config/promotions.ts";

const money = (n) => ({ amount: n.toFixed(2), currencyCode: "INR" });
const BAG = "v-bag", PERF = "v-perf", PAPER = "v-paper";
const item = (variantId, handles, extra = {}) => ({
  lineId: `l-${variantId}`, variantId, variantTitle: "D", quantity: 1, selectedOptions: [], price: money(100),
  product: { node: { title: variantId, collections: handles === null ? undefined : { edges: handles.map((h) => ({ node: { handle: h } })) } } },
  lineCost: { subtotal: money(100), total: money(100) }, lineDiscounts: [], ...extra,
});
const kinds = (views) => views.map((v) => `${v.kind}:${v.promo.code}`);

test("checking state (skeleton) until Shopify has answered for a promotion with candidates", () => {
  const v = buildOfferViews({ items: [item(BAG, ["bags"])], discountCodes: [], eligibility: {}, signedIn: false });
  assert.deepEqual(kinds(v), ["checking:OFFICENEED10"]);
});

test("available with Shopify's eligible count in a mixed bag; nothing for items outside both lists", () => {
  const items = [item(BAG, ["bags"]), item(PAPER, ["office-stationary"])];
  const v = buildOfferViews({ items, discountCodes: [], eligibility: { OFFICENEED10: { [BAG]: true }, OFFICENEED20: {} }, signedIn: false });
  assert.deepEqual(kinds(v), ["available:OFFICENEED10"]);
  assert.equal(v[0].eligibleLines, 1);
  assert.equal(v[0].totalLines, 2);
});

test("applied uses only Shopify's per-line allocations, and comes first", () => {
  const items = [item(PERF, ["perfumes"]), item(BAG, ["bags"], { lineDiscounts: [{ code: "OFFICENEED10", amount: money(10) }] })];
  const v = buildOfferViews({ items, discountCodes: [{ code: "OFFICENEED10", applicable: true }], eligibility: { OFFICENEED20: { [PERF]: true }, OFFICENEED10: { [BAG]: true } }, signedIn: false });
  assert.deepEqual(kinds(v), ["applied:OFFICENEED10", "available:OFFICENEED20"]);
  assert.equal(v[0].savings, 10);
  assert.equal(v[0].lines, 1);
});

test("L2: a saved bag without per-line pricing shows 'applied, updating' -- never a wrong 'doesn't apply'", () => {
  const legacy = item(BAG, ["bags"], { lineCost: undefined, lineDiscounts: undefined });
  const v = buildOfferViews({ items: [legacy], discountCodes: [{ code: "OFFICENEED10", applicable: true }], eligibility: {}, signedIn: false });
  assert.deepEqual(kinds(v), ["applied:OFFICENEED10"]);
  assert.equal(v[0].pricingPending, true);
});

test("dormant when the code is on the bag but Shopify discounts nothing", () => {
  const v = buildOfferViews({ items: [item(PAPER, ["office-stationary"])], discountCodes: [{ code: "OFFICENEED10", applicable: false }], eligibility: {}, signedIn: false });
  assert.deepEqual(kinds(v), ["dormant:OFFICENEED10"]);
});

test("M5: a signed-in customer Shopify declines for OFFICENEED20 sees 'not available on your account'", () => {
  const v = buildOfferViews({ items: [item(PERF, ["perfumes"])], discountCodes: [], eligibility: { OFFICENEED20: { [PERF]: false }, OFFICENEED10: {} }, signedIn: true });
  assert.deepEqual(kinds(v), ["unavailable-for-account:OFFICENEED20"]);
});

test("M5: no such message for guests, for codes without a one-use limit, or when collections aren't known locally", () => {
  const declined = { OFFICENEED20: { [PERF]: false }, OFFICENEED10: { [BAG]: false } };
  assert.deepEqual(buildOfferViews({ items: [item(PERF, ["perfumes"])], discountCodes: [], eligibility: declined, signedIn: false }), []);
  assert.deepEqual(buildOfferViews({ items: [item(BAG, ["bags"])], discountCodes: [], eligibility: declined, signedIn: true }), []);
  assert.deepEqual(buildOfferViews({ items: [item(PERF, null)], discountCodes: [], eligibility: declined, signedIn: true }), []);
});

test("candidates: items in the discount's collections, plus items whose collections aren't known locally", () => {
  const p10 = getPromotionByCode("OFFICENEED10");
  const got = candidateItems([item(BAG, ["bags"]), item(PAPER, ["office-stationary"]), item("v-unknown", null), item("v-elec", ["electronics"])], p10).map((i) => i.variantId);
  assert.deepEqual(got, [BAG, "v-unknown"]);
});

import { sameCodes } from "../components/officeneed/DiscountConflictDialog.tsx";
test("sameCodes detects a changed set of bag codes (case-insensitive, order-free)", () => {
  assert.equal(sameCodes(["OFFICENEED10"], ["officeneed10"]), true);
  assert.equal(sameCodes(["A", "B"], ["B", "A"]), true);
  assert.equal(sameCodes(["OFFICENEED10"], ["OFFICENEED20"]), false);
  assert.equal(sameCodes([], ["OFFICENEED10"]), false);
});
