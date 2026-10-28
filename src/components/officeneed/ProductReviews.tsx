import { useEffect, useState, useRef } from "react";
import { CLARITY_MASK } from "@/lib/clarity";
import { cn } from "@/lib/utils";
import { CheckCircle2, ChevronLeft, ChevronRight, ImagePlus, Plus, X } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { MAX_REVIEW_PHOTOS, photoStrip } from "@/lib/review-photos";
import { prepareReviewPhoto, type PreparedReviewPhoto, type ReviewPhoto } from "@/lib/review-photo-media";
import { Pagination, PaginationContent, PaginationEllipsis, PaginationItem } from "@/components/ui/pagination";
import { buttonVariants } from "@/components/ui/button";
import { clampPage, pageItems, pageSlice } from "@/lib/pagination";
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
  /** Approved customer photos, in upload order. Absent/empty = text-only. */
  photos?: ReviewPhoto[];
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
   REVIEW PHOTOS  (thumbnail strip + lightbox)
───────────────────────────────────────────────────────── */
function ReviewPhotoLightbox({
  photos,
  author,
  index,
  onIndexChange,
  onClose,
}: {
  photos: ReviewPhoto[];
  author: string;
  index: number | null;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}) {
  const open = index !== null;
  const i = index ?? 0;
  const photo = photos[i];
  const many = photos.length > 1;
  const go = (delta: number) => onIndexChange((i + delta + photos.length) % photos.length);
  const nav =
    "absolute top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full border border-gray-200 bg-white/90 text-foreground transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground";
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        aria-describedby={undefined}
        // The dialog's built-in close button (its last child) gets the same
        // white circular style as the arrows, so it stays visible on any photo.
        className="w-[calc(100vw-2rem)] max-w-3xl gap-0 overflow-hidden border-gray-200 bg-white p-0 sm:rounded-xl [&>button:last-child]:right-3 [&>button:last-child]:top-3 [&>button:last-child]:grid [&>button:last-child]:size-9 [&>button:last-child]:place-items-center [&>button:last-child]:rounded-full [&>button:last-child]:border [&>button:last-child]:border-gray-200 [&>button:last-child]:!bg-white/90 [&>button:last-child]:!text-foreground [&>button:last-child]:opacity-100"
        onKeyDown={(e) => {
          if (!many) return;
          if (e.key === "ArrowRight") { e.preventDefault(); go(1); }
          if (e.key === "ArrowLeft") { e.preventDefault(); go(-1); }
        }}
      >
        <DialogTitle className="sr-only">{`Photo ${i + 1} of ${photos.length} from ${author}'s review`}</DialogTitle>
        {photo ? (
          <div className="relative flex min-h-[240px] items-center justify-center bg-gray-50">
            <img
              key={photo.fullUrl}
              src={photo.fullUrl}
              alt={`Photo ${i + 1} of ${photos.length} from ${author}'s review`}
              width={photo.width ?? undefined}
              height={photo.height ?? undefined}
              decoding="async"
              className="h-auto max-h-[75vh] w-auto max-w-full object-contain"
            />
            {many ? (
              <>
                <button type="button" onClick={() => go(-1)} aria-label="Previous photo" className={cn(nav, "left-3")}>
                  <ChevronLeft className="size-5" />
                </button>
                <button type="button" onClick={() => go(1)} aria-label="Next photo" className={cn(nav, "right-3")}>
                  <ChevronRight className="size-5" />
                </button>
              </>
            ) : null}
          </div>
        ) : null}
        <div className="flex items-center justify-between gap-4 border-t border-gray-200 px-4 py-3 text-[13px]">
          <span className="truncate font-medium text-foreground">{author}</span>
          {many ? <span className="shrink-0 tabular-nums text-muted-foreground">{i + 1} / {photos.length}</span> : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ReviewPhotoStrip({ photos, author }: { photos: ReviewPhoto[]; author: string }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const { visible, overflow } = photoStrip(photos.length);
  return (
    <>
      <ul className="mt-3 flex flex-wrap gap-2" aria-label={`Photos from ${author}'s review`}>
        {photos.slice(0, visible).map((photo, i) => {
          const showMore = overflow > 0 && i === visible - 1;
          return (
            <li key={photo.thumbUrl}>
              <button
                type="button"
                onClick={() => setOpenIndex(i)}
                aria-label={
                  showMore
                    ? `View photo ${i + 1} of ${photos.length} from ${author}'s review (${overflow} more)`
                    : `View photo ${i + 1} of ${photos.length} from ${author}'s review`
                }
                className="relative block size-16 overflow-hidden rounded-md border border-gray-200 bg-gray-50 transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 sm:size-[72px]"
              >
                <img
                  src={photo.thumbUrl}
                  alt=""
                  width={72}
                  height={72}
                  loading="lazy"
                  decoding="async"
                  className="size-full object-cover"
                />
                {showMore ? (
                  <span aria-hidden="true" className="absolute inset-0 grid place-items-center bg-black/45 text-[13px] font-semibold text-white">
                    +{overflow}
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
      <ReviewPhotoLightbox
        photos={photos}
        author={author}
        index={openIndex}
        onIndexChange={setOpenIndex}
        onClose={() => setOpenIndex(null)}
      />
    </>
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
          {review.photos?.length ? <ReviewPhotoStrip photos={review.photos} author={review.author} /> : null}
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
   REVIEW PAGINATION  (client-side, over the already-loaded list)
───────────────────────────────────────────────────────── */
export const REVIEWS_PER_PAGE = 4;

function ReviewPagination({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}) {
  const step = cn(
    buttonVariants({ variant: "ghost", size: "default" }),
    // Light hover (the theme's ghost/accent hover is solid black, which
    // would read as the active page).
    "h-10 gap-1 rounded-full px-3 text-[13px] font-medium hover:bg-gray-100 hover:text-foreground disabled:pointer-events-none disabled:opacity-40",
  );
  return (
    <Pagination aria-label="Review pages" className="mt-8">
      <PaginationContent className="gap-1">
        <PaginationItem>
          <button type="button" className={step} disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="Previous page of reviews">
            <ChevronLeft className="size-4" />
            <span>Previous</span>
          </button>
        </PaginationItem>
        {/* Numbered pages on sm+; a compact "2 / 5" on phones so the row always fits. */}
        <PaginationItem className="px-2 text-[13px] tabular-nums text-muted-foreground sm:hidden" aria-hidden="true">
          {page} / {totalPages}
        </PaginationItem>
        {pageItems(page, totalPages).map((item, i) =>
          item === "ellipsis" ? (
            <PaginationItem key={`e${i}`} className="hidden sm:block">
              <PaginationEllipsis />
            </PaginationItem>
          ) : (
            <PaginationItem key={item} className="hidden sm:block">
              <button
                type="button"
                onClick={() => onChange(item)}
                aria-label={`Page ${item}`}
                aria-current={item === page ? "page" : undefined}
                className={cn(
                  buttonVariants({ variant: "ghost", size: "icon" }),
                  "size-9 rounded-full text-[13px] tabular-nums",
                  item === page
                    ? "bg-foreground text-background hover:bg-foreground hover:text-background"
                    : "hover:bg-gray-100 hover:text-foreground",
                )}
              >
                {item}
              </button>
            </PaginationItem>
          ),
        )}
        <PaginationItem>
          <button type="button" className={step} disabled={page >= totalPages} onClick={() => onChange(page + 1)} aria-label="Next page of reviews">
            <span>Next</span>
            <ChevronRight className="size-4" />
          </button>
        </PaginationItem>
      </PaginationContent>
    </Pagination>
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
  /** Optional photos (already downscaled in the browser). */
  photos?: PreparedReviewPhoto[];
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
  const [photos, setPhotos] = useState<PreparedReviewPhoto[]>([]);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [preparingPhotos, setPreparingPhotos] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Free the preview object URLs when the form goes away.
  const photosRef = useRef(photos);
  photosRef.current = photos;
  useEffect(() => () => photosRef.current.forEach((p) => URL.revokeObjectURL(p.previewUrl)), []);

  const handlePhotoFiles = async (fileList: FileList | null) => {
    const files = Array.from(fileList ?? []);
    if (fileInputRef.current) fileInputRef.current.value = ""; // allow re-picking the same file
    if (!files.length) return;
    const room = MAX_REVIEW_PHOTOS - photos.length;
    const problems: string[] = [];
    if (files.length > room) problems.push(`You can add up to ${MAX_REVIEW_PHOTOS} photos.`);
    setPreparingPhotos(true);
    const added: PreparedReviewPhoto[] = [];
    for (const file of files.slice(0, room)) {
      const result = await prepareReviewPhoto(file);
      if ("error" in result) problems.push(result.error);
      else added.push(result);
    }
    setPreparingPhotos(false);
    setPhotos((prev) => [...prev, ...added].slice(0, MAX_REVIEW_PHOTOS));
    setPhotoError(problems.length ? problems.join(" ") : null);
  };

  const removePhoto = (key: string) => {
    setPhotos((prev) => {
      const gone = prev.find((p) => p.key === key);
      if (gone) URL.revokeObjectURL(gone.previewUrl);
      return prev.filter((p) => p.key !== key);
    });
    setPhotoError(null);
  };

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
    if (!validate() || preparingPhotos) return;
    setSubmitting(true);
    await onSubmit({
      rating: form.rating,
      title: form.title.trim(),
      body: form.body.trim(),
      author_name: form.name.trim(),
      author_email: form.email.trim(),
      ...(photos.length ? { photos } : {}),
    });
    setSubmitting(false);
  };

  const field =
    "w-full rounded-lg border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-foreground/20 focus:border-foreground/40 transition-colors";

  return (
    <form
      {...CLARITY_MASK}
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

        {/* Photos (optional) -- a compact row, secondary to the fields above. */}
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            tabIndex={-1}
            aria-hidden="true"
            className="sr-only"
            onChange={(e) => void handlePhotoFiles(e.target.files)}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={photos.length >= MAX_REVIEW_PHOTOS || preparingPhotos || submitting}
            aria-describedby="review-photos-hint"
            className="flex w-full items-center gap-2.5 rounded-lg border border-gray-200 bg-white px-3.5 py-2.5 text-left text-[13px] transition-colors hover:border-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <ImagePlus className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
            <span className="font-medium text-foreground">Add photos</span>
            <span className="text-muted-foreground">(optional)</span>
            <span className="ml-auto inline-flex items-center gap-1.5 text-[12px] tabular-nums text-muted-foreground">
              {preparingPhotos ? "Preparing…" : photos.length ? `${photos.length}/${MAX_REVIEW_PHOTOS}` : null}
              <Plus className="size-4" strokeWidth={1.75} aria-hidden="true" />
            </span>
          </button>
          <p id="review-photos-hint" className="mt-1.5 text-[12px] text-muted-foreground">
            JPG, PNG or WebP · up to {MAX_REVIEW_PHOTOS} photos, 10 MB each
          </p>
          {photos.length ? (
            <ul className="mt-3 flex flex-wrap gap-2" aria-label="Selected photos">
              {photos.map((photo, i) => (
                <li key={photo.key} className="relative size-14 overflow-hidden rounded-md border border-gray-200 bg-gray-50">
                  <img src={photo.previewUrl} alt={`Selected photo ${i + 1}`} className="size-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removePhoto(photo.key)}
                    disabled={submitting}
                    aria-label={`Remove photo ${i + 1}`}
                    className="absolute right-0.5 top-0.5 grid size-5 place-items-center rounded-full bg-black/60 text-white transition-colors hover:bg-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                  >
                    <X className="size-3" strokeWidth={2.5} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {photoError && (
            <p role="alert" className="mt-1.5 text-[12px] text-destructive">{photoError}</p>
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
  const listRef = useRef<HTMLDivElement>(null);
  const [requestedPage, setRequestedPage] = useState(1);

  // This component stays mounted across PDP-to-PDP navigation, so start
  // each product on page 1. Clamping below also covers the list changing.
  useEffect(() => setRequestedPage(1), [productHandle]);
  const { page, totalPages } = clampPage(requestedPage, reviews.length, REVIEWS_PER_PAGE);
  const visibleReviews = pageSlice(reviews, page, REVIEWS_PER_PAGE);

  const goToPage = (next: number) => {
    setRequestedPage(next);
    // Only scroll if the list's top has scrolled out of view (e.g. paging
    // from the controls under a long page of reviews).
    const top = listRef.current?.getBoundingClientRect().top ?? 0;
    if (top < 0) listRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

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

    // With photos: the server stores them and the review together (it
    // needs the review id to link them). Text-only reviews keep the
    // original direct insert below, unchanged.
    if (data.photos?.length) {
      const { submitReviewWithPhotos } = await import("@/lib/review-photos.functions");
      let result: { ok: true } | { ok: false; error: string };
      try {
        result = await submitReviewWithPhotos({
          data: {
            productHandle,
            rating: data.rating,
            title: data.title,
            body: data.body,
            authorName: data.author_name,
            authorEmail: data.author_email,
            photos: data.photos.map(({ full, thumb }) => ({ full, thumb })),
          },
        });
      } catch (err) {
        console.error(err);
        result = { ok: false, error: "Failed to submit review. Please try again." };
      }
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Thank you! Your review has been submitted for moderation.");
      setShowForm(false);
      setTimeout(() => {
        document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 50);
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

            {/* ── Right: Review list (REVIEWS_PER_PAGE at a time) ── */}
            <div ref={listRef} className="scroll-mt-28">
              {visibleReviews.map((review) => (
                <ReviewCard key={review.id} review={review} />
              ))}
              {totalPages > 1 && <ReviewPagination page={page} totalPages={totalPages} onChange={goToPage} />}
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
