// Tests for submitReviewWithPhotosCore (src/lib/review-photos.functions.ts)
// with an in-memory fake of the storage + database client -- no network,
// nothing is written anywhere.
// Run with: npx tsx --test src/lib/review-photos.functions.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { submitReviewWithPhotosCore } from "./review-photos.functions";
import { jpegBytes, pngBytes, webpVp8xBytes } from "./review-photos.fixtures.mjs";

const b64 = (bytes) => Buffer.from(bytes).toString("base64");
const photo = (fullBytes = webpVp8xBytes(1600, 1200), thumbBytes = webpVp8xBytes(192, 192)) => ({ full: b64(fullBytes), thumb: b64(thumbBytes) });
const review = {
  productHandle: "premium-pen-set",
  rating: 4,
  title: "Nice gift",
  body: "Well packed and arrived on time.",
  authorName: "Asha",
  authorEmail: "asha@example.com",
};

function fakeClient({ failUploadAt = -1, failReviewInsert = false, failRowsInsert = false } = {}) {
  const state = { files: new Map(), reviews: [], imageRows: [], deletedReviews: [], uploads: 0 };
  const client = {
    state,
    storage: {
      from(bucket) {
        assert.equal(bucket, "review-images");
        return {
          async upload(path, bytes, opts) {
            if (state.uploads++ === failUploadAt) return { error: { message: "boom" } };
            assert.equal(opts.upsert, false);
            state.files.set(path, { bytes, contentType: opts.contentType });
            return { error: null };
          },
          async remove(paths) {
            for (const p of paths) state.files.delete(p);
            return { error: null };
          },
        };
      },
    },
    from(table) {
      return {
        async insert(row) {
          if (table === "product_reviews") {
            if (failReviewInsert) return { error: { message: "rls" } };
            state.reviews.push(row);
          } else if (table === "product_review_images") {
            if (failRowsInsert) return { error: { message: "fk" } };
            state.imageRows.push(...row);
          }
          return { error: null };
        },
        delete() {
          return { eq: async (_col, id) => { state.deletedReviews.push(id); state.reviews = state.reviews.filter((r) => r.id !== id); return { error: null }; } };
        },
      };
    },
  };
  return client;
}

test("1 photo: stores full + thumb, creates a PENDING review and links the photo to it", async () => {
  const client = fakeClient();
  const res = await submitReviewWithPhotosCore({ ...review, photos: [photo()] }, client, () => "rev-1");
  assert.deepEqual(res, { ok: true });
  assert.deepEqual([...client.state.files.keys()].sort(), ["rev-1/0-full.webp", "rev-1/0-thumb.webp"]);
  assert.equal(client.state.files.get("rev-1/0-full.webp").contentType, "image/webp");
  const [r] = client.state.reviews;
  assert.equal(r.id, "rev-1");
  assert.equal(r.status, "pending", "photos are only published after moderation");
  assert.equal(r.is_verified_buyer, false);
  assert.equal(r.product_handle, "premium-pen-set");
  assert.deepEqual(client.state.imageRows, [
    { review_id: "rev-1", product_handle: "premium-pen-set", position: 0, full_path: "rev-1/0-full.webp", thumb_path: "rev-1/0-thumb.webp", width: 1600, height: 1200 },
  ]);
});

test("5 photos of mixed formats: positions 0-4, extensions from the real bytes", async () => {
  const client = fakeClient();
  const photos = [
    photo(),
    photo(jpegBytes(1200, 1600), jpegBytes(192, 192)),
    photo(pngBytes(800, 600), pngBytes(192, 192)),
    photo(),
    photo(),
  ];
  const res = await submitReviewWithPhotosCore({ ...review, photos }, client, () => "rev-5");
  assert.deepEqual(res, { ok: true });
  assert.equal(client.state.files.size, 10);
  assert.deepEqual(client.state.imageRows.map((r) => r.position), [0, 1, 2, 3, 4]);
  assert.equal(client.state.imageRows[1].full_path, "rev-5/1-full.jpg");
  assert.equal(client.state.files.get("rev-5/1-full.jpg").contentType, "image/jpeg");
  assert.equal(client.state.imageRows[2].full_path, "rev-5/2-full.png");
  assert.ok(client.state.imageRows.every((r) => r.review_id === "rev-5" && r.product_handle === "premium-pen-set"));
});

test("rejects more than 5 photos, invalid or disguised files and oversized images -- before storing anything", async () => {
  const cases = [
    [{ photos: Array.from({ length: 6 }, () => photo()) }, /up to 5/],
    [{ photos: [] }, /No photos/],
    [{ photos: [{ full: b64(Buffer.from("<script>alert(1)</script>")), thumb: b64(webpVp8xBytes(192, 192)) }] }, /isn't a valid/],
    [{ photos: [photo(new Uint8Array(Buffer.from("GIF89a" + "x".repeat(40))))] }, /isn't a valid/],
    [{ photos: [photo(new Uint8Array(3 * 1024 * 1024))] }, /too large/],
    [{ photos: [photo(webpVp8xBytes(1600, 1200), webpVp8xBytes(1600, 1200))] }, /could not be processed/],
    [{ rating: 9, photos: [photo()] }, /rating/],
    [{ authorEmail: "nope", photos: [photo()] }, /email/],
  ];
  for (const [override, message] of cases) {
    const client = fakeClient();
    const res = await submitReviewWithPhotosCore({ ...review, ...override }, client, () => "x");
    assert.equal(res.ok, false);
    assert.match(res.error, message);
    assert.equal(client.state.files.size, 0, "nothing stored");
    assert.equal(client.state.reviews.length, 0, "no review created");
  }
});

test("an upload failure rolls back the files already stored and creates no review", async () => {
  const client = fakeClient({ failUploadAt: 3 });
  const res = await submitReviewWithPhotosCore({ ...review, photos: [photo(), photo()] }, client, () => "rev-x");
  assert.equal(res.ok, false);
  assert.equal(client.state.files.size, 0);
  assert.equal(client.state.reviews.length, 0);
});

test("a failed review insert removes the stored files", async () => {
  const client = fakeClient({ failReviewInsert: true });
  const res = await submitReviewWithPhotosCore({ ...review, photos: [photo()] }, client, () => "rev-y");
  assert.equal(res.ok, false);
  assert.equal(client.state.files.size, 0);
});

test("a failed photo-row insert removes the files AND the just-created review", async () => {
  const client = fakeClient({ failRowsInsert: true });
  const res = await submitReviewWithPhotosCore({ ...review, photos: [photo()] }, client, () => "rev-z");
  assert.equal(res.ok, false);
  assert.equal(client.state.files.size, 0);
  assert.deepEqual(client.state.deletedReviews, ["rev-z"]);
  assert.equal(client.state.reviews.length, 0);
});
