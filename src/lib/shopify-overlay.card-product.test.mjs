// Tests for the homepage performance changes to Shopify product conversion:
// - shopifyNodeToProduct reuses one result per (immutable) node object;
// - shopifyNodeToCardProduct (bestseller carousels) skips only the
//   description-derived detail fields -- everything a ProductCard renders is
//   identical to the full conversion;
// - formatMoney's cached formatters give the same output as before.
//
// Run with: npx tsx --test --experimental-test-module-mocks src/lib/shopify-overlay.card-product.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

const { shopifyNodeToProduct, shopifyNodeToCardProduct, loadProductDetailParsers } = await import("@/lib/shopify-overlay");
// Full conversions need the (lazily loaded) description parsers, as in the app.
await loadProductDetailParsers();
const { formatMoney } = await import("@/lib/shopify");

// Only the product page renders these; cards never read them.
const DETAIL_FIELDS = ["descriptionHtml", "customSections", "features", "fragranceNotes", "specifications"];

function node(overrides = {}) {
  return {
    id: "gid://shopify/Product/1",
    handle: "test-product",
    title: "Test Product",
    description: "A test product.",
    descriptionHtml: "<p>A test product.</p>",
    productType: "Corporate Gifting",
    vendor: "Officeneed",
    tags: ["Best Selling"],
    availableForSale: true,
    featuredImage: null,
    images: { edges: [{ node: { url: "https://cdn.shopify.com/s/files/1/a.webp", altText: null } }] },
    priceRange: { minVariantPrice: { amount: "1499", currencyCode: "INR" } },
    variants: {
      edges: [
        { node: { id: "gid://shopify/ProductVariant/1", title: "Black", sku: "T-1", price: { amount: "1499", currencyCode: "INR" }, compareAtPrice: { amount: "1999", currencyCode: "INR" }, availableForSale: true, currentlyNotInStock: false, image: null, selectedOptions: [] } },
        { node: { id: "gid://shopify/ProductVariant/2", title: "Brown", sku: "T-2", price: { amount: "1599.5", currencyCode: "INR" }, compareAtPrice: null, availableForSale: false, currentlyNotInStock: false, image: null, selectedOptions: [] } },
      ],
    },
    options: [],
    collections: { edges: [{ node: { handle: "corporate-gifting", title: "Corporate Gifting" } }] },
    metafields: [],
    giftSetComponents: null,
    ...overrides,
  };
}

function withoutDetails(product) {
  const rest = { ...product };
  for (const key of DETAIL_FIELDS) delete rest[key];
  return rest;
}

test("shopifyNodeToProduct returns the same result for the same node object, and converts a new node afresh", () => {
  const n = node();
  const first = shopifyNodeToProduct(n);
  assert.equal(shopifyNodeToProduct(n), first);
  const repriced = node({ priceRange: { minVariantPrice: { amount: "999", currencyCode: "INR" } } });
  const other = shopifyNodeToProduct(repriced);
  assert.notEqual(other, first);
  assert.equal(other.priceAmount, 999);
  assert.equal(first.priceAmount, 1499);
});

test("a card product matches the full product on every field except the description details", () => {
  const cases = [
    node({
      handle: "corporate-set",
      descriptionHtml: "<p>Intro.</p><h3>Key Features</h3><ul><li>Leather</li></ul><h3>What's Included</h3><p>Pen, diary</p>",
    }),
    node({
      handle: "perfume",
      collections: { edges: [{ node: { handle: "perfumes" } }] },
      descriptionHtml: "<p>Intro.</p><h3>Product Details</h3><p>Origin: France</p><h3>Fragrance Notes</h3><p>Top Notes: Raspberry</p>",
      metafields: [{ namespace: "product_fragrance", key: "top_notes", value: "Rose" }],
    }),
  ];
  for (const n of cases) {
    const full = shopifyNodeToProduct(n);
    const card = shopifyNodeToCardProduct(n);
    assert.deepEqual(withoutDetails(card), withoutDetails(full), n.handle);
    assert.equal(card.descriptionHtml, undefined, n.handle);
    assert.equal(card.fragranceNotes, undefined, n.handle);
    // What a ProductCard shows is unchanged.
    for (const key of ["slug", "name", "price", "priceAmount", "compareAtAmount", "images", "category", "availability", "startingPrice", "tags"]) {
      assert.deepEqual(card[key], full[key], `${n.handle}.${key}`);
    }
  }
  assert.equal(shopifyNodeToCardProduct(cases[0]), shopifyNodeToCardProduct(cases[0]), "card results are reused per node too");
  // The full conversion still carries the details the product page needs.
  assert.equal(shopifyNodeToProduct(cases[1]).fragranceNotes.top, "Rose");
});

test("formatMoney output is unchanged with cached formatters", () => {
  for (let i = 0; i < 3; i++) {
    assert.equal(formatMoney("1499", "INR"), "₹1,499");
    assert.equal(formatMoney(1599.5, "INR"), "₹1,599.50");
    assert.equal(formatMoney("125000", "INR"), "₹1,25,000");
    assert.equal(formatMoney(12.5, "USD"), new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(12.5));
    // An invalid currency code still falls back to plain text.
    assert.equal(formatMoney("10", "NOT-A-CODE"), "NOT-A-CODE 10.00");
  }
});

test("a refetch with changed prices, availability or variants converts that product afresh (no stale cached product)", async () => {
  const { replaceEqualDeep } = await import("@tanstack/react-query");
  const a = node({ handle: "a" });
  const b = node({ handle: "b" });
  const oldData = [a, b];
  const fetched = structuredClone(oldData);
  // Product b changes: new price, first variant sells out, a new variant appears.
  fetched[1].priceRange.minVariantPrice.amount = "1299";
  fetched[1].variants.edges[0].node.price.amount = "1299";
  fetched[1].variants.edges[0].node.availableForSale = false;
  fetched[1].variants.edges[1].node.availableForSale = false;
  fetched[1].variants.edges.push({ node: { ...fetched[1].variants.edges[0].node, id: "gid://shopify/ProductVariant/3", title: "Tan", sku: "T-3" } });
  // React Query keeps unchanged parts of refetched data by reference (structural sharing).
  const newData = replaceEqualDeep(oldData, fetched);
  assert.equal(newData[0], a, "unchanged product node is reused");
  assert.notEqual(newData[1], b, "changed product node is a new object");

  for (const convert of [shopifyNodeToProduct, shopifyNodeToCardProduct]) {
    const before = convert(b);
    const after = convert(newData[1]);
    assert.equal(convert(newData[0]), convert(a), "unchanged product reuses its cached conversion");
    assert.equal(before.priceAmount, 1499);
    assert.equal(after.priceAmount, 1299);
    assert.equal(before.availability, "In stock");
    assert.equal(after.availability, "Made to order");
    assert.deepEqual(after.variants, ["Black", "Brown", "Tan"]);
    assert.deepEqual(after.variantSkus, ["T-1", "T-2", "T-3"]);
  }
});

test("a B2B price overlay produces a new node, so cached guest prices are never reused for it", async () => {
  const { applyB2BPriceOverlayToAll } = await import("@/lib/b2b-pricing");
  const guest = node({ handle: "b2b" });
  const guestProduct = shopifyNodeToCardProduct(guest);
  const [unchanged] = applyB2BPriceOverlayToAll([guest], { "gid://shopify/ProductVariant/999": { price: { amount: "1", currencyCode: "INR" }, compareAtPrice: null } });
  assert.equal(unchanged, guest, "an overlay with no entry for this product keeps the node");
  const [b2b] = applyB2BPriceOverlayToAll([guest], { "gid://shopify/ProductVariant/1": { price: { amount: "1199", currencyCode: "INR" }, compareAtPrice: null } });
  assert.notEqual(b2b, guest);
  assert.equal(shopifyNodeToCardProduct(b2b).priceAmount, 1199);
  assert.equal(shopifyNodeToCardProduct(guest), guestProduct, "the guest conversion is unaffected");
  assert.equal(guestProduct.priceAmount, 1499);
});
