// Tests for fetchRatingRows (src/hooks/useProductRating.ts): the product-card
// rating read, sent as a plain REST request instead of through the Supabase
// client. It must make exactly the request the client made.
// Run with: npx tsx --test src/hooks/useProductRating.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchRatingRows } from "./useProductRating";

const URL_ = "https://example.supabase.co";
const KEY = "sb_publishable_test";

function fakeFetch(pages) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url: String(url), headers: init.headers });
    const page = pages[calls.length - 1];
    if (page instanceof Error) return { ok: false, status: 500, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => page };
  };
  return { impl, calls };
}

test("requests the approved public ratings view with only handle + rating, using the publishable key", async () => {
  const rows = [{ product_handle: "a", rating: 5 }, { product_handle: "b", rating: 3 }];
  const { impl, calls } = fakeFetch([rows]);
  assert.deepEqual(await fetchRatingRows(URL_, KEY, impl), rows);
  assert.equal(calls.length, 1);
  const u = new URL(calls[0].url);
  assert.equal(u.origin + u.pathname, `${URL_}/rest/v1/product_reviews_public`);
  assert.equal(u.searchParams.get("select"), "product_handle,rating");
  assert.equal(u.searchParams.get("status"), "eq.approved");
  assert.equal(u.searchParams.get("offset"), "0");
  assert.equal(u.searchParams.get("limit"), "1000");
  // Same headers the generated client sends for an sb_publishable_ key: no bearer token.
  assert.deepEqual(calls[0].headers, { apikey: KEY, "Accept-Profile": "public" });
});

test("pages through more than 1000 approved reviews", async () => {
  const full = Array.from({ length: 1000 }, (_, i) => ({ product_handle: `p${i % 7}`, rating: (i % 5) + 1 }));
  const rest = [{ product_handle: "p1", rating: 4 }];
  const { impl, calls } = fakeFetch([full, rest]);
  const rows = await fetchRatingRows(URL_, KEY, impl);
  assert.equal(rows.length, 1001);
  assert.equal(calls.length, 2);
  assert.equal(new URL(calls[1].url).searchParams.get("offset"), "1000");
});

test("throws on a failed request or missing configuration (cards then show no rating)", async () => {
  const { impl } = fakeFetch([new Error("boom")]);
  await assert.rejects(fetchRatingRows(URL_, KEY, impl), /failed \(500\)/);
  await assert.rejects(fetchRatingRows("", KEY, impl), /not configured/);
  await assert.rejects(fetchRatingRows(URL_, "", impl), /not configured/);
});
