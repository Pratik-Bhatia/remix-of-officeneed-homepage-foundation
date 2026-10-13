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

// ---- fake Supabase client: just enough chainable surface for
// claimOrderForProcessing/markOrderStatus to work against an in-memory map ----
const rows = new Map(); // shopify_order_id -> { status, shopify_order_number, error_message }
let forceInsertConflict = false;

function makeFakeClient() {
  return {
    from(table) {
      assert.equal(table, "paid_order_internal_pdf_log");
      return {
        select() {
          return {
            eq(_col, orderId) {
              return {
                async maybeSingle() {
                  const row = rows.get(orderId);
                  return { data: row ? { status: row.status } : null, error: null };
                },
              };
            },
          };
        },
        async insert({ shopify_order_id, shopify_order_number, status }) {
          if (forceInsertConflict || rows.has(shopify_order_id)) {
            return { error: { code: "23505", message: "duplicate key" } };
          }
          rows.set(shopify_order_id, { status, shopify_order_number, error_message: null });
          return { error: null };
        },
        update(patch) {
          return {
            async eq(_col, orderId) {
              const existing = rows.get(orderId) ?? {};
              rows.set(orderId, { ...existing, ...patch });
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

mock.module("@/lib/attachments.server", {
  namedExports: { getUploadClient: () => fakeClient },
});
mock.module("@/lib/email-service", {
  namedExports: {
    sendInternalHtmlEmail: async () => {
      emailCallCount++;
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
  assert.equal(rows.get(String(orderId))?.status, "sent");
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
    assert.equal(rows.get(String(orderId))?.status, "failed");
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
  assert.equal(rows.get(String(orderId))?.status, "sent");
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

// ---- Buy Now customization carried onto the order (line_item properties) ----
// Buy Now (ProductCustomizer.tsx) attaches customization as Shopify cart
// line attributes; Shopify carries those through checkout onto the order's
// line_items as `properties`. These tests prove the webhook reads them
// back correctly and only from there -- never inventing logo/branding
// details that aren't actually on the paid order.

test("a Buy Now order with logo/printing-method properties produces a PDF populated with that real customization data", async () => {
  lastPdfData = null;
  const orderId = 999010;
  const res = await postWebhook(
    baseOrderPayload({
      id: orderId,
      line_items: [
        {
          title: "Premium Diary Set",
          variant_title: "Black",
          quantity: 1,
          price: "1999.00",
          properties: [
            { name: "Printing Method", value: "Laser Engraving" },
            { name: "Logo File", value: "acme-logo.png" },
            { name: "Logo Image", value: "https://assets.example.com/buy-now/logo.png" },
            { name: "Logo Size (mm)", value: "30.0 x 15.0" },
            { name: "Customization Preview", value: "https://assets.example.com/buy-now/preview.png" },
          ],
        },
      ],
    }),
  );
  assert.equal(res.status, 200);
  assert.equal(lastPdfData.order.printingMethod, "Laser Engraving");
  assert.equal(lastPdfData.logo.fileName, "acme-logo.png");
  assert.equal(lastPdfData.logo.widthMm, 30);
  assert.equal(lastPdfData.logo.heightMm, 15);
  assert.ok(lastPdfData.previewImageDataUrl?.startsWith("data:image/png;base64,"), "the preview URL must be fetched and embedded as a data URL, not left as a remote link");
});

test("a Buy Now order for a gift set with 'Component: X' properties produces a PDF listing those components", async () => {
  lastPdfData = null;
  const orderId = 999011;
  const res = await postWebhook(
    baseOrderPayload({
      id: orderId,
      line_items: [
        {
          title: "Executive Gift Set",
          variant_title: "Brown",
          quantity: 1,
          price: "2999.00",
          properties: [
            { name: "Printing Method", value: "UV Printing" },
            { name: "Component: A5 Notebook Diary", value: "Customized, 30.0x15.0mm, https://assets.example.com/buy-now/diary.png" },
            { name: "Component: Ball Pen", value: "Customized, 20.0x5.0mm, https://assets.example.com/buy-now/pen.png" },
          ],
        },
      ],
    }),
  );
  assert.equal(res.status, 200);
  assert.equal(lastPdfData.giftSetComponents.length, 2);
  assert.equal(lastPdfData.giftSetComponents[0].name, "A5 Notebook Diary");
  assert.equal(lastPdfData.giftSetComponents[1].name, "Ball Pen");
});

test("an order with NO customization properties at all (e.g. a non-customizer purchase) still produces a valid PDF, with no invented logo/branding data", async () => {
  lastPdfData = null;
  const orderId = 999012;
  const res = await postWebhook(baseOrderPayload({ id: orderId, line_items: [{ title: "Plain Pen", quantity: 1, price: "99.00" }] }));
  assert.equal(res.status, 200);
  assert.equal(lastPdfData.logo, undefined);
  assert.equal(lastPdfData.previewImageDataUrl, undefined);
});
