import { test } from "node:test";
import assert from "node:assert/strict";

const { shopifyImageUrl, shopifyImageSrcSet } = await import("@/lib/shopify-image");

test("shopifyImageUrl: adds a width param to a real Shopify CDN url", () => {
  const url = "https://cdn.shopify.com/s/files/1/0750/4789/5133/files/mouse.webp?v=1788605683";
  const result = shopifyImageUrl(url, 600);
  assert.equal(result, "https://cdn.shopify.com/s/files/1/0750/4789/5133/files/mouse.webp?v=1788605683&width=600");
});

test("shopifyImageUrl: overwrites an existing width param rather than duplicating it", () => {
  const url = "https://cdn.shopify.com/s/files/1/0750/4789/5133/files/mouse.webp?width=100&v=1788605683";
  const result = shopifyImageUrl(url, 600);
  assert.ok(result.includes("width=600"));
  assert.ok(!result.includes("width=100"));
});

test("shopifyImageUrl: rounds a non-integer width", () => {
  const url = "https://cdn.shopify.com/s/files/1/x/mouse.webp";
  const result = shopifyImageUrl(url, 199.7);
  assert.ok(result.includes("width=200"));
});

test("shopifyImageUrl: passes through a non-Shopify-CDN url unchanged", () => {
  const url = "https://example.com/some-other-image.png";
  assert.equal(shopifyImageUrl(url, 600), url);
});

test("shopifyImageUrl: returns an empty string for null/undefined", () => {
  assert.equal(shopifyImageUrl(null, 600), "");
  assert.equal(shopifyImageUrl(undefined, 600), "");
});

test("shopifyImageUrl: falls back to the original string if it isn't a parseable URL", () => {
  const malformed = "cdn.shopify.com/not-a-real-url";
  assert.equal(shopifyImageUrl(malformed, 600), malformed);
});

test("shopifyImageSrcSet: one width descriptor per requested size, each a resized render of the same image", () => {
  const url = "https://cdn.shopify.com/s/files/1/0750/4789/5133/files/mouse.webp?v=1788605683";
  assert.equal(
    shopifyImageSrcSet(url, [480, 800]),
    "https://cdn.shopify.com/s/files/1/0750/4789/5133/files/mouse.webp?v=1788605683&width=480 480w, https://cdn.shopify.com/s/files/1/0750/4789/5133/files/mouse.webp?v=1788605683&width=800 800w",
  );
});

test("shopifyImageSrcSet: undefined for a non-Shopify url, so the <img> keeps only its plain src", () => {
  assert.equal(shopifyImageSrcSet("https://example.com/some-other-image.png", [480, 800]), undefined);
});

test("shopifyImageSrcSet: undefined for null/undefined/empty", () => {
  assert.equal(shopifyImageSrcSet(null, [480]), undefined);
  assert.equal(shopifyImageSrcSet(undefined, [480]), undefined);
  assert.equal(shopifyImageSrcSet("", [480]), undefined);
});
