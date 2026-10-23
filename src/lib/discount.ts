/**
 * Discount percentage derived from Shopify's own price / compareAtPrice --
 * never hardcoded or stored. Returns null (no badge, no strikethrough) unless
 * both values are finite, compareAt > price > 0, and the rounded percentage
 * is at least 1.
 */
export interface Discount {
  percent: number;
  compareAtAmount: number;
}

const toNumber = (value: unknown): number =>
  typeof value === "number" ? value : typeof value === "string" ? parseFloat(value) : NaN;

export function getDiscount(price: unknown, compareAtPrice: unknown): Discount | null {
  const current = toNumber(price);
  const compareAt = toNumber(compareAtPrice);
  if (!Number.isFinite(current) || !Number.isFinite(compareAt)) return null;
  if (current <= 0 || compareAt <= 0 || compareAt <= current) return null;
  const percent = Math.round(((compareAt - current) / compareAt) * 100);
  return percent > 0 ? { percent, compareAtAmount: compareAt } : null;
}

/** compareAtPrice of the cheapest variant -- the one a listing card's price
 * (priceRange.minVariantPrice) is taken from. Undefined when it has no valid discount. */
export function minVariantCompareAt(
  variants: Array<{ price: { amount: string }; compareAtPrice?: { amount: string } | null }>,
): number | undefined {
  let best: (typeof variants)[number] | undefined;
  for (const v of variants) {
    const amount = toNumber(v.price.amount);
    if (!Number.isFinite(amount)) continue;
    if (!best || amount < toNumber(best.price.amount)) best = v;
  }
  return best ? (getDiscount(best.price.amount, best.compareAtPrice?.amount)?.compareAtAmount ?? undefined) : undefined;
}
