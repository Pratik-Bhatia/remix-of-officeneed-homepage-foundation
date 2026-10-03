/**
 * Pure merge helper shared by src/lib/shopify-overlay.ts (catalogue/
 * bestsellers) and src/routes/products.$slug.tsx (PDP/related products) --
 * no server/Admin API code here, just applying an already-fetched
 * B2BPriceOverlayMap (see src/lib/b2b-pricing.functions.ts) onto Storefront
 * product nodes. Never calculates a discount itself -- every price/
 * compareAtPrice value comes from Shopify's own contextualPricing result;
 * a variant with no entry in the overlay keeps its normal Storefront price
 * untouched (graceful fallback).
 */
import type { ShopifyProductNode } from "@/lib/shopify";
import type { B2BPriceOverlayMap } from "@/lib/b2b-pricing.functions";

export function applyB2BPriceOverlay(node: ShopifyProductNode, overlay: B2BPriceOverlayMap): ShopifyProductNode {
  if (!overlay || Object.keys(overlay).length === 0) return node;

  let changed = false;
  const edges = node.variants.edges.map((edge) => {
    const priced = overlay[edge.node.id];
    if (!priced) return edge;
    changed = true;
    return { ...edge, node: { ...edge.node, price: priced.price, compareAtPrice: priced.compareAtPrice } };
  });
  if (!changed) return node;

  // priceRange.minVariantPrice drives the listing/card price (see
  // shopifyNodeToProduct) -- must be recomputed from the now-overlaid
  // variants, or cards would keep showing the pre-overlay minimum.
  const amounts = edges.map((e) => parseFloat(e.node.price.amount)).filter((n) => Number.isFinite(n));
  const minAmount = amounts.length > 0 ? Math.min(...amounts) : parseFloat(node.priceRange?.minVariantPrice?.amount ?? "0");
  const currencyCode = edges[0]?.node.price.currencyCode ?? node.priceRange?.minVariantPrice?.currencyCode ?? "INR";

  return {
    ...node,
    variants: { ...node.variants, edges },
    priceRange: { minVariantPrice: { amount: String(minAmount), currencyCode } },
  };
}

export function applyB2BPriceOverlayToAll(nodes: ShopifyProductNode[], overlay: B2BPriceOverlayMap): ShopifyProductNode[] {
  if (!overlay || Object.keys(overlay).length === 0) return nodes;
  return nodes.map((node) => applyB2BPriceOverlay(node, overlay));
}
