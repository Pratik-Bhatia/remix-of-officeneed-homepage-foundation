/**
 * Server-only helper that verifies a Shopify customer access token
 * against the Storefront API before any saved-items read or write.
 */
const SHOPIFY_API_VERSION = "2025-07";
const SHOPIFY_STORE_PERMANENT_DOMAIN = "har1k4-di.myshopify.com";
const SHOPIFY_STOREFRONT_URL = `https://${SHOPIFY_STORE_PERMANENT_DOMAIN}/api/${SHOPIFY_API_VERSION}/graphql.json`;

export async function resolveCustomerId(token: string): Promise<string> {
  const storefrontToken = process.env["SHOPIFY_STOREFRONT_ACCESS_TOKEN"] as string;
  const response = await fetch(SHOPIFY_STOREFRONT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Storefront-Access-Token": storefrontToken,
    },
    body: JSON.stringify({
      query: `query VerifyCustomer($token: String!) { customer(customerAccessToken: $token) { id } }`,
      variables: { token },
    }),
  });
  if (!response.ok) throw new Error("Could not verify your session. Please sign in again.");
  const json = (await response.json()) as { data?: { customer?: { id: string } | null } };
  const id = json.data?.customer?.id;
  if (!id) throw new Error("Your session has expired. Please sign in again.");
  return id;
}
