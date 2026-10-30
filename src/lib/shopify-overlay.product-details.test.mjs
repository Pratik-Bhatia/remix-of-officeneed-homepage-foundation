// Regression test for the "empty accordion section" bug -- confirmed live
// against this store's real catalogue (25 of 337 sampled products): a
// description's own recognized-header regex (shopifyNodeToProduct's
// internal extractStructuredData) can match an inline bolded label like
// "<b>Material:</b>" sitting INSIDE a "Technical Specifications:" bullet
// list -- splitting that list right before its own content, leaving the
// preceding section ("Product Details") with nothing but leftover opening
// tags ("<ul><li><p>") and no visible text. shopifyNodeToProduct must never
// surface that as a customSections entry (ProductInformation.tsx renders
// every customSections entry unconditionally, with no content check of its
// own), while a section with genuine content -- including the one that
// absorbed the split-off text -- must still render exactly as before.
//
// Run with: npx tsx --test --experimental-test-module-mocks src/lib/shopify-overlay.product-details.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

const { shopifyNodeToProduct, loadProductDetailParsers } = await import("@/lib/shopify-overlay");
// Full conversions need the (lazily loaded) description parsers, as in the app.
await loadProductDetailParsers();

function baseNode(overrides = {}) {
  return {
    id: "gid://shopify/Product/1",
    handle: "test-product",
    title: "Test Product",
    description: "A test product.",
    descriptionHtml: "<p>A test product.</p>",
    productType: "Corporate Gifting",
    vendor: "Officeneed",
    tags: [],
    availableForSale: true,
    featuredImage: null,
    images: { edges: [] },
    priceRange: { minVariantPrice: { amount: "100", currencyCode: "INR" } },
    variants: {
      edges: [
        {
          node: {
            id: "gid://shopify/ProductVariant/1",
            title: "Default Title",
            sku: "TEST-1",
            price: { amount: "100", currencyCode: "INR" },
            compareAtPrice: null,
            availableForSale: true,
            currentlyNotInStock: false,
            image: null,
            selectedOptions: [],
          },
        },
      ],
    },
    options: [],
    collections: { edges: [{ node: { handle: "corporate-gifting", title: "Corporate Gifting" } }] },
    metafields: [],
    giftSetComponents: null,
    ...overrides,
  };
}

test("a 'Technical Specifications' list whose inline 'Material:' label gets matched as its own header no longer leaves an empty 'PRODUCT DETAILS' custom section", () => {
  const html =
    "<p>Intro text.</p>" +
    "<p><b>Technical Specifications:</b></p>" +
    "<ul><li><p><b>Material:</b> Aluminum Body</p></li>" +
    "<li><p><b>Packaging:</b> Attractive Box Packing</p></li></ul>";
  const product = shopifyNodeToProduct(baseNode({ descriptionHtml: html }));
  const titles = (product.customSections ?? []).map((s) => s.title);
  assert.ok(!titles.includes("PRODUCT DETAILS"), `expected no empty PRODUCT DETAILS section, got sections: ${JSON.stringify(titles)}`);
  // The real content isn't lost -- it surfaces under the header the regex
  // actually matched ("Material"), exactly as it did before this fix.
  const materialSection = (product.customSections ?? []).find((s) => s.title === "MATERIAL");
  assert.ok(materialSection, "expected a MATERIAL section carrying the real content");
  assert.match(materialSection.contentHtml, /Aluminum Body/);
});

test("a section with genuine, non-empty content is never suppressed", () => {
  const html =
    "<p>Intro text.</p>" +
    "<p><b>Key Features:</b></p>" +
    "<ul><li>Lightweight and durable.</li><li>Easy to clean.</li></ul>";
  const product = shopifyNodeToProduct(baseNode({ descriptionHtml: html }));
  const keyFeatures = (product.customSections ?? []).find((s) => s.title === "KEY FEATURES");
  assert.ok(keyFeatures, "expected the KEY FEATURES section to still render");
  assert.match(keyFeatures.contentHtml, /Lightweight and durable/);
});

test("a section containing only an image (no text) is still treated as having content", () => {
  const html =
    "<p>Intro text.</p>" +
    "<p><b>Care Information:</b></p>" +
    '<img src="https://cdn.shopify.com/care-instructions.png" alt="Care instructions" />';
  const product = shopifyNodeToProduct(baseNode({ descriptionHtml: html }));
  const care = (product.customSections ?? []).find((s) => s.title === "CARE INFORMATION");
  assert.ok(care, "expected an image-only section to still render, not be treated as empty");
});

test("a product with no recognized header phrases at all is completely unaffected (the common, no-structured-sections case)", () => {
  const html = "<p>Just a plain description, no special sections.</p>";
  const product = shopifyNodeToProduct(baseNode({ descriptionHtml: html }));
  assert.equal(product.customSections, undefined);
  assert.equal(product.descriptionHtml, html);
});

test("fragrance conversion queries and resolves dedicated fields without raw duplicate accordions", async () => {
  const { PRODUCT_BY_HANDLE_QUERY } = await import("@/lib/shopify");
  assert.match(PRODUCT_BY_HANDLE_QUERY, /namespace: "product_fragrance", key: "top_notes"/);
  const product = shopifyNodeToProduct(baseNode({
    collections: { edges: [{ node: { handle: "perfumes" } }] },
    descriptionHtml: "<p>Intro.</p><h3>Product Details</h3><p>Origin: France</p><h3>Fragrance Notes</h3><p>Top Notes: Raspberry</p><p>Best For: Evenings.</p>",
    metafields: [{ namespace: "product_fragrance", key: "origin", value: "Italy" }, { namespace: "product_fragrance", key: "top_notes", value: "Rose" }],
  }));
  assert.equal(product.category, "Fragrance Gifting");
  assert.deepEqual(product.specifications, [{ label: "Origin", value: "Italy" }]);
  assert.equal(product.fragranceNotes.top, "Rose");
  assert.equal(product.customSections, undefined);
  assert.doesNotMatch(product.descriptionHtml, /France|Raspberry/);
  assert.match(product.descriptionHtml, /Best For: Evenings/);
});
