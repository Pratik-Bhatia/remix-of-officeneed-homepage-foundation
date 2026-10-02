/**
 * Resolves whether an authenticated customer is a B2B buyer, and if so,
 * which company location(s) they're actually assigned to -- entirely
 * server-side, never trusting anything the browser supplies except the
 * customerAccessToken itself (the one thing classic Shopify login already
 * proves).
 *
 * Deliberately goes through Company Contact -> Role Assignment -> Company
 * Location, NOT Company -> Locations: a company can have locations a given
 * contact was never actually granted access to, so enumerating every
 * location the company owns would hand out access the customer doesn't
 * have. Only locations reachable via one of this contact's own
 * roleAssignments are ever returned.
 *
 * Also returns the resolved Shopify customer GID (`customerId`) -- this is
 * an opaque object identifier, not a credential, safe to hand back to the
 * one browser that already proved its identity with the token that
 * produced it. It exists so the client can use a stable, non-secret value
 * as a React Query cache-key identity instead of the bearer token itself
 * (see src/stores/b2bStore.ts and src/lib/shopify-overlay.ts).
 */
import { createServerFn } from "@tanstack/react-start";
import { adminGraphQLRequest } from "@/lib/shopify-admin.server";

// Kept in sync with src/lib/shopify.functions.ts's SHOPIFY_API_VERSION --
// see that file's comment for the live verification behind this value.
const SHOPIFY_API_VERSION = "2026-10";
const SHOPIFY_STORE_PERMANENT_DOMAIN = "har1k4-di.myshopify.com";
const SHOPIFY_STOREFRONT_URL = `https://${SHOPIFY_STORE_PERMANENT_DOMAIN}/api/${SHOPIFY_API_VERSION}/graphql.json`;

export type CompanyLocationOption = { id: string; name: string };
export type B2BSessionResult =
  | { status: "b2c"; customerId: string | null }
  | { status: "b2b"; locations: CompanyLocationOption[]; customerId: string };

const RESOLVE_CUSTOMER_ID_QUERY = `
  query ResolveCustomerId($token: String!) {
    customer(customerAccessToken: $token) {
      id
    }
  }
`;

const CUSTOMER_COMPANY_LOCATIONS_QUERY = `
  query GetCustomerCompanyLocations($customerId: ID!) {
    customer(id: $customerId) {
      companyContactProfiles {
        id
        roleAssignments(first: 50) {
          edges {
            node {
              companyLocation { id name }
            }
          }
        }
      }
    }
  }
`;

type AdminCompanyLocationsData = {
  customer: {
    companyContactProfiles: Array<{
      id: string;
      roleAssignments: {
        edges: Array<{ node: { companyLocation: { id: string; name: string } | null } }>;
      };
    }> | null;
  } | null;
};

export const resolveB2BSession = createServerFn({ method: "POST" })
  .inputValidator((input: { customerAccessToken: string }) => {
    if (!input?.customerAccessToken || typeof input.customerAccessToken !== "string") {
      throw new Error("Missing or invalid customerAccessToken.");
    }
    return input;
  })
  .handler(async ({ data }): Promise<B2BSessionResult> => {
    const storefrontToken =
      process.env["SHOPIFY_HEADLESS_STOREFRONT_TOKEN"] ??
      process.env["SHOPIFY_HEADLESS_STOREFRONT_TOKEN_TEST"] ??
      process.env["SHOPIFY_STOREFRONT_ACCESS_TOKEN"];
    if (!storefrontToken) {
      // Fail safe to B2C rather than throwing -- a misconfigured token
      // should never block the storefront, just skip B2B pricing.
      console.error("[B2B] Shopify Storefront token is not configured on the server.");
      return { status: "b2c", customerId: null };
    }

    // 1. Resolve the REAL customer GID from the token itself -- this is
    // the only proof of identity we trust. We never accept a client-
    // supplied customer id anywhere in this flow.
    let customerId: string | null = null;
    try {
      const resp = await fetch(SHOPIFY_STOREFRONT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Storefront-Access-Token": storefrontToken,
        },
        body: JSON.stringify({
          query: RESOLVE_CUSTOMER_ID_QUERY,
          variables: { token: data.customerAccessToken },
        }),
      });
      if (!resp.ok) {
        console.error(`[B2B] Storefront customer lookup failed (HTTP ${resp.status}).`);
        return { status: "b2c", customerId: null };
      }
      const json = (await resp.json()) as {
        data?: { customer?: { id: string } | null } | null;
        errors?: Array<{ message: string }>;
      };
      customerId = json.data?.customer?.id ?? null;
    } catch (err) {
      console.error("[B2B] Storefront customer lookup threw:", err instanceof Error ? err.message : err);
      return { status: "b2c", customerId: null };
    }

    // Invalid/expired/revoked token -- fail safe to B2C, same as every
    // other place in the app that handles a bad customerAccessToken.
    if (!customerId) return { status: "b2c", customerId: null };

    // 2. Look up which company locations THIS customer is actually
    // assigned to, via the Admin API, through role assignments only.
    let companyData: AdminCompanyLocationsData | null;
    try {
      const result = await adminGraphQLRequest<AdminCompanyLocationsData>(
        CUSTOMER_COMPANY_LOCATIONS_QUERY,
        { customerId },
      );
      if (result.errors?.length) {
        console.error("[B2B] Admin company-location lookup returned errors:", result.errors.map((e) => e.message).join("; "));
        return { status: "b2c", customerId };
      }
      companyData = result.data;
    } catch (err) {
      console.error("[B2B] Admin company-location lookup threw:", err instanceof Error ? err.message : err);
      return { status: "b2c", customerId };
    }

    const profiles = companyData?.customer?.companyContactProfiles ?? [];

    // 3. Flatten every profile's role assignments into one deduplicated
    // list of company locations -- a contact can hold multiple roles at
    // the same location, and can (in principle) be a contact for more
    // than one company.
    const byId = new Map<string, CompanyLocationOption>();
    for (const profile of profiles) {
      for (const edge of profile.roleAssignments?.edges ?? []) {
        const loc = edge.node?.companyLocation;
        if (loc?.id && !byId.has(loc.id)) byId.set(loc.id, { id: loc.id, name: loc.name });
      }
    }
    const locations = Array.from(byId.values());

    // 0 assigned locations covers BOTH "no company contact at all" and
    // "has a company contact but every role assignment was removed" --
    // both are treated identically as plain B2C.
    if (locations.length === 0) return { status: "b2c", customerId };

    return { status: "b2b", locations, customerId };
  });
