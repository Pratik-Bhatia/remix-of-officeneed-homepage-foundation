// Run with: npx tsx --test src/components/officeneed/ProductInformation.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ProductInformation } from "./ProductInformation.tsx";

const render = (product) => renderToStaticMarkup(createElement(ProductInformation, { product }));
const titles = (html) => [...html.matchAll(/<summary[^>]*>([^<]+)/g)].map((m) => m[1].replace("&amp;", "&"));

test("a standard product shows its sections and no Delivery & Returns", () => {
  const html = render({
    category: "Corporate Gifting",
    description: "A gift set.",
    specifications: [{ label: "Colour", value: "Blue" }],
    features: ["Leather cover"],
  });
  assert.deepEqual(titles(html), ["DESCRIPTION", "PRODUCT DETAILS", "KEY FEATURES"]);
  assert.doesNotMatch(html, /delivery|returns|refund/i);
});

test("a fragrance keeps its core sections and has no Delivery & Returns", () => {
  const html = render({ category: "Fragrance Gifting", name: "Test EDP", description: "" });
  assert.deepEqual(titles(html), ["DESCRIPTION", "PRODUCT DETAILS", "FRAGRANCE NOTES"]);
  assert.doesNotMatch(html, /delivery|returns|refund/i);
});

test("a product with no information renders nothing, not an empty divider", () => {
  assert.equal(render({ category: "Office Stationery" }), "");
});
