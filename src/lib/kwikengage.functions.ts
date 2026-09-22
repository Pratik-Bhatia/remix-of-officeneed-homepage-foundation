/**
 * KwikEngage WhatsApp trigger: fires when a shopper leaves/closes a product page.
 *
 * SECURITY:
 *  - The API key is read from process.env at request time and never returned,
 *    logged or exposed to the browser.
 *  - The browser only sends the product context and (optionally) its Shopify
 *    customer access token; the phone number is resolved server-side when the
 *    shopper is signed in.
 */
import { createServerFn } from "@tanstack/react-start";

const KWIKENGAGE_ENDPOINT = "https://kwikengage.ai";
const SHOPIFY_API_VERSION = "2025-07";
const SHOPIFY_STOREFRONT_URL = `https://har1k4-di.myshopify.com/api/${SHOPIFY_API_VERSION}/graphql.json`;

// Approved KwikEngage template for the browse-abandon message.
const TEMPLATE_NAME = "product_page_abandoned_1_20260922_1218";
const TEMPLATE_LANGUAGE = "en";

type AbandonInput = {
  productHandle: string;
  productTitle: string;
  productUrl: string;
  /** Phone captured by the chat / enquiry flow, if any. */
  phone?: string;
  /** Shopify customer access token, if the shopper is signed in. */
  customerToken?: string;
};

type AbandonResult = { ok: boolean; sent: boolean; reason?: string };

function normalizePhone(input: string | null | undefined): string | null {
  if (!input) return null;
  let digits = String(input).replace(/\D/g, "");
  if (digits.startsWith("91") && digits.length === 12) digits = digits.slice(2);
  if (digits.startsWith("0") && digits.length === 11) digits = digits.slice(1);
  if (!/^[6-9]\d{9}$/.test(digits)) return null;
  return `91${digits}`;
}

async function resolveCustomerPhone(token: string): Promise<string | null> {
  const storefrontToken =
    process.env["SHOPIFY_HEADLESS_STOREFRONT_TOKEN"] ??
    process.env["SHOPIFY_HEADLESS_STOREFRONT_TOKEN_TEST"] ??
    process.env["SHOPIFY_STOREFRONT_ACCESS_TOKEN"];
  if (!storefrontToken) return null;

  try {
    const response = await fetch(SHOPIFY_STOREFRONT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Storefront-Access-Token": storefrontToken,
      },
      body: JSON.stringify({
        query: `query CustomerPhone($token: String!) {
          customer(customerAccessToken: $token) { phone defaultAddress { phone } }
        }`,
        variables: { token },
      }),
    });
    if (!response.ok) return null;
    const json = (await response.json()) as {
      data?: { customer?: { phone?: string | null; defaultAddress?: { phone?: string | null } | null } | null };
    };
    const customer = json.data?.customer;
    return normalizePhone(customer?.phone) ?? normalizePhone(customer?.defaultAddress?.phone ?? null);
  } catch {
    return null;
  }
}

export const sendProductBrowseAbandon = createServerFn({ method: "POST" })
  .inputValidator((input: AbandonInput) => {
    if (!input?.productHandle || typeof input.productHandle !== "string") {
      throw new Error("Missing product handle.");
    }
    const phone = input.phone ? String(input.phone).slice(0, 20) : undefined;
    const customerToken = input.customerToken ? String(input.customerToken).slice(0, 500) : undefined;
    return {
      productHandle: input.productHandle.slice(0, 200),
      productTitle: String(input.productTitle ?? "").slice(0, 200),
      productUrl: String(input.productUrl ?? "").slice(0, 500),
      ...(phone ? { phone } : {}),
      ...(customerToken ? { customerToken } : {}),
    } satisfies AbandonInput;
  })
  .handler(async ({ data }): Promise<AbandonResult> => {
    const apiKey = process.env["KWIKENGAGE_API_KEY"];
    if (!apiKey) return { ok: false, sent: false, reason: "not_configured" };

    // Signed-in customer's number wins; otherwise use the number the visitor
    // already shared through the chat / enquiry flow.
    const phone =
      (data.customerToken ? await resolveCustomerPhone(data.customerToken) : null) ??
      normalizePhone(data.phone);

    if (!phone) return { ok: true, sent: false, reason: "no_phone" };

    const body = {
      to: phone,
      channel: "whatsapp",
      type: "template",
      template: {
        name: TEMPLATE_NAME,
        language: { code: TEMPLATE_LANGUAGE },
      },
    };

    try {
      const response = await fetch(KWIKENGAGE_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        return { ok: false, sent: false, reason: `kwikengage_${response.status}` };
      }
      return { ok: true, sent: true };
    } catch {
      return { ok: false, sent: false, reason: "network_error" };
    }
  });
