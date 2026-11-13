// Run with: npx tsx --test src/lib/line-discounts.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { lineDiscountTotal, codeSavings, linesDiscountedBy } from "./line-discounts.ts";

const m = (n) => ({ amount: String(n), currencyCode: "INR" });
const items = [
  { lineDiscounts: [{ code: "OFFICENEED10", amount: m(79.9) }, { code: null, amount: m(5) }] },
  { lineDiscounts: [{ code: "officeneed10", amount: m(22.9) }] },
  { lineDiscounts: [] },
  {},
];

test("sums only Shopify's amounts, per line and per code (case-insensitive)", () => {
  assert.equal(lineDiscountTotal(items[0]), 84.9);
  assert.equal(lineDiscountTotal(items[0], "OFFICENEED10"), 79.9);
  assert.equal(lineDiscountTotal(items[3]), 0);
  assert.equal(codeSavings(items, "OFFICENEED10"), 102.8);
  assert.equal(codeSavings(items, "OFFICENEED20"), 0);
  assert.equal(linesDiscountedBy(items, "OFFICENEED10"), 2);
});

test("rounds to paisa without drift", () => {
  assert.equal(codeSavings([{ lineDiscounts: [{ code: "A", amount: m(0.1) }] }, { lineDiscounts: [{ code: "A", amount: m(0.2) }] }], "A"), 0.3);
});
