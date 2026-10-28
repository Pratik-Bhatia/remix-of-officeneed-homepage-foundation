// Tests for src/lib/pagination.ts (PDP reviews pagination).
// Run with: npx tsx --test src/lib/pagination.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { clampPage, pageSlice, pageItems } from "./pagination";

const reviews = (n) => Array.from({ length: n }, (_, i) => `r${i + 1}`);

test("clampPage: 0 items is a single (empty) page; out-of-range pages are clamped", () => {
  assert.deepEqual(clampPage(1, 0, 4), { page: 1, totalPages: 1 });
  assert.deepEqual(clampPage(3, 5, 4), { page: 2, totalPages: 2 });
  assert.deepEqual(clampPage(0, 9, 4), { page: 1, totalPages: 3 });
});

test("pageSlice: 4 per page, original order, last page partial", () => {
  assert.deepEqual(pageSlice(reviews(0), 1, 4), []);
  assert.deepEqual(pageSlice(reviews(1), 1, 4), ["r1"]);
  assert.deepEqual(pageSlice(reviews(4), 1, 4), ["r1", "r2", "r3", "r4"]);
  assert.deepEqual(pageSlice(reviews(5), 2, 4), ["r5"]);
  assert.deepEqual(pageSlice(reviews(9), 2, 4), ["r5", "r6", "r7", "r8"]);
  assert.deepEqual(pageSlice(reviews(9), 3, 4), ["r9"]);
  // A stale page (e.g. after the list shrinks) falls back to the last real page.
  assert.deepEqual(pageSlice(reviews(5), 7, 4), ["r5"]);
});

test("every review appears exactly once across all pages", () => {
  const all = reviews(23);
  const { totalPages } = clampPage(1, all.length, 4);
  const seen = Array.from({ length: totalPages }, (_, i) => pageSlice(all, i + 1, 4)).flat();
  assert.deepEqual(seen, all);
});

test("pageItems: all pages when 7 or fewer", () => {
  assert.deepEqual(pageItems(1, 1), [1]);
  assert.deepEqual(pageItems(2, 3), [1, 2, 3]);
  assert.deepEqual(pageItems(4, 7), [1, 2, 3, 4, 5, 6, 7]);
});

test("pageItems: windowed with ellipses beyond 7 pages, never more than 7 entries", () => {
  assert.deepEqual(pageItems(1, 10), [1, 2, 3, 4, 5, "ellipsis", 10]);
  assert.deepEqual(pageItems(5, 10), [1, "ellipsis", 4, 5, 6, "ellipsis", 10]);
  assert.deepEqual(pageItems(10, 10), [1, "ellipsis", 6, 7, 8, 9, 10]);
  for (let total = 8; total <= 40; total++) {
    for (let cur = 1; cur <= total; cur++) {
      const items = pageItems(cur, total);
      assert.ok(items.length <= 7, `total=${total} cur=${cur} -> ${items.length}`);
      assert.ok(items.includes(cur) && items[0] === 1 && items.at(-1) === total);
    }
  }
});
