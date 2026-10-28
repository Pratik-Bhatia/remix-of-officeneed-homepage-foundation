/**
 * Review rating aggregation shared by the product page (ProductReviews) and
 * every product card, so a product's average and count are computed one way
 * everywhere. Inputs are APPROVED reviews only (product_reviews_public).
 */

export interface RatingSummary {
  /** Mean of the valid ratings (1-5). */
  average: number;
  /** Number of approved reviews with a valid rating. */
  count: number;
}

const isValidRating = (r: unknown): r is number => typeof r === "number" && Number.isFinite(r) && r >= 1 && r <= 5;

/** Mean rating; 0 when there are no ratings. */
export function averageRating(ratings: readonly number[]): number {
  return ratings.length ? ratings.reduce((s, r) => s + r, 0) / ratings.length : 0;
}

/**
 * Per-product summaries from approved review rows. Rows with a missing
 * handle or an out-of-range rating are ignored; products with no valid
 * ratings get no entry at all (so nothing is ever shown for them).
 */
export function summarizeRatingsByProduct(rows: ReadonlyArray<{ product_handle: string | null; rating: number | null }>): Map<string, RatingSummary> {
  const byHandle = new Map<string, number[]>();
  for (const row of rows) {
    if (!row.product_handle || !isValidRating(row.rating)) continue;
    const list = byHandle.get(row.product_handle);
    if (list) list.push(row.rating);
    else byHandle.set(row.product_handle, [row.rating]);
  }
  const out = new Map<string, RatingSummary>();
  for (const [handle, ratings] of byHandle) out.set(handle, { average: averageRating(ratings), count: ratings.length });
  return out;
}

/** "4.8" -- one decimal, the same precision as the product page summary. */
export const formatAverage = (average: number) => average.toFixed(1);
