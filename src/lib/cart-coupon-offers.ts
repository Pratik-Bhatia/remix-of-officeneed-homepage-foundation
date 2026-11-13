import { CATEGORY_PROMOTIONS, productMatchesPromotion, type CategoryPromotion } from "@/config/promotions";
import type { CartDiscountCode, CartItem } from "@/stores/cartStore";
import { codeSavings, linesDiscountedBy } from "@/lib/line-discounts";

/**
 * The cart coupon card's state per promotion, derived ONLY from Shopify
 * answers: the real cart's discount codes + per-line allocations, and the
 * cached per-variant eligibility previews. Pure, so every state is tested.
 */
export type OfferView =
  | { kind: "applied"; promo: CategoryPromotion; savings: number; lines: number; pricingPending: false }
  | { kind: "applied"; promo: CategoryPromotion; savings: null; lines: null; pricingPending: true }
  | { kind: "available"; promo: CategoryPromotion; eligibleLines: number; totalLines: number; onCartButNotApplying: boolean }
  | { kind: "dormant"; promo: CategoryPromotion }
  | { kind: "unavailable-for-account"; promo: CategoryPromotion }
  | { kind: "checking"; promo: CategoryPromotion };

export function collectionHandlesOf(item: CartItem): string[] | null {
  const edges = item.product?.node?.collections?.edges;
  return Array.isArray(edges) ? edges.map((e) => e.node.handle) : null; // null = not known locally
}

/** Items worth asking Shopify about: in the discount's collections, or with
 * collections unknown locally (Shopify decides those). */
export function candidateItems(items: CartItem[], promo: CategoryPromotion): CartItem[] {
  return items.filter((i) => {
    const h = collectionHandlesOf(i);
    return h === null || productMatchesPromotion(h, promo);
  });
}

export function buildOfferViews(input: {
  items: CartItem[];
  discountCodes: CartDiscountCode[];
  /** code -> variantId -> Shopify-confirmed eligibility; undefined = not checked yet. */
  eligibility: Record<string, Record<string, boolean> | undefined>;
  signedIn: boolean;
}): OfferView[] {
  const { items, discountCodes, eligibility, signedIn } = input;
  // L2: a bag saved before per-line pricing existed has no allocations yet.
  const pricingKnown = items.length > 0 && items.every((i) => i.lineDiscounts !== undefined);
  const views: OfferView[] = [];

  for (const promo of CATEGORY_PROMOTIONS) {
    const onCart = discountCodes.find((d) => d.code.toUpperCase() === promo.code);
    const candidates = candidateItems(items, promo);
    const checked = eligibility[promo.code];

    if (onCart?.applicable) {
      if (!pricingKnown) { views.push({ kind: "applied", promo, savings: null, lines: null, pricingPending: true }); continue; }
      const savings = codeSavings(items, promo.code);
      if (savings > 0) {
        const lines = linesDiscountedBy(items, promo.code);
        views.push({ kind: "applied", promo, savings, lines, pricingPending: false });
        continue;
      }
    }

    if (candidates.length === 0) {
      if (onCart && pricingKnown) views.push({ kind: "dormant", promo });
      continue;
    }
    if (!checked) {
      if (onCart && pricingKnown) views.push({ kind: "dormant", promo });
      else views.push({ kind: "checking", promo });
      continue;
    }
    const eligibleLines = items.filter((i) => checked[i.variantId] === true).length;
    if (eligibleLines > 0) {
      views.push({ kind: "available", promo, eligibleLines, totalLines: items.length, onCartButNotApplying: !!onCart && !onCart.applicable });
      continue;
    }
    if (onCart && pricingKnown) { views.push({ kind: "dormant", promo }); continue; }
    // M5: the bag has products from this discount's own collections (known
    // locally, not guessed), Shopify checked them for this signed-in
    // customer and declined -- for a one-use-per-customer code the likeliest
    // reason is that it was already used. Shopify gives no reason, so the
    // wording says "may".
    const knownCandidates = candidates.filter((i) => collectionHandlesOf(i) !== null).length;
    const allChecked = candidates.every((i) => checked[i.variantId] !== undefined);
    if (signedIn && promo.oncePerCustomer && knownCandidates > 0 && allChecked) {
      views.push({ kind: "unavailable-for-account", promo });
    }
  }
  // Applied first, then everything else in configuration order.
  return views.sort((a, b) => Number(b.kind === "applied") - Number(a.kind === "applied"));
}
