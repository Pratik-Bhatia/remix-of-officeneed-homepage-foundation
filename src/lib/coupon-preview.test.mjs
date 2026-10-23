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
