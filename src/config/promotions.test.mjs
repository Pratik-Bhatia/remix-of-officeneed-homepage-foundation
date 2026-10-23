// Run with: npx tsx --test src/config/promotions.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { getPromotionForProduct, CATEGORY_PROMOTIONS } from "./promotions.ts";
import { getCategoryHandles } from "../lib/taxonomy.ts";

test("codes are configured once and match the agreed offers", () => {
  assert.deepEqual(CATEGORY_PROMOTIONS.map((p) => [p.category, p.code]), [
    ["Fragrance Gifting", "OFFICENEED20"],
    ["Corporate Gifting", "OFFICENEED10"],
  ]);
});

test("fragrance and corporate products get their own code via collection handles", () => {
  assert.equal(getPromotionForProduct(["european-perfume"])?.code, "OFFICENEED20");
  assert.equal(getPromotionForProduct([getCategoryHandles("Fragrance Gifting")[0]])?.code, "OFFICENEED20");
  assert.equal(getPromotionForProduct([getCategoryHandles("Corporate Gifting")[0]])?.code, "OFFICENEED10");
});

test("ineligible, empty and missing handles get no offer", () => {
  assert.equal(getPromotionForProduct(["office-stationary"]), null);
  assert.equal(getPromotionForProduct(["computer-accessories"]), null);
  assert.equal(getPromotionForProduct([]), null);
  assert.equal(getPromotionForProduct(undefined), null);
});

import { getPromotionCodeToCarry } from "./promotions.ts";
const on = (code, applicable = true) => [{ code, applicable }];

test("Buy Now carries only the product's own applied promo code", () => {
  assert.equal(getPromotionCodeToCarry(["european-perfume"], on("OFFICENEED20")), "OFFICENEED20");
  assert.equal(getPromotionCodeToCarry([getCategoryHandles("Corporate Gifting")[0]], on("OFFICENEED10")), "OFFICENEED10");
  assert.equal(getPromotionCodeToCarry(["european-perfume"], on("officeneed20")), "OFFICENEED20");
});

test("Buy Now carries nothing for no code, the other category's code, a non-applicable code or an ineligible product", () => {
  assert.equal(getPromotionCodeToCarry(["european-perfume"], []), null);
  assert.equal(getPromotionCodeToCarry(["european-perfume"], on("OFFICENEED10")), null);
  assert.equal(getPromotionCodeToCarry([getCategoryHandles("Corporate Gifting")[0]], on("OFFICENEED20")), null);
  assert.equal(getPromotionCodeToCarry(["european-perfume"], on("OFFICENEED20", false)), null);
  assert.equal(getPromotionCodeToCarry(["office-stationary"], on("OFFICENEED20")), null);
  assert.equal(getPromotionCodeToCarry(undefined, on("OFFICENEED20")), null);
});

import { getPromotionsForPage } from "./promotions.ts";
const codes = (ctx) => getPromotionsForPage(ctx).map((p) => p.code);

test("homepage and the unfiltered catalogue show both offers", () => {
  assert.deepEqual(codes({ pathname: "/" }), ["OFFICENEED20", "OFFICENEED10"]);
  assert.deepEqual(codes({ pathname: "/products" }), ["OFFICENEED20", "OFFICENEED10"]);
  assert.deepEqual(codes({ pathname: "/products/" }), ["OFFICENEED20", "OFFICENEED10"]);
});

test("collection pages show only their own category's offer", () => {
  assert.deepEqual(codes({ pathname: "/products", collection: "perfumes" }), ["OFFICENEED20"]);
  assert.deepEqual(codes({ pathname: "/products", collection: "european-perfume" }), ["OFFICENEED20"]);
  assert.deepEqual(codes({ pathname: "/products", collection: getCategoryHandles("Corporate Gifting")[0] }), ["OFFICENEED10"]);
});

test("unrelated, unknown and search listings show no offer", () => {
  assert.deepEqual(codes({ pathname: "/products", collection: "computer-accessories" }), []);
  assert.deepEqual(codes({ pathname: "/products", collection: "office-stationary" }), []);
  assert.deepEqual(codes({ pathname: "/products", collection: "not-a-real-collection" }), []);
  assert.deepEqual(codes({ pathname: "/products", query: "pen" }), []);
});

test("product pages follow the product's own collection handles", () => {
  assert.deepEqual(codes({ pathname: "/products/x", productHandles: ["european-perfume"] }), ["OFFICENEED20"]);
  assert.deepEqual(codes({ pathname: "/products/x", productHandles: [getCategoryHandles("Corporate Gifting")[0]] }), ["OFFICENEED10"]);
  assert.deepEqual(codes({ pathname: "/products/x", productHandles: ["computer-accessories"] }), []);
  assert.deepEqual(codes({ pathname: "/products/x" }), []);
});

test("cart, account and content pages never show the bar", () => {
  for (const pathname of ["/cart", "/account", "/about-us", "/blog", "/faqs", "/shop/some-product"]) assert.deepEqual(codes({ pathname }), [], pathname);
});

test("each promotion carries its own eligibility wording", () => {
  assert.deepEqual(CATEGORY_PROMOTIONS.map((p) => p.eligibleLabel), ["fragrances", "corporate gifting products"]);
});

test("Buy Now also carries the code the shopper selected with Apply Code, but only for its own category", () => {
  assert.equal(getPromotionCodeToCarry(["european-perfume"], [], "OFFICENEED20"), "OFFICENEED20");
  assert.equal(getPromotionCodeToCarry(["european-perfume"], [], "officeneed20"), "OFFICENEED20");
  assert.equal(getPromotionCodeToCarry(["european-perfume"], [], "OFFICENEED10"), null);
  assert.equal(getPromotionCodeToCarry(["office-stationary"], [], "OFFICENEED20"), null);
  assert.equal(getPromotionCodeToCarry(["european-perfume"], [], null), null);
  assert.equal(getPromotionCodeToCarry(["european-perfume"], [], undefined), null);
});
