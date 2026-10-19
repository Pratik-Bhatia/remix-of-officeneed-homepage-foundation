/**
 * Server-side B2B catalog quantity-rule overlay -- Admin API
 * `contextualPricing(context: {companyLocationId})`, same mechanism
 * src/lib/b2b-pricing.functions.ts already uses for price, requiring only
 * the already-granted `read_products` scope.
 *
 * ROOT CAUSE this exists to fix, CONFIRMED LIVE this session: the public
 * Storefront API's `ProductVariant.quantityRule` (used everywhere else in
 * this app, see shopify.ts) does NOT reflect a B2B company-location-scoped
 * catalog override. H935 ("5-in-1 Corporate Gift Set")'s real minimum is
 * 25, configured in a Shopify catalog's PriceList, but a plain Storefront
 * product() query -- with or without @inContext(country:), with or
 * without a plain buyerIdentity.countryCode on a parallel cartCreate --
 * always returns minimum: 1 for it. A real Shopify cart mutation DOES
 * enforce it (confirmed via a live production MINIMUM_NOT_MET rejection,
 * and reproduced directly against the Storefront API). Isolating exactly
 * which context triggers it (this session, via Admin API):
 *   - contextualPricing(context: { country: "IN" })        -> minimum: 1
 *   - contextualPricing(context: { companyLocationId: ID }) -> minimum: 25
 * i.e. this genuinely is a B2B-company-location-scoped rule, not a
 * market/geography one, confirming the Admin API's `ProductVariantContextualPricing.quantityRule`
 * field is the one place this resolves correctly -- never guessed,
 * never a fallback value invented for an unknown B2B rule.
 *
 * Trust model: identical to b2b-pricing.functions.ts. The browser's
 * customerAccessToken and companyLocationId are never trusted at face
 * value -- the server re-derives the customer's ACTUAL assigned company
 * locations from the token via the same Customer -> Company Contact ->
 * Role Assignment -> Company Location chain, and only uses the
 * client-supplied companyLocationId if it's actually in that list.
 * Any failure (invalid token, no company, Admin API error, scope
 * missing) returns an EMPTY overlay, never throws -- callers fall back to
 * the normal Storefront-read quantityRule they already have (correct for
 * the B2C case, confirmed above), never block rendering on this.
 *
 * B2C/anonymous shoppers never call this at all (see
 * useB2BQuantityRuleOverlayMap's `enabled` gate in shopify-overlay.ts) --
 * the plain Storefront quantityRule read is already the correct answer
 * for them, confirmed by the country-context test above returning the
 * same minimum: 1 the Storefront API already reports.
 */
import { createServerFn } from "@tanstack/react-start";
import { adminGraphQLRequest } from "@/lib/shopify-admin.server";
import { resolveCustomerIdFromToken, resolveCompanyLocationsForCustomer } from "@/lib/b2b.functions";

export type QuantityRuleEntry = { minimum: number; maximum: number | null; increment: number };
export type QuantityRuleOverlayMap = Record<string, QuantityRuleEntry>;

// Same cap as b2b-pricing.functions.ts's BATCH_CONTEXTUAL_PRICING_QUERY --
// Admin API's `nodes` query cost scales with how many ids are requested.
const MAX_VARIANT_IDS = 250;

const BATCH_QUANTITY_RULE_QUERY = `
  query BatchQuantityRule($ids: [ID!]!, $companyLocationId: ID!) {
    nodes(ids: $ids) {
      ... on ProductVariant {
        id
        contextualPricing(context: { companyLocationId: $companyLocationId }) {
          quantityRule { minimum maximum increment }
        }
      }
    }
  }
`;

type BatchQuantityRuleData = {
  nodes: Array<{
    id: string;
    contextualPricing?: { quantityRule?: QuantityRuleEntry | null } | null;
  } | null>;
};

export const getB2BQuantityRuleOverlay = createServerFn({ method: "POST" })
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
  .handler(async ({ data }): Promise<QuantityRuleOverlayMap> => {
    if (data.variantIds.length === 0) return {};

    // Same re-derivation b2b-pricing.functions.ts does -- never trust the
    // client-supplied companyLocationId without checking it against the
    // customer's own server-resolved assignments.
    const customerId = await resolveCustomerIdFromToken(data.customerAccessToken);
    if (!customerId) return {};

    const locations = await resolveCompanyLocationsForCustomer(customerId);
    if (locations.length === 0) return {};

    const requested = data.companyLocationId;
    const companyLocationId =
      requested && locations.some((l) => l.id === requested)
        ? requested
        : locations.length === 1
          ? locations[0]!.id
          : null;
    // Ambiguous (multiple assigned locations, none validly selected yet):
    // no overlay, same as the price overlay's own behaviour.
    if (!companyLocationId) return {};

    try {
      const result = await adminGraphQLRequest<BatchQuantityRuleData>(BATCH_QUANTITY_RULE_QUERY, {
        ids: data.variantIds,
        companyLocationId,
      });
      if (result.errors?.length) {
        console.error("[B2B quantity rules] contextualPricing returned errors:", result.errors.map((e) => e.message).join("; "));
        return {};
      }
      const overlay: QuantityRuleOverlayMap = {};
      for (const node of result.data?.nodes ?? []) {
        if (node?.id && node.contextualPricing?.quantityRule) {
          overlay[node.id] = node.contextualPricing.quantityRule;
        }
      }
      return overlay;
    } catch (err) {
      console.error("[B2B quantity rules] contextualPricing request threw:", err instanceof Error ? err.message : err);
      return {};
    }
  });
