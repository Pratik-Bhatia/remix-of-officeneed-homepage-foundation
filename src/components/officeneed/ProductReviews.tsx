import { useState, useRef } from "react";
import { cn } from "@/lib/utils";
import { CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

/* ─────────────────────────────────────────────────────────
   TYPES
───────────────────────────────────────────────────────── */
export interface Review {
  id: string;
  title: string;
  body: string;
  rating: number; // 1–5
  author: string;
  date: string; // ISO or human-readable
  verified: boolean;
}

/* ─────────────────────────────────────────────────────────
   MOCK DATA  — swap setReviews([]) / setReviews(MOCK_REVIEWS) to test states
───────────────────────────────────────────────────────── */
export const MOCK_REVIEWS: Review[] = [
  {
    id: "r1",
    title: "Perfect for bulk corporate gifting!",
    body: "We ordered 200 units for our annual employee recognition event and were blown away by the quality. Packaging was pristine, delivery was on time, and our employees loved them. Will definitely reorder.",
    rating: 5,
    author: "Priya Sharma",
    date: "August 2025",
    verified: true,
  },
  {
    id: "r2",
    title: "Good quality, minor packaging issue",
    body: "The product itself is excellent — solid build and great finish. A couple of boxes had minor dents on arrival, but the product inside was completely fine. Customer support resolved it quickly.",
    rating: 4,
    author: "Rahul Mehta",
    date: "July 2025",
    verified: true,
  },
];

/* ─────────────────────────────────────────────────────────
   STAR RENDERING HELPERS
───────────────────────────────────────────────────────── */
function StarFilled({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="currentColor"
      className={cn("size-4 text-amber-400", className)}
      aria-hidden="true"
    >
      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.518 4.674a1 1 0 00.95.69h4.911c.969 0 1.371 1.24.588 1.81l-3.974 2.888a1 1 0 00-.364 1.118l1.518 4.674c.3.921-.755 1.688-1.538 1.118l-3.974-2.888a1 1 0 00-1.176 0l-3.974 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.364-1.118L2.08 10.1c-.783-.57-.381-1.81.588-1.81h4.911a1 1 0 00.951-.69l1.519-4.673z" />
    </svg>
  );
}

function StarHalf({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      className={cn("size-4", className)}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="half-star-gradient">
          <stop offset="50%" stopColor="#fbbf24" />
          <stop offset="50%" stopColor="#e5e7eb" />
        </linearGradient>
      </defs>
      <path fill="url(#half-star-gradient)" d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.518 4.674a1 1 0 00.95.69h4.911c.969 0 1.371 1.24.588 1.81l-3.974 2.888a1 1 0 00-.364 1.118l1.518 4.674c.3.921-.755 1.688-1.538 1.118l-3.974-2.888a1 1 0 00-1.176 0l-3.974 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.364-1.118L2.08 10.1c-.783-.57-.381-1.81.588-1.81h4.911a1 1 0 00.951-.69l1.519-4.673z" />
    </svg>
  );
}

function StarEmpty({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="currentColor"
      className={cn("size-4 text-gray-200", className)}
      aria-hidden="true"
    >
      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.518 4.674a1 1 0 00.95.69h4.911c.969 0 1.371 1.24.588 1.81l-3.974 2.888a1 1 0 00-.364 1.118l1.518 4.674c.3.921-.755 1.688-1.538 1.118l-3.974-2.888a1 1 0 00-1.176 0l-3.974 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.364-1.118L2.08 10.1c-.783-.57-.381-1.81.588-1.81h4.911a1 1 0 00.951-.69l1.519-4.673z" />
    </svg>
  );
}

function StarRow({
  rating,
  max = 5,
  size = "md",
}: {
  rating: number;
  max?: number;
  size?: "sm" | "md" | "lg";
}) {
  const sizeClass = size === "sm" ? "size-3.5" : size === "lg" ? "size-5" : "size-4";
  return (
    <div className="flex items-center gap-0.5" role="img" aria-label={`${rating} out of ${max} stars`}>
      {Array.from({ length: max }).map((_, i) => {
        const difference = rating - i;
        if (difference >= 0.75) {
          return <StarFilled key={i} className={sizeClass} />;
        } else if (difference >= 0.25) {
          return <StarHalf key={i} className={sizeClass} />;
        } else {
          return <StarEmpty key={i} className={sizeClass} />;
        }
      })}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   INTERACTIVE STAR SELECTOR (for submission form)
───────────────────────────────────────────────────────── */
function StarSelector({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  const [hovered, setHovered] = useState(0);
  return (
    <div className="flex items-center gap-1" role="radiogroup" aria-label="Select rating">
      {[1, 2, 3, 4, 5].map((star) => {
        const active = star <= (hovered || value);
        return (
          <button
            key={star}
            type="button"
            role="radio"
            aria-checked={value === star}
            aria-label={`${star} star${star !== 1 ? "s" : ""}`}
            onMouseEnter={() => setHovered(star)}
            onMouseLeave={() => setHovered(0)}
            onClick={() => onChange(star)}
            className="transition-transform active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground rounded"
          >
            {active ? (
              <svg viewBox="0 0 20 20" fill="currentColor" className="size-7 text-amber-400 transition-colors">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.518 4.674a1 1 0 00.95.69h4.911c.969 0 1.371 1.24.588 1.81l-3.974 2.888a1 1 0 00-.364 1.118l1.518 4.674c.3.921-.755 1.688-1.538 1.118l-3.974-2.888a1 1 0 00-1.176 0l-3.974 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.364-1.118L2.08 10.1c-.783-.57-.381-1.81.588-1.81h4.911a1 1 0 00.951-.69l1.519-4.673z" />
              </svg>
            ) : (
              <svg viewBox="0 0 20 20" fill="currentColor" className="size-7 text-gray-200 transition-colors">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.518 4.674a1 1 0 00.95.69h4.911c.969 0 1.371 1.24.588 1.81l-3.974 2.888a1 1 0 00-.364 1.118l1.518 4.674c.3.921-.755 1.688-1.538 1.118l-3.974-2.888a1 1 0 00-1.176 0l-3.974 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.364-1.118L2.08 10.1c-.783-.57-.381-1.81.588-1.81h4.911a1 1 0 00.951-.69l1.519-4.673z" />
              </svg>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   REVIEW CARD
───────────────────────────────────────────────────────── */
function ReviewCard({ review }: { review: Review }) {
  return (
    <article className="py-6 first:pt-0 border-b border-gray-200 last:border-b-0">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <StarRow rating={review.rating} />
            {review.verified && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600">
                <CheckCircle2 className="size-3.5" strokeWidth={2.5} />
                Verified Buyer
              </span>
            )}
          </div>
          <h4 className="mt-2 text-[14px] font-semibold text-foreground leading-snug">
            {review.title}
          </h4>
          <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
            {review.body}
          </p>
          <p className="mt-3 text-[12px] text-muted-foreground">
            <span className="font-medium text-foreground">{review.author}</span>
            {" · "}
            {review.date}
          </p>
        </div>
      </div>
    </article>
  );
}

/* ─────────────────────────────────────────────────────────
   RATING SUMMARY BAR (for populated state left column)
───────────────────────────────────────────────────────── */
function RatingDistributionBar({
  label,
  count,
  total,
}: {
  label: string;
  count: number;
  total: number;
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="shrink-0 text-[12px] font-medium text-muted-foreground w-8 text-right">{label}</span>
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-amber-400 rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="shrink-0 text-[12px] text-muted-foreground w-6">{count}</span>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   INLINE REVIEW FORM
───────────────────────────────────────────────────────── */
interface FormState {
  rating: number;
  title: string;
  body: string;
  name: string;
  email: string;
}

export type ReviewSubmitPayload = {
  rating: number;
  title: string;
  body: string;
  author_name: string;
  author_email: string;
};

function ReviewForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (payload: ReviewSubmitPayload) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<FormState>({
    rating: 0,
    title: "",
    body: "",
    name: "",
    email: "",
  });
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [submitting, setSubmitting] = useState(false);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const validate = (): boolean => {
    const e: typeof errors = {};
    if (!form.rating) e.rating = "Please select a rating.";
    if (!form.title.trim()) e.title = "Review title is required.";
    if (!form.body.trim()) e.body = "Please write your review.";
    if (!form.name.trim()) e.name = "Name is required.";
    if (!form.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
      e.email = "A valid email is required.";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    await onSubmit({
      rating: form.rating,
      title: form.title.trim(),
      body: form.body.trim(),
      author_name: form.name.trim(),
      author_email: form.email.trim(),
    });
    setSubmitting(false);
  };

  const field =
    "w-full rounded-lg border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-foreground/20 focus:border-foreground/40 transition-colors";

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="mt-8 rounded-2xl border border-gray-200 bg-gray-50/50 p-6 sm:p-8"
    >
      <h3 className="text-[15px] font-semibold text-foreground">Write a Review</h3>
      <p className="mt-1 text-[13px] text-muted-foreground">
        Share your experience with this product.
      </p>

      <div className="mt-6 space-y-5">
        {/* Star Rating */}
        <div>
          <label className="block text-[13px] font-medium text-foreground mb-2">
            Your Rating <span className="text-destructive">*</span>
          </label>
          <StarSelector value={form.rating} onChange={(v) => set("rating", v)} />
          {errors.rating && (
            <p className="mt-1.5 text-[12px] text-destructive">{errors.rating}</p>
          )}
        </div>

        {/* Review Title */}
        <div>
          <label htmlFor="review-title" className="block text-[13px] font-medium text-foreground mb-1.5">
            Review Title <span className="text-destructive">*</span>
          </label>
          <input
            id="review-title"
            type="text"
            placeholder="Summarize your experience"
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
            className={field}
          />
          {errors.title && (
            <p className="mt-1.5 text-[12px] text-destructive">{errors.title}</p>
          )}
        </div>

        {/* Review Body */}
        <div>
          <label htmlFor="review-body" className="block text-[13px] font-medium text-foreground mb-1.5">
            Review <span className="text-destructive">*</span>
          </label>
          <textarea
            id="review-body"
            rows={4}
            placeholder="Tell us what you liked or disliked about this product..."
            value={form.body}
            onChange={(e) => set("body", e.target.value)}
            className={cn(field, "resize-none")}
          />
          {errors.body && (
            <p className="mt-1.5 text-[12px] text-destructive">{errors.body}</p>
          )}
        </div>

        {/* Name + Email — 2 cols on sm+ */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="review-name" className="block text-[13px] font-medium text-foreground mb-1.5">
              Name <span className="text-destructive">*</span>
            </label>
            <input
              id="review-name"
              type="text"
              placeholder="Your name"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              className={field}
            />
            {errors.name && (
              <p className="mt-1.5 text-[12px] text-destructive">{errors.name}</p>
            )}
          </div>
          <div>
            <label htmlFor="review-email" className="block text-[13px] font-medium text-foreground mb-1.5">
              Email <span className="text-destructive">*</span>
            </label>
            <input
              id="review-email"
              type="email"
              placeholder="Your email (not shown publicly)"
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
              className={field}
            />
            {errors.email && (
              <p className="mt-1.5 text-[12px] text-destructive">{errors.email}</p>
            )}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="mt-6 flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="w-full sm:w-auto rounded-full border border-gray-200 bg-white px-6 py-2.5 text-[13px] font-medium text-foreground hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-full bg-foreground text-background px-6 py-2.5 text-[13px] font-medium hover:bg-foreground/90 transition-colors disabled:opacity-70"
        >
          {submitting ? (
            <>
              <svg className="size-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
              Submitting…
            </>
          ) : (
            "Submit Review"
          )}
        </button>
      </div>
    </form>
  );
}

/* ─────────────────────────────────────────────────────────
   PRODUCT RATING SUMMARY  (shown near product title)
───────────────────────────────────────────────────────── */
export function ProductRatingSummary({
  reviews,
  sectionId = "product-reviews",
}: {
  reviews: Review[];
  sectionId?: string;
}) {
  if (reviews.length === 0) return null;
  const avg = reviews.reduce((s, r) => s + r.rating, 0) / reviews.length;

  return (
    <a
      href={`#${sectionId}`}
      className="mt-2 inline-flex items-center gap-2 group hover:opacity-80 transition-opacity"
      aria-label={`${avg.toFixed(1)} average rating based on ${reviews.length} review${reviews.length !== 1 ? "s" : ""}. Click to read reviews.`}
    >
      <StarRow rating={avg} size="sm" />
      <span className="text-[13px] text-muted-foreground underline underline-offset-2 decoration-muted-foreground/30 group-hover:decoration-muted-foreground transition-all">
        ({reviews.length} {reviews.length === 1 ? "Review" : "Reviews"})
      </span>
    </a>
  );
}

/* ─────────────────────────────────────────────────────────
   MAIN PRODUCT REVIEWS SECTION
───────────────────────────────────────────────────────── */
export function ProductReviews({
  reviews = [],
  productHandle,
  sectionId = "product-reviews",
}: {
  reviews?: Review[];
  productHandle?: string;
  sectionId?: string;
}) {
  const [showForm, setShowForm] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);

  const handleWriteReview = () => {
    setShowForm(true);
    // Scroll to form after render
    setTimeout(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  };

  const handleSubmit = async (data: ReviewSubmitPayload) => {
    if (!productHandle) {
      toast.error("Missing product information.");
      return;
    }

    const { error } = await supabase.from('product_reviews').insert({
      product_handle: productHandle,
      rating: data.rating,
      title: data.title,
      body: data.body,
      author_name: data.author_name,
      author_email: data.author_email,
      is_verified_buyer: false,
      status: 'pending'
    });

    if (error) {
      console.error(error);
      toast.error("Failed to submit review. Please try again.");
      return;
    }

    toast.success("Thank you! Your review has been submitted for moderation.");
    setShowForm(false);
    
    // Scroll back to reviews list
    setTimeout(() => {
      document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  };

  /* ── Distribution chart data ── */
  const distribution = [5, 4, 3, 2, 1].map((star) => ({
    label: `${star}★`,
    count: reviews.filter((r) => r.rating === star).length,
  }));
  const avg = reviews.length
    ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length
    : 0;

  const isEmpty = reviews.length === 0;

  return (
    <section
      id={sectionId}
      aria-labelledby="reviews-heading"
      className="mt-16 sm:mt-24 border-t border-gray-200 pt-16 sm:pt-20 scroll-mt-24"
    >
      {/* ── EMPTY STATE ── */}
      {isEmpty && !showForm && (
        <div className="flex flex-col items-center text-center py-10">
          <h2 id="reviews-heading" className="text-lg font-semibold text-foreground">
            Customer Reviews
          </h2>
          <p className="mt-3 text-sm text-muted-foreground max-w-sm">
            Be the first to review this product.
          </p>
          <button
            onClick={handleWriteReview}
            className="mt-6 inline-flex items-center justify-center rounded-full bg-foreground text-background px-6 py-2.5 text-[13px] font-medium hover:bg-foreground/90 transition-colors"
          >
            Write a Review
          </button>
        </div>
      )}

      {/* ── POPULATED STATE ── */}
      {!isEmpty && (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-10">
            <h2 id="reviews-heading" className="text-[14px] sm:text-[15px] font-semibold tracking-[0.1em] text-foreground uppercase">
              Customer Reviews
            </h2>
            {!showForm && (
              <button
                onClick={handleWriteReview}
                className="self-start sm:self-auto inline-flex items-center justify-center rounded-full border border-gray-200 bg-white px-5 py-2 text-[13px] font-medium text-foreground hover:bg-gray-50 transition-colors"
              >
                Write a Review
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-10 lg:gap-16">
            {/* ── Left: Aggregate stats ── */}
            <div className="lg:sticky lg:top-24 self-start">
              <div className="flex items-end gap-3">
                <span className="text-5xl font-bold tracking-tight text-foreground tabular-nums">
                  {avg.toFixed(1)}
                </span>
                <div className="pb-1">
                  <StarRow rating={avg} size="md" />
                  <p className="mt-1 text-[12px] text-muted-foreground">
                    {reviews.length} {reviews.length === 1 ? "review" : "reviews"}
                  </p>
                </div>
              </div>

              <div className="mt-6 space-y-2">
                {distribution.map(({ label, count }) => (
                  <RatingDistributionBar
                    key={label}
                    label={label}
                    count={count}
                    total={reviews.length}
                  />
                ))}
              </div>
            </div>

            {/* ── Right: Review list ── */}
            <div>
              {reviews.map((review) => (
                <ReviewCard key={review.id} review={review} />
              ))}
            </div>
          </div>
        </>
      )}

      {/* ── INLINE FORM ── */}
      {showForm && (
        <div ref={formRef}>
          {/* If it's the empty state, still show the section header */}
          {isEmpty && (
            <h2 id="reviews-heading" className="text-[14px] sm:text-[15px] font-semibold tracking-[0.1em] text-foreground uppercase mb-2">
              Customer Reviews
            </h2>
          )}
          <ReviewForm
            onSubmit={handleSubmit}
            onCancel={() => setShowForm(false)}
          />
        </div>
      )}
    </section>
  );
}
