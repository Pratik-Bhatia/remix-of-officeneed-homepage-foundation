// Shopify "orders/paid" webhook handler. Server-only -- never imported by
// client code. Wired into the global request pipeline from src/start.ts,
// ahead of the access gate, so it keeps working even while the pre-launch
// gate (src/lib/access-gate.server.ts) is enabled.
//
// Generates the internal "Paid Online" order-record PDF (see
// generateCorporateQuotePDF in src/lib/pdf-generator.ts) and emails it to
// the OfficeNeed team ONLY -- never the customer -- once Shopify itself
// has confirmed payment. Clicking "Buy Now" or reaching the checkout page
// is never treated as proof of payment; only this authenticated webhook
// is.
//
// ---- Required setup (manual, in Shopify Admin -- not done by this code) ----
// 1. Shopify Admin -> Settings -> Notifications -> Webhooks -> Create webhook
//    - Event: "Order payment" (orders/paid)
//    - Format: JSON
//    - URL: https://<your-domain>/api/webhooks/shopify-orders-paid
// 2. Copy the signing secret Shopify shows for that webhook into the
//    deployment environment as SHOPIFY_WEBHOOK_SECRET.
// No code change is needed to turn this on -- once both of the above are
// done, paid Buy Now orders start producing the internal PDF automatically.
import { getUploadClient } from "./attachments.server";
import { sendInternalHtmlEmail } from "./email-service";
import { generateCorporateQuotePDF } from "./pdf-generator";

export const SHOPIFY_ORDER_WEBHOOK_PATH = "/api/webhooks/shopify-orders-paid";

function getWebhookSecret(): string | null {
  return process.env["SHOPIFY_WEBHOOK_SECRET"] || null;
}

async function hmacSha256Base64(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  let str = "";
  for (const b of new Uint8Array(sig)) str += String.fromCharCode(b);
  return btoa(str);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Minimal shape of the fields this handler actually reads from Shopify's
// standard REST "Order" webhook payload -- not a full Order type.
interface ShopifyOrderWebhookPayload {
  id: number | string;
  order_number?: number | string;
  name?: string;
  financial_status?: string;
  created_at?: string;
  processed_at?: string;
  total_price?: string;
  currency?: string;
  customer?: {
    first_name?: string;
    last_name?: string;
    email?: string;
    phone?: string;
  };
  email?: string;
  phone?: string;
  line_items?: Array<{
    title?: string;
    variant_title?: string;
    quantity?: number;
    price?: string;
    // Shopify's name for cart line attributes once they land on the real
    // order -- this is how ProductCustomizer.tsx's Buy Now customization
    // metadata (see src/lib/buy-now-customization.functions.ts and
    // CartItem.lineAttributes in src/stores/cartStore.ts) actually arrives
    // here: Shopify carries cart line attributes through checkout onto the
    // order's line_items as `properties`, no separate lookup needed.
    properties?: Array<{ name: string; value: string }>;
  }>;
}

interface ParsedCustomization {
  printingMethod: string | undefined;
  logoFileName: string | undefined;
  logoImageUrl: string | undefined;
  logoSizeMm: string | undefined;
  logoRotation: string | undefined;
  previewImageUrl: string | undefined;
  giftSetComponents: Array<{ name: string; detail: string }>;
}

/** Reads back the plain-text cart line attributes Buy Now attached
 * (uploadBuyNowCustomizationAssets) from the order's own line_items --
 * never trusts anything the frontend might claim about customization
 * outside of what Shopify itself carried onto the paid order. Returns
 * undefined if the order has no customization properties at all (a Buy
 * Now purchase always has some, since it requires a valid logo -- absence
 * here just means an older order, or the asset upload failed and the
 * purchase proceeded without attributes). */
function parseCustomizationFromLineItems(payload: ShopifyOrderWebhookPayload): ParsedCustomization | undefined {
  const properties = payload.line_items?.flatMap((li) => li.properties ?? []) ?? [];
  if (properties.length === 0) return undefined;
  const get = (name: string) => properties.find((p) => p.name === name)?.value;
  const giftSetComponents = properties
    .filter((p) => p.name.startsWith("Component: "))
    .map((p) => ({ name: p.name.replace(/^Component: /, ""), detail: p.value }));
  return {
    printingMethod: get("Printing Method"),
    logoFileName: get("Logo File"),
    logoImageUrl: get("Logo Image"),
    logoSizeMm: get("Logo Size (mm)"),
    logoRotation: get("Logo Rotation"),
    previewImageUrl: get("Customization Preview"),
    giftSetComponents,
  };
}

/** jsPDF needs image bytes directly (a data: URL), not a remote URL it can
 * fetch itself -- same constraint generateCorporateQuotePDF's existing
 * previewImageDataUrl/logo fields already have. Fetches the Supabase
 * public URL Buy Now uploaded and converts it; returns undefined on any
 * failure rather than throwing, so a fetch hiccup degrades to "no preview
 * embedded" instead of failing the whole internal PDF. */
async function fetchAsDataUrl(url: string | undefined): Promise<string | undefined> {
  if (!url) return undefined;
  try {
    const res = await fetch(url);
    if (!res.ok) return undefined;
    const contentType = res.headers.get("content-type") || "image/png";
    const buffer = await res.arrayBuffer();
    let binary = "";
    for (const b of new Uint8Array(buffer)) binary += String.fromCharCode(b);
    return `data:${contentType};base64,${btoa(binary)}`;
  } catch (err) {
    console.error("[shopify-order-webhook] failed to fetch customization asset for PDF embed:", err);
    return undefined;
  }
}

function formatAmount(amount: string | undefined, currency: string | undefined): string {
  if (!amount) return "—";
  return currency ? `${currency} ${amount}` : amount;
}

function formatPaymentDate(iso: string | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" });
  } catch {
    return iso;
  }
}

/**
 * Claims this order id for processing (status 'pending') if it hasn't
 * already been successfully sent. Returns:
 *  - "claimed": safe to proceed and generate/send the PDF
 *  - "already-sent": a prior delivery already completed this order -- no-op
 *  - "claim-failed": could not even record the attempt (DB unavailable) --
 *    caller should fail loudly so Shopify retries rather than silently
 *    dropping the event
 * Retried/duplicate webhook deliveries for the SAME order id are the
 * expected normal case here, not an error -- Shopify resends on anything
 * but a 2xx response, and may occasionally redeliver even after a 2xx.
 */
async function claimOrderForProcessing(
  client: ReturnType<typeof getUploadClient>,
  orderId: string,
  orderNumber: string,
): Promise<"claimed" | "already-sent" | "claim-failed"> {
  if (!client) return "claim-failed";

  const { data: existing } = await client
    .from("paid_order_internal_pdf_log")
    .select("status")
    .eq("shopify_order_id", orderId)
    .maybeSingle();

  if (existing?.status === "sent") return "already-sent";
  if (existing) {
    // A prior attempt exists but never completed ("pending" left over from
    // a crashed/killed process, or "failed") -- allow this delivery to
    // retry it.
    return "claimed";
  }

  const { error: insertError } = await client
    .from("paid_order_internal_pdf_log")
    .insert({ shopify_order_id: orderId, shopify_order_number: orderNumber, status: "pending" });

  if (insertError) {
    // Unique-violation = a concurrent delivery just claimed it first --
    // treat as already being handled, not an error.
    if (insertError.code === "23505") return "already-sent";
    console.error("[shopify-order-webhook] failed to claim order for processing:", insertError);
    return "claim-failed";
  }
  return "claimed";
}

async function markOrderStatus(
  client: ReturnType<typeof getUploadClient>,
  orderId: string,
  status: "sent" | "failed",
  errorMessage?: string,
): Promise<void> {
  if (!client) return;
  await client
    .from("paid_order_internal_pdf_log")
    .update({ status, error_message: errorMessage ?? null })
    .eq("shopify_order_id", orderId);
}

async function processOrderPaid(payload: ShopifyOrderWebhookPayload): Promise<void> {
  const orderId = String(payload.id);
  const orderNumber = String(payload.order_number ?? payload.name ?? payload.id);
  const client = getUploadClient();

  const claim = await claimOrderForProcessing(client, orderId, orderNumber);
  if (claim === "already-sent") {
    console.log(`[shopify-order-webhook] order ${orderNumber} already processed -- skipping duplicate delivery`);
    return;
  }
  if (claim === "claim-failed") {
    throw new Error("Could not record processing claim (database unavailable) -- failing so Shopify retries.");
  }

  try {
    const customerName = [payload.customer?.first_name, payload.customer?.last_name].filter(Boolean).join(" ") || "—";
    const customerEmail = payload.customer?.email ?? payload.email ?? "—";
    const customerPhone = payload.customer?.phone ?? payload.phone ?? "—";
    const firstLine = payload.line_items?.[0];
    const productName = firstLine?.title ?? "—";
    const variant = firstLine?.variant_title;
    const quantity = payload.line_items?.reduce((sum, li) => sum + (li.quantity ?? 0), 0) ?? firstLine?.quantity ?? 0;

    // Buy Now attaches customization as cart line attributes, which
    // Shopify carries through onto the order's line_items as `properties`
    // (see parseCustomizationFromLineItems) -- this is the ONLY place this
    // handler ever reads logo/branding details from, never anything the
    // frontend could claim outside of what actually landed on the real,
    // paid Shopify order.
    const customization = parseCustomizationFromLineItems(payload);
    const [logoImageDataUrl, previewImageDataUrl] = await Promise.all([
      fetchAsDataUrl(customization?.logoImageUrl),
      fetchAsDataUrl(customization?.previewImageUrl),
    ]);

    const pdfBuffer = await generateCorporateQuotePDF({
      refNumber: orderNumber,
      date: new Date().toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" }),
      customer: { name: customerName, company: "—", email: customerEmail, phone: customerPhone },
      order: {
        productName,
        variant,
        quantity,
        printingMethod: customization?.printingMethod,
        location: "—",
      },
      ...(customization?.logoFileName
        ? {
            logo: {
              fileName: customization.logoFileName,
              ...(customization.logoSizeMm
                ? (() => {
                    const [w, h] = customization.logoSizeMm!.split(" x ").map(Number);
                    return isFinite(w!) && isFinite(h!) ? { widthMm: w, heightMm: h } : {};
                  })()
                : {}),
              rotation: customization.logoRotation ? parseFloat(customization.logoRotation) : undefined,
            },
          }
        : {}),
      ...(previewImageDataUrl ? { previewImageDataUrl } : logoImageDataUrl ? { previewImageDataUrl: logoImageDataUrl } : {}),
      ...(customization?.giftSetComponents.length
        ? {
            giftSetComponents: customization.giftSetComponents.map((c) => ({
              name: c.name,
              customized: true,
              variant,
            })),
          }
        : {}),
      payment: {
        status: "Paid Online",
        shopifyOrderNumber: orderNumber,
        paymentDate: formatPaymentDate(payload.processed_at ?? payload.created_at),
        amountPaid: formatAmount(payload.total_price, payload.currency),
        transactionReference: orderId,
      },
    });

    const html = `
      <h2>Order Paid Online: ${orderNumber}</h2>
      <p><strong>Status:</strong> Paid Online</p>
      <p><strong>Customer:</strong> ${customerName} (${customerEmail}${customerPhone !== "—" ? `, ${customerPhone}` : ""})</p>
      <p><strong>Product:</strong> ${productName}${variant ? ` — ${variant}` : ""}</p>
      <p><strong>Quantity:</strong> ${quantity}</p>
      <p><strong>Amount Paid:</strong> ${formatAmount(payload.total_price, payload.currency)}</p>
      ${customization?.logoFileName ? `<p><strong>Logo:</strong> ${customization.logoFileName}${customization.logoSizeMm ? ` (${customization.logoSizeMm} mm)` : ""}</p>` : ""}
      ${customization?.printingMethod ? `<p><strong>Printing Method:</strong> ${customization.printingMethod}</p>` : ""}
      <p><em>Internal order record attached as a PDF. This is not the customer's invoice -- it is sent to the OfficeNeed team only.</em></p>
    `;

    const sent = await sendInternalHtmlEmail(
      `Paid Online Order: ${orderNumber} — ${productName}`,
      html,
      [{ filename: `OfficeNeed-Order-${orderNumber}.pdf`, content: pdfBuffer }],
    );

    if (!sent) throw new Error("sendInternalHtmlEmail returned false (email not configured or send failed).");

    await markOrderStatus(client, orderId, "sent");
    console.log(`[shopify-order-webhook] order ${orderNumber}: internal PDF generated and emailed.`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[shopify-order-webhook] order ${orderNumber}: processing failed -- `, err);
    await markOrderStatus(client, orderId, "failed", message);
    // Re-throw so the caller returns a non-2xx and Shopify retries delivery
    // later -- the order stays claimed as "failed", which a future
    // delivery is allowed to retry (see claimOrderForProcessing).
    throw err;
  }
}

/**
 * The single entry point the request middleware (src/start.ts) calls for
 * every incoming request. Returns a Response for a matching webhook
 * delivery, or `null` to mean "not this endpoint -- let the real app
 * handle it".
 */
export async function handleShopifyOrderWebhookRequest({
  request,
  pathname,
}: {
  request: Request;
  pathname: string;
}): Promise<Response | null> {
  if (pathname !== SHOPIFY_ORDER_WEBHOOK_PATH) return null;
  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  const secret = getWebhookSecret();
  if (!secret) {
    console.error("[shopify-order-webhook] SHOPIFY_WEBHOOK_SECRET is not configured -- rejecting delivery.");
    return new Response("Webhook not configured", { status: 503 });
  }

  const rawBody = await request.text();
  const providedHmac = request.headers.get("x-shopify-hmac-sha256");
  if (!providedHmac) return new Response("Missing signature", { status: 401 });

  const expectedHmac = await hmacSha256Base64(secret, rawBody);
  if (!timingSafeEqual(expectedHmac, providedHmac)) {
    console.error("[shopify-order-webhook] HMAC verification failed -- rejecting delivery.");
    return new Response("Invalid signature", { status: 401 });
  }

  const topic = request.headers.get("x-shopify-topic");
  let payload: ShopifyOrderWebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response("Malformed JSON", { status: 400 });
  }

  // Defense in depth: even though this endpoint is meant to be registered
  // only for the orders/paid topic, explicitly re-check the order's own
  // financial_status rather than trusting the topic/subscription alone --
  // "reaching checkout or clicking Buy Now is not proof of payment" applies
  // here too.
  if (payload.financial_status !== "paid") {
    console.log(
      `[shopify-order-webhook] order ${payload.id} topic=${topic} financial_status=${payload.financial_status} -- not paid, ignoring.`,
    );
    return new Response("Ignored (not paid)", { status: 200 });
  }

  try {
    await processOrderPaid(payload);
    return new Response("OK", { status: 200 });
  } catch (err) {
    // Non-2xx -- Shopify will retry this delivery with backoff.
    return new Response("Processing failed, will retry", { status: 500 });
  }
}
