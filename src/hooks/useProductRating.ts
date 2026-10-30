import { useQuery } from "@tanstack/react-query";
import { summarizeRatingsByProduct, type RatingSummary } from "@/lib/review-ratings";

const PAGE = 1000; // Supabase's default max rows per request

/**
 * ONE request for every product's rating summary (approved reviews only,
 * the same view the product page reads), cached and shared by every card --
 * never a request per card. Only handle + rating are fetched.
 */
type RatingRow = { product_handle: string | null; rating: number | null };

/**
 * The same read the Supabase client made -- `product_reviews_public`,
 * select product_handle + rating, status = approved, paged by
 * offset/limit -- sent as a plain REST request. ProductCard is on nearly
 * every page, and loading the whole Supabase library (auth, realtime,
 * storage: ~53 KB compressed) just for this one public read was the
 * largest unused script on the storefront. Same publishable key and
 * headers as the generated client (it sends only `apikey` for
 * sb_publishable_ keys), so the same row-level security applies.
 */
export async function fetchRatingRows(
  url: string | undefined = import.meta.env["VITE_SUPABASE_URL"],
  key: string | undefined = import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"],
  fetchImpl: typeof fetch = fetch,
): Promise<RatingRow[]> {
  if (!url || !key) throw new Error("Supabase is not configured");
  const rows: RatingRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const query = new URLSearchParams({
      select: "product_handle,rating",
      status: "eq.approved",
      offset: String(from),
      limit: String(PAGE),
    });
    const res = await fetchImpl(`${url}/rest/v1/product_reviews_public?${query}`, {
      headers: { apikey: key, "Accept-Profile": "public" },
    });
    if (!res.ok) throw new Error(`Rating summaries request failed (${res.status})`);
    const data = (await res.json()) as RatingRow[];
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  return rows;
}

async function fetchRatingSummaries(): Promise<Map<string, RatingSummary>> {
  return summarizeRatingsByProduct(await fetchRatingRows());
}

/**
 * This product's rating summary, or undefined while loading, on failure, or
 * when it has no approved reviews -- in every one of those cases the card
 * simply shows no rating (no placeholder, no "0 reviews"). Each card
 * subscribes only to its own entry, so it re-renders only if that changes.
 */
export function useProductRating(handle: string): RatingSummary | undefined {
  const { data } = useQuery({
    queryKey: ["reviews", "rating-summaries"],
    queryFn: fetchRatingSummaries,
    select: (summaries: Map<string, RatingSummary>) => summaries.get(handle),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 1,
  });
  return data;
}
