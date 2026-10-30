import { useQuery } from "@tanstack/react-query";
import { summarizeRatingsByProduct, type RatingSummary } from "@/lib/review-ratings";

const PAGE = 1000; // Supabase's default max rows per request

/**
 * ONE request for every product's rating summary (approved reviews only,
 * the same view the product page reads), cached and shared by every card --
 * never a request per card. Only handle + rating are fetched.
 */
async function fetchRatingSummaries(): Promise<Map<string, RatingSummary>> {
  // Loaded here, not at module scope: ProductCard (on nearly every page)
  // imports this hook, and a static import put the whole Supabase client
  // into the shared startup bundle. Now it downloads only when ratings load.
  const { supabase } = await import("@/integrations/supabase/client");
  const rows: Array<{ product_handle: string | null; rating: number | null }> = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("product_reviews_public")
      .select("product_handle, rating")
      .eq("status", "approved")
      .range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return summarizeRatingsByProduct(rows);
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
