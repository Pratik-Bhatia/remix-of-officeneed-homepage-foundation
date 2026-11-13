// Run with: npx tsx --test src/lib/discount-link.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDiscountLink, normalizeDiscountCode } from "./discount-link.ts";

test("reads ?discount=CODE, normalises case and removes it from the URL", () => {
  assert.deepEqual(parseDiscountLink("?discount=officeneed10"), { code: "OFFICENEED10", present: true, cleanedSearch: "" });
  assert.deepEqual(parseDiscountLink("?collection=bags&discount=OFFICENEED20&q=x"), { code: "OFFICENEED20", present: true, cleanedSearch: "?collection=bags&q=x" });
});

test("no parameter: untouched", () => {
  assert.deepEqual(parseDiscountLink("?collection=bags"), { code: null, present: false, cleanedSearch: "?collection=bags" });
  assert.deepEqual(parseDiscountLink(""), { code: null, present: false, cleanedSearch: "" });
});

test("invalid or crafted codes are rejected (but still stripped from the URL)", () => {
  for (const bad of ["", "   ", "<script>", "a b", "x".repeat(41), "10%OFF", "../etc"]) assert.equal(normalizeDiscountCode(bad), null, bad);
  assert.deepEqual(parseDiscountLink("?discount=%3Cscript%3E&a=1"), { code: null, present: true, cleanedSearch: "?a=1" });
});

test("valid Shopify-style codes pass", () => {
  for (const ok of ["OFFICENEED10", "spring_sale-2026", "A"]) assert.ok(normalizeDiscountCode(ok));
});
