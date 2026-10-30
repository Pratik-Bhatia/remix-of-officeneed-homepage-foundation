// The Markdown/HTML parsers for fragrance details are loaded on demand
// (loadProductDetailParsers), not with every page. A full fragrance
// conversion before they load must fail loudly, never silently drop details;
// card conversions and non-fragrance products never need them.
// Run with: npx tsx --test src/lib/shopify-overlay.detail-parsers.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

const { shopifyNodeToProduct, shopifyNodeToCardProduct, loadProductDetailParsers } = await import("@/lib/shopify-overlay");
const { getFragranceResolver, FRAGRANCE_METAFIELD_IDENTIFIERS } = await import("@/lib/fragrance-fields");
const legacy = await import("@/lib/shopify");

function node(handle, collection, descriptionHtml) {
  return {
    id: `gid://shopify/Product/${handle}`, handle, title: handle, description: "Intro.", descriptionHtml,
    productType: "", vendor: "Officeneed", tags: [], availableForSale: true, featuredImage: null, images: { edges: [] },
    priceRange: { minVariantPrice: { amount: "100", currencyCode: "INR" } },
    variants: { edges: [{ node: { id: `gid://shopify/ProductVariant/${handle}`, title: "Default Title", sku: handle, price: { amount: "100", currencyCode: "INR" }, compareAtPrice: null, availableForSale: true, currentlyNotInStock: false, image: null, selectedOptions: [] } }] },
    options: [], collections: { edges: [{ node: { handle: collection } }] }, metafields: [], giftSetComponents: null,
  };
}
const perfume = node("perfume", "perfumes", "<p>Intro.</p><h3>Fragrance Notes</h3><p>Top Notes: Rose</p>");

test("before the parsers load: fragrance full conversion throws, cards and other products still convert", () => {
  assert.equal(getFragranceResolver(), undefined, "nothing has loaded fragrance-information yet");
  assert.throws(() => shopifyNodeToProduct(perfume), /loadProductDetailParsers/);
  assert.equal(shopifyNodeToCardProduct(perfume).slug, "perfume");
  assert.equal(shopifyNodeToProduct(node("diary", "corporate-gifting", "<p>A diary.</p>")).slug, "diary");
  // The Storefront query still gets the fragrance metafield names without the parsers.
  assert.ok(FRAGRANCE_METAFIELD_IDENTIFIERS.some((m) => m.namespace === "product_fragrance" && m.key === "top_notes"));
  assert.match(legacy.PRODUCT_BY_HANDLE_QUERY, /namespace: "product_fragrance", key: "top_notes"/);
});

test("after loadProductDetailParsers(): fragrance details resolve exactly as before", async () => {
  await loadProductDetailParsers();
  await loadProductDetailParsers(); // idempotent
  assert.equal(typeof getFragranceResolver(), "function");
  const p = shopifyNodeToProduct(perfume);
  assert.equal(p.fragranceNotes.top, "Rose");
  assert.doesNotMatch(p.descriptionHtml, /Top Notes/);
});
