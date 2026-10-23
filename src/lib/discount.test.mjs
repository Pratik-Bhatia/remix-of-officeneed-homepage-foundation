// Run with: npx tsx --test src/lib/discount.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { getDiscount, minVariantCompareAt } from "./discount.ts";
import { DiscountBadge } from "../components/officeneed/DiscountBadge.tsx";

const pct = (p, c) => getDiscount(p, c)?.percent ?? null;
const html = (p, c) => renderToStaticMarkup(createElement(DiscountBadge, { price: p, compareAtPrice: c }));

test("rounds the percentage from live values", () => {
  assert.equal(pct(7077, 7450), 5);
  assert.equal(pct("950.0", "1000.0"), 5);
  assert.equal(pct(500, 1000), 50);
});

test("no discount when equal, lower, missing, zero or invalid", () => {
  for (const [p, c] of [[100, 100], [100, 90], [100, null], [100, undefined], [100, 0], [100, "abc"], [100, NaN], [0, 100], ["x", 100], [-5, 100], [999, 1000]]) {
    assert.equal(getDiscount(p, c), null, `${p}/${c}`);
  }
});

test("badge renders X% OFF only for a valid discount, else nothing", () => {
  assert.match(html("7077", "7450"), /5% OFF/);
  assert.match(html("950", "1000"), />5% OFF</);
  for (const [p, c] of [[100, 100], [100, null], [100, 90], [100, 0]]) assert.equal(html(p, c), "");
});

test("switching variant recomputes badge (discounted -> none -> discounted)", () => {
  const variants = [{ price: "7077", compare: "7450" }, { price: "800", compare: null }, { price: "900", compare: "1000" }];
  assert.deepEqual(variants.map((v) => html(v.price, v.compare).match(/(\d+)% OFF/)?.[1] ?? null), ["5", null, "10"]);
});

test("card uses the cheapest variant's own compare-at", () => {
  const v = (price, c) => ({ price: { amount: price }, compareAtPrice: c ? { amount: c } : null });
  assert.equal(minVariantCompareAt([v("900", "1000"), v("700", "800")]), 800);
  assert.equal(minVariantCompareAt([v("900", "1000"), v("700", null)]), undefined);
  assert.equal(minVariantCompareAt([]), undefined);
});
