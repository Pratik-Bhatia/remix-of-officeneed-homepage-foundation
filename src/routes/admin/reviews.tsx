import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import {
  approveReview,
  listPendingReviews,
  rejectReview,
} from "@/lib/admin-reviews.functions";

export const Route = createFileRoute("/admin/reviews")({
  component: AdminReviewsPage,
});

function StarDisplay({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${rating} out of 5 stars`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <svg
          key={i}
          viewBox="0 0 20 20"
          fill="currentColor"
          className={i < rating ? "size-3.5 text-amber-400" : "size-3.5 text-gray-200"}
        >
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.518 4.674a1 1 0 00.95.69h4.911c.969 0 1.371 1.24.588 1.81l-3.974 2.888a1 1 0 00-.364 1.118l1.518 4.674c.3.921-.755 1.688-1.538 1.118l-3.974-2.888a1 1 0 00-1.176 0l-3.974 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.364-1.118L2.08 10.1c-.783-.57-.381-1.81.588-1.81h4.911a1 1 0 00.951-.69l1.519-4.673z" />
        </svg>
      ))}
    </span>
  );
}

function AdminReviewsPage() {
  const [reviews, setReviews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState(false);

  const fetchReviewsFn = useServerFn(listPendingReviews);
  const approveFn = useServerFn(approveReview);
  const rejectFn = useServerFn(rejectReview);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        setLoading(true);
        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData.session) {
          if (active) {
            setReviews([]);
            setSignedIn(false);
            setError("You need to be signed in with an admin account to moderate reviews.");
          }
          return;
        }
        if (active) setSignedIn(true);
        const data = await fetchReviewsFn({});
        if (active) {
          setReviews(data ?? []);
          setError(null);
        }
      } catch (e: any) {
        if (active)
          setError(
            e?.message?.includes("Forbidden") || e?.message?.includes("Unauthorized")
              ? "You need to be signed in with an admin account to moderate reviews."
              : "Unable to load pending reviews."
          );
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleApprove = async (id: string) => {
    try {
      setBusyId(id);
      await approveFn({ data: { id } });
      setReviews((prev) => prev.filter((r) => r.id !== id));
      toast.success("Review approved and now live.");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to approve review.");
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = async (id: string) => {
    try {
      setBusyId(id);
      await rejectFn({ data: { id } });
      setReviews((prev) => prev.filter((r) => r.id !== id));
      toast.success("Review rejected and removed.");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to reject review.");
    } finally {
      setBusyId(null);
    }
  };

  if (!loading && !signedIn) {
    return (
      <div className="container mx-auto py-20 px-4 flex justify-center">
        <div className="w-full max-w-md text-center bg-white border border-border rounded-2xl shadow-sm p-10">
          <h1 className="text-2xl font-bold mb-2">Admin access required</h1>
          <p className="text-sm text-muted-foreground mb-6">
            Sign in with your Officeneed admin account to moderate customer reviews.
          </p>
          <Button asChild>
            <Link to="/auth" search={{ redirect: "/admin/reviews" }}>
              Sign in
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-10 px-4">
      <div className="flex items-start justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold mb-2">Review Moderation</h1>
          <p className="text-sm text-muted-foreground">
            Approve reviews to publish them on the storefront, or reject spam.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={async () => {
            await supabase.auth.signOut();
            setSignedIn(false);
          }}
        >
          Sign out
        </Button>
      </div>


      <div className="bg-white border border-border rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead className="bg-muted/50 border-b border-border">
            <tr>
              <th className="px-6 py-4 font-semibold">Product</th>
              <th className="px-6 py-4 font-semibold">Rating</th>
              <th className="px-6 py-4 font-semibold">Author</th>
              <th className="px-6 py-4 font-semibold">Review</th>
              <th className="px-6 py-4 font-semibold">Date</th>
              <th className="px-6 py-4 font-semibold text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-muted-foreground">
                  Loading…
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-muted-foreground">
                  {error}
                </td>
              </tr>
            ) : reviews.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-muted-foreground">
                  No reviews waiting for moderation. 🎉
                </td>
              </tr>
            ) : (
              reviews.map((review) => (
                <tr key={review.id} className="border-b border-border hover:bg-muted/20 align-top">
                  <td className="px-6 py-4 font-medium">
                    <Link
                      to="/products/$slug"
                      params={{ slug: review.product_handle }}
                      className="hover:underline"
                    >
                      {review.product_handle}
                    </Link>
                  </td>
                  <td className="px-6 py-4">
                    <StarDisplay rating={review.rating} />
                  </td>
                  <td className="px-6 py-4">
                    <div className="font-medium">{review.author_name}</div>
                    <div className="text-xs text-muted-foreground">{review.author_email}</div>
                    {review.is_verified_buyer && (
                      <Badge variant="secondary" className="mt-1">Verified buyer</Badge>
                    )}
                  </td>
                  <td className="px-6 py-4 max-w-sm">
                    <div className="font-medium">{review.title}</div>
                    <p className="mt-1 text-muted-foreground line-clamp-3">{review.body}</p>
                  </td>
                  <td className="px-6 py-4 text-muted-foreground whitespace-nowrap">
                    {new Date(review.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 text-right whitespace-nowrap">
                    <div className="inline-flex gap-2">
                      <Button
                        size="sm"
                        disabled={busyId === review.id}
                        onClick={() => handleApprove(review.id)}
                      >
                        Approve
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={busyId === review.id}
                        onClick={() => handleReject(review.id)}
                      >
                        Reject
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
