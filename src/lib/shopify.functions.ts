/**
 * Server-side Shopify Storefront API proxy.
 *
 * The browser calls proxyStorefrontRequest instead of hitting Shopify
 * directly. This keeps the Shopify access token entirely on the server,
 * eliminating the build-time placeholder problem.
 *
 * SECURITY:
 *  - Token is read from process.env at request time — never build time.
 *  - Token is never logged, returned, or included in the response.
 *  - Only validates and forwards the Storefront GraphQL body (query /
 *    variables / operationName). No arbitrary URL proxying.
 */
import { createServerFn } from "@tanstack/react-start";

const SHOPIFY_API_VERSION = "2025-07";
const SHOPIFY_STORE_PERMANENT_DOMAIN = "har1k4-di.myshopify.com";
const SHOPIFY_STOREFRONT_URL = `https://${SHOPIFY_STORE_PERMANENT_DOMAIN}/api/${SHOPIFY_API_VERSION}/graphql.json`;

type ProxyInput = {
  query: string;
  variables?: Record<string, unknown>;
  operationName?: string;
};

// Use a concrete serializable shape so TanStack Start's ValidateSerializableMapped accepts it.
// Shopify GraphQL responses are always JSON objects or null at the top level.
type ProxyResult = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: Record<string, any> | null;
  errors: Array<{ message: string }>;
};

export const proxyStorefrontRequest = createServerFn({ method: "POST" })
  .inputValidator((input: ProxyInput) => {
    if (!input?.query || typeof input.query !== "string") {
      throw new Error("Missing or invalid GraphQL query.");
    }
    return input;
  })
  .handler(async ({ data }): Promise<ProxyResult> => {
    // Read the runtime secret — never available at build time.
    const storefrontToken =
      process.env["SHOPIFY_HEADLESS_STOREFRONT_TOKEN"] ??
      process.env["SHOPIFY_HEADLESS_STOREFRONT_TOKEN_TEST"] ??
      process.env["SHOPIFY_STOREFRONT_ACCESS_TOKEN"];

    if (!storefrontToken) {
      throw new Error("Shopify Storefront token is not configured on the server.");
    }

    const body: Record<string, unknown> = { query: data["query"] };
    if (data["variables"] !== undefined) body["variables"] = data["variables"];
    if (data["operationName"] !== undefined) body["operationName"] = data["operationName"];

    const response = await fetch(SHOPIFY_STOREFRONT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Token stays server-side — never forwarded to the caller.
        "X-Shopify-Storefront-Access-Token": storefrontToken,
      },
      body: JSON.stringify(body),
    });

    if (response.status === 402) {
      throw new Error(
        "Shopify: Payment required. Visit https://admin.shopify.com to upgrade your billing plan.",
      );
    }

    if (!response.ok) {
      throw new Error(`Shopify request failed (${response.status}).`);
    }

    const json = (await response.json()) as {
      data?: Record<string, unknown> | null;
      errors?: Array<{ message: string }>;
    };
    // Return only data + errors — never auth headers or env values.
    return {
      data: json.data ?? null,
      errors: json.errors ?? [],
    };
  });
