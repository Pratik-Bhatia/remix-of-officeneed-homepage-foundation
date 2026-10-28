// Tests for src/lib/review-ratings.ts (rating summaries for product cards + PDP).
// Run with: npx tsx --test src/lib/review-ratings.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { averageRating, formatAverage, summarizeRatingsByProduct } from "./review-ratings";

test("averageRating: plain mean, 0 for none", () => {
  assert.equal(averageRating([5, 5, 4, 5, 5]), 4.8);
  assert.equal(averageRating([4]), 4);
  assert.equal(averageRating([]), 0);
});

test("summarizeRatingsByProduct: per product, multiple and single reviews, correct association", () => {
  const m = summarizeRatingsByProduct([
    { product_handle: "pen-set", rating: 5 },
    { product_handle: "diary", rating: 4 },
    { product_handle: "pen-set", rating: 5 },
    { product_handle: "pen-set", rating: 4 },
    { product_handle: "pen-set", rating: 5 },
    { product_handle: "pen-set", rating: 5 },
  ]);
  assert.deepEqual(m.get("pen-set"), { average: 4.8, count: 5 });
  assert.deepEqual(m.get("diary"), { average: 4, count: 1 });
  assert.equal(m.size, 2);
});

test("products with no valid reviews get no entry; invalid rows never fabricate a rating", () => {
  const m = summarizeRatingsByProduct([
    { product_handle: "no-rating", rating: null },
    { product_handle: "out-of-range", rating: 0 },
    { product_handle: "out-of-range", rating: 6 },
    { product_handle: null, rating: 5 },
    { product_handle: "", rating: 5 },
    { product_handle: "mixed", rating: 9 },
    { product_handle: "mixed", rating: 3 },
  ]);
  assert.equal(m.has("no-rating"), false);
  assert.equal(m.has("out-of-range"), false);
  assert.deepEqual(m.get("mixed"), { average: 3, count: 1 }, "only the valid rating counts");
  assert.equal(m.size, 1);
  assert.equal(summarizeRatingsByProduct([]).size, 0);
});

test("formatAverage uses one decimal, like the product page summary", () => {
  assert.equal(formatAverage(4.8), "4.8");
  assert.equal(formatAverage(4), "4.0");
  assert.equal(formatAverage(4.666), "4.7");
});
