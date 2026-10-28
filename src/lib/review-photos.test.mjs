// Tests for src/lib/review-photos.ts (pure review-photo logic).
// Run with: npx tsx --test src/lib/review-photos.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { inspectImage, photoStrip, reviewPhotoPaths, validateReviewFields } from "./review-photos";
import { jpegBytes, pngBytes, webpVp8Bytes, webpVp8lBytes, webpVp8xBytes } from "./review-photos.fixtures.mjs";

test("inspectImage reads the real format and size of PNG, JPEG and WebP (VP8/VP8L/VP8X)", () => {
  assert.deepEqual(inspectImage(pngBytes(640, 480)), { format: "png", width: 640, height: 480 });
  assert.deepEqual(inspectImage(jpegBytes(1600, 1200)), { format: "jpeg", width: 1600, height: 1200 });
  assert.deepEqual(inspectImage(webpVp8xBytes(1200, 900)), { format: "webp", width: 1200, height: 900 });
  assert.deepEqual(inspectImage(webpVp8Bytes(192, 192)), { format: "webp", width: 192, height: 192 });
  assert.deepEqual(inspectImage(webpVp8lBytes(300, 200)), { format: "webp", width: 300, height: 200 });
});

test("inspectImage rejects non-images, disguised files, truncated headers, animation and absurd sizes", () => {
  assert.equal(inspectImage(new Uint8Array(Buffer.from("<html><script>alert(1)</script></html>"))), null, "HTML renamed to .jpg");
  assert.equal(inspectImage(new Uint8Array(Buffer.from("GIF89a\x01\x00\x01\x00\x00\x00\x00"))), null, "GIF is not accepted");
  assert.equal(inspectImage(new Uint8Array(Buffer.from("%PDF-1.7 ......................"))), null, "PDF");
  assert.equal(inspectImage(new Uint8Array([0xff, 0xd8, 0xff])), null, "truncated JPEG");
  assert.equal(inspectImage(pngBytes(640, 480).subarray(0, 20)), null, "truncated PNG");
  assert.equal(inspectImage(webpVp8xBytes(400, 400, true)), null, "animated WebP");
  assert.equal(inspectImage(pngBytes(0, 480)), null, "zero width");
  assert.equal(inspectImage(pngBytes(9000, 480)), null, "over 8000px");
  assert.equal(inspectImage(new Uint8Array()), null, "empty");
});

test("validateReviewFields mirrors the review insert policy", () => {
  const ok = { productHandle: "pen-set", rating: 5, title: "Great", body: "Lovely pen.", authorName: "Asha", authorEmail: "asha@example.com" };
  assert.equal(validateReviewFields(ok), null);
  assert.match(validateReviewFields({ ...ok, rating: 0 }), /rating/);
  assert.match(validateReviewFields({ ...ok, rating: 4.5 }), /rating/);
  assert.match(validateReviewFields({ ...ok, title: "   " }), /title/);
  assert.match(validateReviewFields({ ...ok, title: "x".repeat(151) }), /title/);
  assert.match(validateReviewFields({ ...ok, body: "x".repeat(4001) }), /review/);
  assert.match(validateReviewFields({ ...ok, authorName: "" }), /Name/);
  assert.match(validateReviewFields({ ...ok, authorEmail: "not-an-email" }), /email/);
  assert.match(validateReviewFields({ ...ok, productHandle: "" }), /product/);
});

test("photoStrip shows at most 3 thumbnails with +N for the rest", () => {
  assert.deepEqual(photoStrip(0), { visible: 0, overflow: 0 });
  assert.deepEqual(photoStrip(1), { visible: 1, overflow: 0 });
  assert.deepEqual(photoStrip(3), { visible: 3, overflow: 0 });
  assert.deepEqual(photoStrip(5), { visible: 3, overflow: 2 });
});

test("storage paths are generated from the review id and position only", () => {
  assert.deepEqual(reviewPhotoPaths("rid", 2, "webp"), { full: "rid/2-full.webp", thumb: "rid/2-thumb.webp" });
  assert.deepEqual(reviewPhotoPaths("rid", 0, "jpeg"), { full: "rid/0-full.jpg", thumb: "rid/0-thumb.jpg" });
});
