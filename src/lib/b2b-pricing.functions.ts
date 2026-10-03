/**
 * Server-side B2B catalog price overlay -- Shopify Admin API's
 * `contextualPricing`, NOT `@inContext(buyer:)`.
 *
 * @inContext(buyer:)'s BuyerInput mandatorily requires a Customer Accounts
 * API (OAuth) token (confirmed live via Storefront API schema introspection
 * on this store, 2026-10): the classic customerAccessTokenCreate token this
 * app uses everywhere is unconditionally rejected there, for every
 * customer, B2B or not. See src/hooks/useBuyerContext.ts for the full
 * writeup. ProductVariant.contextualPricing(context:{companyLocationId})
 * is a separate, independently documented Admin API field that returns
 * Shopify's own computed price for a given company location -- no OAuth,
 * no browser-exposed token, just the companyLocationId. Requires only the
 * `read_products` scope (already granted) on top of what
 * resolveCompanyLocationsForCustomer below already needs.
 *
 * Trust model, same as resolveB2BSession in b2b.functions.ts:
 *  - The browser sends its customerAccessToken (proof of identity) and the
 *    companyLocationId it currently has selected (from b2bStore). Neither
 *    is trusted at face value.
 *  - The server re-derives the customer's ACTUAL assigned company
 *    locations from the token, via the exact same Customer -> Company
 *    Contact -> Role Assignment -> Company Location chain b2b.functions.ts
 *    uses. The client-supplied companyLocationId is only ever used if it
 *    appears in that server-resolved list; otherwise it's ignored.
 *  - Any failure (invalid token, no company, Admin API error, scope
 *    missing) returns an EMPTY overlay ({}), never throws -- callers must
 *    fall back to the normal Storefront price they already have, never
 *    block rendering on this.
 */
import { createServerFn } from "@tanstack/react-start";
import { adminGraphQLRequest } from "@/lib/shopify-admin.server";
import { resolveCustomerIdFromToken, resolveCompanyLocationsForCustomer } from "@/lib/b2b.functions";

export type B2BPriceOverlayEntry = {
  price: { amount: string; currencyCode: string };
  compareAtPrice: { amount: string; currencyCode: string } | null;
};
export type B2BPriceOverlayMap = Record<string, B2BPriceOverlayEntry>;

// Admin API's `nodes` query cost scales with how many ids are requested --
// cap it well under Shopify's throttle so one catalogue page can never
// exhaust the app's request bucket.
const MAX_VARIANT_IDS = 250;

const BATCH_CONTEXTUAL_PRICING_QUERY = `
  query BatchContextualPricing($ids: [ID!]!, $companyLocationId: ID!) {
    nodes(ids: $ids) {
      ... on ProductVariant {
        id
        contextualPricing(context: { companyLocationId: $companyLocationId }) {
          price { amount currencyCode }
          compareAtPrice { amount currencyCode }
        }
      }
    }
  }
`;

type BatchContextualPricingData = {
  nodes: Array<{
    id: string;
    contextualPricing?: {
      price: { amount: string; currencyCode: string };
      compareAtPrice: { amount: string; currencyCode: string } | null;
    };
  } | null>;
};

export const getB2BPriceOverlay = createServerFn({ method: "POST" })
  .inputValidator((input: { customerAccessToken: string; companyLocationId?: string; variantIds: string[] }) => {
    if (!input?.customerAccessToken || typeof input.customerAccessToken !== "string") {
      throw new Error("Missing or invalid customerAccessToken.");
    }
    if (!Array.isArray(input.variantIds) || input.variantIds.length === 0) {
      return { customerAccessToken: input.customerAccessToken, companyLocationId: input.companyLocationId, variantIds: [] };
    }
    const variantIds = Array.from(new Set(input.variantIds.filter((id) => typeof id === "string" && id.length > 0))).slice(
      0,
      MAX_VARIANT_IDS,
    );
    return {
      customerAccessToken: input.customerAccessToken,
      companyLocationId: typeof input.companyLocationId === "string" ? input.companyLocationId : undefined,
      variantIds,
    };
  })
  .handler(async ({ data }): Promise<B2BPriceOverlayMap> => {
    if (data.variantIds.length === 0) return {};

    // 1. Resolve the REAL customer GID from the token -- the only proof of
    // identity trusted here, exactly as resolveB2BSession does.
    const customerId = await resolveCustomerIdFromToken(data.customerAccessToken);
    if (!customerId) return {};

    // 2. Resolve which company locations THIS customer is actually
    // assigned to -- never trust the client-supplied companyLocationId
    // without checking it against this.
    const locations = await resolveCompanyLocationsForCustomer(customerId);
    if (locations.length === 0) return {};

    const requested = data.companyLocationId;
    const companyLocationId =
      requested && locations.some((l) => l.id === requested)
        ? requested
        : locations.length === 1
          ? locations[0]!.id
          : null;
    // Ambiguous (customer has multiple assigned locations and the browser
    // hasn't -- or can't validly -- picked one yet): no overlay, fall back
    // to normal pricing, same as b2bStore's own "needs-location" state.
    if (!companyLocationId) return {};

    try {
      const result = await adminGraphQLRequest<BatchContextualPricingData>(BATCH_CONTEXTUAL_PRICING_QUERY, {
        ids: data.variantIds,
        companyLocationId,
      });
      if (result.errors?.length) {
        console.error("[B2B pricing] contextualPricing returned errors:", result.errors.map((e) => e.message).join("; "));
        return {};
      }
      const overlay: B2BPriceOverlayMap = {};
      for (const node of result.data?.nodes ?? []) {
        if (node?.id && node.contextualPricing) {
          overlay[node.id] = {
            price: node.contextualPricing.price,
            compareAtPrice: node.contextualPricing.compareAtPrice ?? null,
          };
        }
      }
      return overlay;
    } catch (err) {
      console.error("[B2B pricing] contextualPricing request threw:", err instanceof Error ? err.message : err);
      return {};
    }
  });
