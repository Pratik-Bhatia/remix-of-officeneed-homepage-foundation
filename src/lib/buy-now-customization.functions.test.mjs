// Regression tests for src/lib/buy-now-customization.functions.ts's
// saveBuyNowCustomizationRecord -- the plain, non-createServerFn function
// that does the actual upload + persist work (createServerFn's own
// handler can't be invoked directly outside the real server runtime, see
// that file's own comment on this).
//
// Run with: npx tsx --test --experimental-test-module-mocks src/lib/buy-now-customization.functions.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

const { saveBuyNowCustomizationRecord } = await import("@/lib/buy-now-customization.functions");

const TINY_PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

function makeFakeClient({ uploadShouldFail = false } = {}) {
  const uploadedPaths = [];
  const insertedRows = [];
  return {
    _uploadedPaths: uploadedPaths,
    _insertedRows: insertedRows,
    storage: {
      from(bucket) {
        assert.equal(bucket, "corporate-quote-assets");
        return {
          async upload(path, _buffer, _opts) {
            if (uploadShouldFail) return { error: { message: "simulated upload failure" } };
            uploadedPaths.push(path);
            return { error: null };
          },
          getPublicUrl(path) {
            return { data: { publicUrl: `https://assets.example.com/${path}` } };
          },
        };
      },
    },
    from(table) {
      assert.equal(table, "buy_now_customization_records");
      return {
        insert(row) {
          insertedRows.push(row);
          return {
            select() {
              return {
                async single() {
                  return { data: { id: "record-123" }, error: null };
                },
              };
            },
          };
        },
      };
    },
  };
}

function baseInput(overrides = {}) {
  return {
    variantId: "gid://shopify/ProductVariant/1",
    productName: "Premium Diary Set",
    productVariant: "Black",
    quantity: 2,
    printingMethod: "Laser Engraving",
    ...overrides,
  };
}

test("saves a full record with logo position/rotation/dimensions and returns the new record id", async () => {
  const client = makeFakeClient();
  const result = await saveBuyNowCustomizationRecord(
    baseInput({
      logo: {
        name: "acme-logo.png",
        mimeType: "image/png",
        content: TINY_PNG_BASE64,
        scale: 50,
        rotation: 15,
        flipH: true,
        flipV: false,
        x: 12.5,
        y: -4.2,
        widthMm: 30,
        heightMm: 15,
      },
    }),
    client,
  );
  assert.equal(result.ok, true);
  assert.equal(result.recordId, "record-123");
  assert.equal(client._insertedRows.length, 1);
  const row = client._insertedRows[0];
  assert.equal(row.logo_filename, "acme-logo.png");
  assert.equal(row.logo_width_mm, 30);
  assert.equal(row.logo_height_mm, 15);
  assert.equal(row.logo_position_x, 12.5);
  assert.equal(row.logo_position_y, -4.2);
  assert.equal(row.logo_rotation, 15);
  assert.equal(row.logo_flip_horizontal, true);
  assert.equal(row.logo_flip_vertical, false);
  assert.match(row.logo_url, /^https:\/\/assets\.example\.com\/buy-now\//);
  assert.equal(row.status, "pending");
});

test("a gift-set customization produces a customization_data breakdown with per-component preview URLs", async () => {
  const client = makeFakeClient();
  const result = await saveBuyNowCustomizationRecord(
    baseInput({
      giftSetCustomizations: [
        { component: "A5 Notebook Diary", customized: true, widthMm: 30, heightMm: 15, position: { x: 1, y: 2 }, rotation: 0, flip: "none", previewImage: TINY_PNG_BASE64 },
        { component: "Keychain", customized: false },
      ],
    }),
    client,
  );
  assert.equal(result.ok, true);
  const row = client._insertedRows[0];
  assert.equal(row.customization_data.length, 2);
  assert.equal(row.customization_data[0].component, "A5 Notebook Diary");
  assert.equal(row.customization_data[0].customized, true);
  assert.match(row.customization_data[0].previewUrl, /^https:\/\/assets\.example\.com\//);
  assert.equal(row.customization_data[1].component, "Keychain");
  assert.equal(row.customization_data[1].customized, false);
});

test("a failed logo upload does not fail the whole save -- the record is still created, just without a logo_url", async () => {
  const client = makeFakeClient({ uploadShouldFail: true });
  const result = await saveBuyNowCustomizationRecord(
    baseInput({ logo: { name: "acme-logo.png", mimeType: "image/png", content: TINY_PNG_BASE64 } }),
    client,
  );
  assert.equal(result.ok, true, "the record save itself must still succeed even if the storage upload failed");
  assert.equal(client._insertedRows[0].logo_url, null);
});

test("no Supabase client configured fails gracefully (never throws), returning ok:false", async () => {
  const result = await saveBuyNowCustomizationRecord(baseInput(), null);
  assert.equal(result.ok, false);
  assert.equal(result.recordId, null);
});

test("no logo and no gift set still saves a valid record (e.g. printing method only)", async () => {
  const client = makeFakeClient();
  const result = await saveBuyNowCustomizationRecord(baseInput(), client);
  assert.equal(result.ok, true);
  const row = client._insertedRows[0];
  assert.equal(row.logo_filename, null);
  assert.equal(row.printing_method, "Laser Engraving");
  assert.equal(row.customization_data, null);
});
