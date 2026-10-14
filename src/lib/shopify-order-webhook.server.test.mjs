// Regression tests for the Shopify orders/paid webhook handler
// (src/lib/shopify-order-webhook.server.ts). Mocks Supabase, the email
// service, and the PDF generator -- no real network call, no real email,
// no real database. Builds real HMAC-SHA256 signatures with the Web
// Crypto API (same mechanism the handler itself uses) so signature
// verification is exercised for real, not stubbed out.
//
// Run with: npx tsx --test --experimental-test-module-mocks src/lib/shopify-order-webhook.server.test.mjs
import { test, mock } from "node:test";
import assert from "node:assert/strict";

const WEBHOOK_SECRET = "unit-test-webhook-secret";
process.env["SHOPIFY_WEBHOOK_SECRET"] = WEBHOOK_SECRET;

async function signBody(body, secret) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  let str = "";
  for (const b of new Uint8Array(sig)) str += String.fromCharCode(b);
  return btoa(str);
}

// ---- fake Supabase client: two tables now --
// paid_order_internal_pdf_log (order-level idempotency, as before) and
// buy_now_customization_records (the new persisted-record architecture
// this file's tests exercise). ----
const pdfLogRows = new Map(); // shopify_order_id -> { status, shopify_order_number, error_message }
const customizationRecords = new Map(); // id -> record row
let forceInsertConflict = false;
let nextRecordId = 1;

function seedCustomizationRecord(overrides = {}) {
  const id = `record-${nextRecordId++}`;
  customizationRecords.set(id, {
    id,
    product_name: "Premium Diary Set",
    product_variant: "Black",
    quantity: 1,
    printing_method: "Laser Engraving",
    logo_filename: "acme-logo.png",
    logo_url: "https://assets.example.com/buy-now/logo.png",
    logo_width_mm: 30,
    logo_height_mm: 15,
    logo_position_x: 12.5,
    logo_position_y: -4.2,
    logo_rotation: 0,
    logo_flip_horizontal: false,
    logo_flip_vertical: false,
    preview_image_url: "https://assets.example.com/buy-now/preview.png",
    customization_data: null,
    status: "pending",
    shopify_order_id: null,
    ...overrides,
  });
  return id;
}

function makeFakeClient() {
  return {
    from(table) {
      assert.ok(
        table === "paid_order_internal_pdf_log" || table === "buy_now_customization_records",
        `unexpected table: ${table}`,
      );
      if (table === "buy_now_customization_records") {
        return {
          select() {
            return {
              eq(_col, id) {
                return { async maybeSingle() { return { data: customizationRecords.get(id) ?? null, error: null }; } };
              },
            };
          },
          update(patch) {
            return {
              async eq(_col, id) {
                const existing = customizationRecords.get(id);
                if (existing) customizationRecords.set(id, { ...existing, ...patch });
                return { error: null };
              },
            };
          },
        };
      }
      return {
        select() {
          return {
            eq(_col, orderId) {
              return {
                async maybeSingle() {
                  const row = pdfLogRows.get(orderId);
                  return { data: row ? { status: row.status } : null, error: null };
                },
              };
            },
          };
        },
        async insert({ shopify_order_id, shopify_order_number, status }) {
          if (forceInsertConflict || pdfLogRows.has(shopify_order_id)) {
            return { error: { code: "23505", message: "duplicate key" } };
          }
          pdfLogRows.set(shopify_order_id, { status, shopify_order_number, error_message: null });
          return { error: null };
        },
        update(patch) {
          return {
            async eq(_col, orderId) {
              const existing = pdfLogRows.get(orderId) ?? {};
              pdfLogRows.set(orderId, { ...existing, ...patch });
              return { error: null };
            },
          };
        },
      };
    },
  };
}

let fakeClient = makeFakeClient();
let pdfShouldFail = false;
let emailShouldSucceed = true;
let pdfCallCount = 0;
let emailCallCount = 0;
let lastPdfData = null;
let lastEmailHtml = null;

mock.module("@/lib/attachments.server", {
  namedExports: { getUploadClient: () => fakeClient },
});
mock.module("@/lib/email-service", {
  namedExports: {
    sendInternalHtmlEmail: async (_subject, html) => {
      emailCallCount++;
      lastEmailHtml = html;
      return emailShouldSucceed;
    },
    sendCustomerHtmlEmail: async () => true,
  },
});
mock.module("@/lib/pdf-generator", {
  namedExports: {
    generateCorporateQuotePDF: async (data) => {
      pdfCallCount++;
      lastPdfData = data;
      if (pdfShouldFail) throw new Error("simulated PDF generation failure");
      assert.ok(data.payment, "PDF must be called with a payment block for a paid order");
      assert.equal(data.payment.status, "Paid Online");
      return Buffer.from("%PDF-fake");
    },
  },
});

// fetchAsDataUrl (shopify-order-webhook.server.ts) fetches each
// customization asset URL directly -- mocked here so no real network call
// happens, while still exercising the real fetch-and-convert-to-data-URL
// logic end to end.
globalThis.fetch = async (url) => ({
  ok: true,
  headers: { get: () => "image/png" },
  arrayBuffer: async () => new TextEncoder().encode(`fake-bytes-for:${url}`).buffer,
});

const { handleShopifyOrderWebhookRequest, SHOPIFY_ORDER_WEBHOOK_PATH } = await import("@/lib/shopify-order-webhook.server");

function baseOrderPayload(overrides = {}) {
  return {
    id: 123456,
    order_number: 1042,
    financial_status: "paid",
    created_at: "2026-10-13T10:00:00Z",
    processed_at: "2026-10-13T10:00:05Z",
    total_price: "1999.00",
    currency: "INR",
    customer: { first_name: "Asha", last_name: "Rao", email: "asha@example.com", phone: "+919876543210" },
    line_items: [{ title: "Premium Diary Set", variant_title: "Black", quantity: 2, price: "999.50" }],
    ...overrides,
  };
}

function lineItemWithRecord(recordId, overrides = {}) {
  return {
    title: "Premium Diary Set",
    variant_title: "Black",
    quantity: 1,
    price: "1999.00",
    properties: [{ name: "_Customization Record", value: recordId }],
    ...overrides,
  };
}

async function postWebhook(payloadObj, { secret = WEBHOOK_SECRET, skipSignature = false } = {}) {
  const body = JSON.stringify(payloadObj);
  const headers = { "content-type": "application/json" };
  if (!skipSignature) {
    headers["x-shopify-hmac-sha256"] = await signBody(body, secret);
  }
  const request = new Request(`http://localhost${SHOPIFY_ORDER_WEBHOOK_PATH}`, { method: "POST", headers, body });
  return handleShopifyOrderWebhookRequest({ request, pathname: SHOPIFY_ORDER_WEBHOOK_PATH });
}

test("a non-matching pathname passes through untouched (returns null)", async () => {
  const request = new Request("http://localhost/some/other/path", { method: "POST", body: "{}" });
  const res = await handleShopifyOrderWebhookRequest({ request, pathname: "/some/other/path" });
  assert.equal(res, null);
});

test("a request with no HMAC header is rejected", async () => {
  const res = await postWebhook(baseOrderPayload(), { skipSignature: true });
  assert.equal(res.status, 401);
});

test("a request with an invalid/forged HMAC signature is rejected", async () => {
  const res = await postWebhook(baseOrderPayload(), { secret: "wrong-secret" });
  assert.equal(res.status, 401);
});

test("a correctly-signed order that is NOT financial_status=paid is ignored -- no PDF, no email", async () => {
  pdfCallCount = 0;
  emailCallCount = 0;
  const res = await postWebhook(baseOrderPayload({ id: 999001, financial_status: "pending" }));
  assert.equal(res.status, 200);
  assert.equal(pdfCallCount, 0);
  assert.equal(emailCallCount, 0);
});

test("a correctly-signed, genuinely paid order generates the internal PDF and emails it -- marked sent", async () => {
  pdfCallCount = 0;
  emailCallCount = 0;
  const orderId = 999002;
  const res = await postWebhook(baseOrderPayload({ id: orderId }));
  assert.equal(res.status, 200);
  assert.equal(pdfCallCount, 1);
  assert.equal(emailCallCount, 1);
  assert.equal(pdfLogRows.get(String(orderId))?.status, "sent");
});

test("a duplicate delivery for an already-sent order is a no-op -- never a second PDF or email", async () => {
  pdfCallCount = 0;
  emailCallCount = 0;
  const orderId = 999003;
  await postWebhook(baseOrderPayload({ id: orderId })); // first delivery
  assert.equal(pdfCallCount, 1);
  const res = await postWebhook(baseOrderPayload({ id: orderId })); // Shopify redelivers the same event
  assert.equal(res.status, 200);
  assert.equal(pdfCallCount, 1, "must not generate a second PDF for the same order");
  assert.equal(emailCallCount, 1, "must not send a second email for the same order");
});

test("a concurrent duplicate (insert races into a unique-violation) is treated as already handled, not an error", async () => {
  pdfCallCount = 0;
  forceInsertConflict = true;
  try {
    const res = await postWebhook(baseOrderPayload({ id: 999004 }));
    assert.equal(res.status, 200);
    assert.equal(pdfCallCount, 0);
  } finally {
    forceInsertConflict = false;
  }
});

test("a failure generating the PDF marks the order 'failed' (not 'sent') and returns a non-2xx so Shopify retries", async () => {
  pdfShouldFail = true;
  const orderId = 999005;
  try {
    const res = await postWebhook(baseOrderPayload({ id: orderId }));
    assert.equal(res.status, 500);
    assert.equal(pdfLogRows.get(String(orderId))?.status, "failed");
  } finally {
    pdfShouldFail = false;
  }
});

test("a later retry after a 'failed' status is allowed to process again (not permanently stuck)", async () => {
  pdfCallCount = 0;
  emailCallCount = 0;
  const orderId = 999005; // left in "failed" status by the previous test
  const res = await postWebhook(baseOrderPayload({ id: orderId }));
  assert.equal(res.status, 200);
  assert.equal(pdfCallCount, 1, "a failed order must be retryable, not silently dropped forever");
  assert.equal(pdfLogRows.get(String(orderId))?.status, "sent");
});

test("missing SHOPIFY_WEBHOOK_SECRET fails closed (503), never processes an unverifiable delivery", async () => {
  const saved = process.env["SHOPIFY_WEBHOOK_SECRET"];
  delete process.env["SHOPIFY_WEBHOOK_SECRET"];
  try {
    const request = new Request(`http://localhost${SHOPIFY_ORDER_WEBHOOK_PATH}`, { method: "POST", body: "{}" });
    const res = await handleShopifyOrderWebhookRequest({ request, pathname: SHOPIFY_ORDER_WEBHOOK_PATH });
    assert.equal(res.status, 503);
  } finally {
    process.env["SHOPIFY_WEBHOOK_SECRET"] = saved;
  }
});

test("a GET request to the webhook path is rejected (Shopify only ever sends POST)", async () => {
  const request = new Request(`http://localhost${SHOPIFY_ORDER_WEBHOOK_PATH}`, { method: "GET" });
  const res = await handleShopifyOrderWebhookRequest({ request, pathname: SHOPIFY_ORDER_WEBHOOK_PATH });
  assert.equal(res.status, 405);
});

// ---- Buy Now customization carried via a persisted record reference ----
// Buy Now (ProductCustomizer.tsx, via saveBuyNowCustomization) saves the
// FULL customization to buy_now_customization_records BEFORE checkout,
// then attaches only that record's id as a "_Customization Record" cart
// line attribute. Shopify carries that attribute through onto the order's
// line_items as `properties`. These tests prove the webhook reads that one
// reference back, looks up the real record, and never invents logo/
// branding details beyond what's actually in Supabase for that id.

test("a Buy Now order referencing a real saved customization record produces a PDF populated with that record's actual data, including position", async () => {
  lastPdfData = null;
  const orderId = 999010;
  const recordId = seedCustomizationRecord();
  const res = await postWebhook(baseOrderPayload({ id: orderId, line_items: [lineItemWithRecord(recordId)] }));
  assert.equal(res.status, 200);
  assert.equal(lastPdfData.order.printingMethod, "Laser Engraving");
  assert.equal(lastPdfData.logo.fileName, "acme-logo.png");
  assert.equal(lastPdfData.logo.widthMm, 30);
  assert.equal(lastPdfData.logo.heightMm, 15);
  assert.equal(lastPdfData.logo.positionX, 12.5);
  assert.equal(lastPdfData.logo.positionY, -4.2);
  assert.ok(lastPdfData.previewImageDataUrl?.startsWith("data:image/png;base64,"), "the preview URL must be fetched and embedded as a data URL, not left as a remote link");
  assert.equal(customizationRecords.get(recordId).status, "fulfilled", "the record must be marked fulfilled once its PDF is sent");
  assert.equal(customizationRecords.get(recordId).shopify_order_id, String(orderId));
});

// ---- Original uploaded logo file link (PDF + internal email) ----
// Regression: a fix that stopped (correctly) using the raw logo as a
// stand-in for the "Customization Preview" accidentally left the saved
// logo_url completely unused -- no link in the PDF, no link in the email.
// These tests prove the original file's own URL now reaches both outputs,
// distinct from (and alongside) the rendered product preview.

test("the PDF's logo.fileUrl is the record's actual logo_url -- the ORIGINAL file link, never the composited product preview", async () => {
  lastPdfData = null;
  const recordId = seedCustomizationRecord({ logo_url: "https://assets.example.com/buy-now/original-acme-logo.png", preview_image_url: "https://assets.example.com/buy-now/product-mockup.png" });
  await postWebhook(baseOrderPayload({ id: 999030, line_items: [lineItemWithRecord(recordId)] }));
  assert.equal(lastPdfData.logo.fileUrl, "https://assets.example.com/buy-now/original-acme-logo.png");
  assert.notEqual(lastPdfData.logo.fileUrl, lastPdfData.previewImageDataUrl, "the original logo link and the product mockup preview must be two distinct things, never substituted for each other");
});

test("the internal email includes a working 'Download Original Logo' link to the record's logo_url, mirroring the Request a Quote email format", async () => {
  lastEmailHtml = null;
  const recordId = seedCustomizationRecord({ logo_url: "https://assets.example.com/buy-now/original-acme-logo.png" });
  await postWebhook(baseOrderPayload({ id: 999031, line_items: [lineItemWithRecord(recordId)] }));
  assert.ok(lastEmailHtml.includes('href="https://assets.example.com/buy-now/original-acme-logo.png"'), "email must contain a real href to the original logo file");
  assert.ok(lastEmailHtml.includes("Download Original Logo"), "email must use the same 'Download Original Logo' label the quote flow's email uses");
  assert.ok(lastEmailHtml.includes('src="https://assets.example.com/buy-now/original-acme-logo.png"'), "email must also show the logo thumbnail, same as the quote flow's email");
});

test("a record with a logo filename but no saved logo_url degrades gracefully -- plain text, no broken link, no crash", async () => {
  lastPdfData = null;
  lastEmailHtml = null;
  const recordId = seedCustomizationRecord({ logo_filename: "acme-logo.png", logo_url: null });
  const res = await postWebhook(baseOrderPayload({ id: 999032, line_items: [lineItemWithRecord(recordId)] }));
  assert.equal(res.status, 200);
  assert.equal(lastPdfData.logo.fileUrl, undefined);
  assert.ok(!lastEmailHtml.includes("Download Original Logo"), "must not show a download link when there is no URL to link to");
  assert.ok(lastEmailHtml.includes("acme-logo.png"), "the filename itself must still be shown as plain text");
});

test("a Buy Now order for a gift set whose record has a customization_data breakdown produces a PDF listing those components", async () => {
  lastPdfData = null;
  const orderId = 999011;
  const recordId = seedCustomizationRecord({
    product_name: "Executive Gift Set",
    product_variant: "Brown",
    printing_method: "UV Printing",
    logo_filename: null,
    logo_url: null,
    preview_image_url: null, // gift sets only ever save per-component previews, never a single top-level one
    customization_data: [
      { component: "A5 Notebook Diary", customized: true, widthMm: 30, heightMm: 15, previewUrl: "https://assets.example.com/buy-now/diary.png" },
      { component: "Ball Pen", customized: true, widthMm: 20, heightMm: 5, previewUrl: "https://assets.example.com/buy-now/pen.png" },
      { component: "Keychain", customized: false },
    ],
  });
  const res = await postWebhook(baseOrderPayload({ id: orderId, line_items: [lineItemWithRecord(recordId, { title: "Executive Gift Set", variant_title: "Brown" })] }));
  assert.equal(res.status, 200);
  assert.equal(lastPdfData.giftSetComponents.length, 2, "only the two actually-customized components, not the uncustomized keychain");
  assert.equal(lastPdfData.giftSetComponents[0].name, "A5 Notebook Diary");
  assert.equal(lastPdfData.giftSetComponents[1].name, "Ball Pen");
  // Regression (order #1013): each component's own saved mockup must be embedded, not dropped.
  assert.ok(lastPdfData.giftSetComponents[0].previewImageDataUrl?.startsWith("data:image/"), "diary component preview must be embedded");
  assert.ok(lastPdfData.giftSetComponents[1].previewImageDataUrl?.startsWith("data:image/"), "pen component preview must be embedded");
  assert.equal(lastPdfData.giftSetComponents[0].widthMm, 30);
  assert.equal(lastPdfData.giftSetComponents[1].heightMm, 5);
  // With no single preview saved, the main Customization Preview uses the first component's mockup (never blank).
  assert.equal(lastPdfData.previewImageDataUrl, lastPdfData.giftSetComponents[0].previewImageDataUrl);
});

test("an order with NO customization record reference at all (e.g. a non-customizer purchase) still produces a valid PDF, with no invented logo/branding data", async () => {
  lastPdfData = null;
  const orderId = 999012;
  const res = await postWebhook(baseOrderPayload({ id: orderId, line_items: [{ title: "Plain Pen", quantity: 1, price: "99.00" }] }));
  assert.equal(res.status, 200);
  assert.equal(lastPdfData.logo, undefined);
  assert.equal(lastPdfData.previewImageDataUrl, undefined);
});

test("a customization reference pointing at a record that doesn't exist (deleted/expired) degrades gracefully -- still a valid PDF, no crash", async () => {
  lastPdfData = null;
  const orderId = 999013;
  const res = await postWebhook(baseOrderPayload({ id: orderId, line_items: [lineItemWithRecord("record-does-not-exist")] }));
  assert.equal(res.status, 200);
  assert.equal(pdfCallCount >= 1, true);
  assert.equal(lastPdfData.logo, undefined, "a missing record must never be treated as 'no logo data to show', not invented placeholder data");
});

test("a customization record is reusable across two DIFFERENT paid orders only if referenced -- marking fulfilled does not block a different order from looking up a different record", async () => {
  lastPdfData = null;
  const recordA = seedCustomizationRecord({ logo_filename: "order-a-logo.png" });
  const recordB = seedCustomizationRecord({ logo_filename: "order-b-logo.png" });
  await postWebhook(baseOrderPayload({ id: 999020, line_items: [lineItemWithRecord(recordA)] }));
  assert.equal(lastPdfData.logo.fileName, "order-a-logo.png");
  await postWebhook(baseOrderPayload({ id: 999021, line_items: [lineItemWithRecord(recordB)] }));
  assert.equal(lastPdfData.logo.fileName, "order-b-logo.png");
  assert.equal(customizationRecords.get(recordA).shopify_order_id, "999020");
  assert.equal(customizationRecords.get(recordB).shopify_order_id, "999021");
});
