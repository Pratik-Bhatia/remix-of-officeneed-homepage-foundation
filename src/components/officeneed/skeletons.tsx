/**
 * Storefront skeletons, built on the shared <Skeleton> primitive
 * (src/components/ui/skeleton.tsx). Each one mirrors the layout of the real
 * content it stands in for, so swapping in the data doesn't shift the page.
 *
 * Use them ONLY while a request is genuinely in flight (see LoadStatus in
 * src/lib/load-status.ts) -- never for static content, and never in place
 * of an error or empty state.
 */
import { ImageOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

/** One accessible "Loading …" announcement for a whole region of skeletons. */
export function LoadingRegion({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div role="status" aria-busy="true" aria-live="polite" className={className}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

/** Lines of text; the last line is shorter, like a real paragraph. */
export function SkeletonText({ lines = 2, className, lineClassName = "h-3.5" }: { lines?: number; className?: string; lineClassName?: string }) {
  return (
    <div className={cn("space-y-2", className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={cn(lineClassName, i === lines - 1 && lines > 1 ? "w-2/3" : "w-full")} />
      ))}
    </div>
  );
}

/** Mirrors ProductCard: square image well, vendor, two-line title, price. */
export function ProductCardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-col", className)}>
      <Skeleton className="aspect-square w-full rounded-2xl" />
      <Skeleton className="mt-4 h-3 w-1/3" />
      <Skeleton className="mt-2.5 h-4 w-11/12" />
      <Skeleton className="mt-1.5 h-4 w-2/3" />
      <Skeleton className="mt-3 h-4 w-1/4" />
    </div>
  );
}

/** The product page's first screen (gallery + purchase column), same grid as the real page. */
export function ProductDetailSkeleton() {
  return (
    <main data-pdp-pending className="mx-auto w-full max-w-[1600px] px-5 pt-6 sm:px-8 lg:px-12">
      <LoadingRegion label="Loading product">
        <div className="flex w-full flex-col items-start gap-8 lg:grid lg:grid-cols-[minmax(0,1.1fr)_minmax(min(440px,100%),0.9fr)] lg:gap-12">
          <Skeleton className="aspect-square w-full rounded-2xl" />
          <div className="w-full">
            <Skeleton className="h-8 w-4/5" />
            <Skeleton className="mt-3 h-4 w-1/3" />
            <Skeleton className="mt-6 h-8 w-1/3" />
            <Skeleton className="mt-8 h-11 w-full rounded-md" />
            <Skeleton className="mt-3 h-11 w-full rounded-md" />
          </div>
        </div>
      </LoadingRegion>
    </main>
  );
}

/** A grid of product-card skeletons; pass the real grid's classes to match it. */
export function ProductGridSkeleton({
  count = 8,
  className = "grid grid-cols-2 gap-x-5 gap-y-10 sm:gap-x-6 md:grid-cols-3 lg:grid-cols-4",
  label = "Loading products",
}: { count?: number; className?: string; label?: string }) {
  return (
    <LoadingRegion label={label} className={className}>
      {Array.from({ length: count }).map((_, i) => (
        <ProductCardSkeleton key={i} />
      ))}
    </LoadingRegion>
  );
}

/** Mirrors the reviews aggregate column: big average, stars, count, 5 bars. */
export function ReviewSummarySkeleton() {
  return (
    <div>
      <div className="flex items-end gap-3">
        <Skeleton className="h-12 w-16" />
        <div className="space-y-1.5 pb-1">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-3 w-16" />
        </div>
      </div>
      <div className="mt-6 space-y-2.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-3 w-8" />
            <Skeleton className="h-1.5 flex-1 rounded-full" />
            <Skeleton className="h-3 w-6" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Mirrors ReviewCard: stars, title, two body lines, author line, separator. */
export function ReviewCardSkeleton() {
  return (
    <div className="border-b border-gray-200 py-6 first:pt-0 last:border-b-0">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="mt-3 h-4 w-1/2" />
      <SkeletonText lines={2} className="mt-3" />
      <Skeleton className="mt-4 h-3 w-32" />
    </div>
  );
}

/** Compact one-line rating placeholder (rating summary near the product title). */
export function RatingLineSkeleton({ className }: { className?: string }) {
  return <Skeleton className={cn("mt-2 h-5 w-36", className)} />;
}

/** Mirrors a cart line: square thumbnail, title, variant, price/qty row. */
export function CartLineSkeleton() {
  return (
    <div className="flex gap-4 border-b border-border py-5">
      <Skeleton className="size-20 shrink-0 rounded-xl sm:size-24" />
      <div className="min-w-0 flex-1">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="mt-2 h-3 w-1/3" />
        <div className="mt-4 flex items-center justify-between">
          <Skeleton className="h-8 w-24 rounded-full" />
          <Skeleton className="h-4 w-16" />
        </div>
      </div>
    </div>
  );
}

/** Label/value pairs (account and company details). */
export function DetailListSkeleton({ items = 4, className }: { items?: number; className?: string }) {
  return (
    <div className={cn("grid gap-4 sm:grid-cols-2", className)}>
      {Array.from({ length: items }).map((_, i) => (
        <div key={i}>
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-2 h-4 w-40" />
        </div>
      ))}
    </div>
  );
}

/**
 * Fills an image well whose image failed to load: a quiet icon and label
 * instead of the browser's broken-image icon or raw alt text. Pair it with
 * `invisible` on the failed <img> so the well keeps its size.
 */
export function ImageUnavailable({ className, large = false }: { className?: string; large?: boolean }) {
  return (
    <div className={cn("absolute inset-0 z-[1] grid place-items-center rounded-[inherit] bg-muted text-muted-foreground", className)}>
      <span className={cn("flex flex-col items-center gap-1.5", large ? "text-sm" : "text-[11px]")}>
        <ImageOff className={large ? "size-9" : "size-6"} strokeWidth={1.5} aria-hidden="true" />
        Image unavailable
      </span>
    </div>
  );
}

/**
 * onError for decorative images whose label is already shown as text
 * (category tiles): hide the failed image instead of the browser's
 * broken-image icon and raw alt text. The tile keeps its size.
 */
export function hideBrokenImage(e: React.SyntheticEvent<HTMLImageElement>) {
  e.currentTarget.style.visibility = "hidden";
}

/** A failed load: a short honest message and a retry -- never the empty state. */
export function LoadError({ message, onRetry, className }: { message: string; onRetry?: (() => void) | undefined; className?: string }) {
  return (
    <div role="alert" className={cn("flex flex-col items-start gap-3 text-sm text-muted-foreground", className)}>
      <p>{message}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center justify-center rounded-full border border-gray-200 bg-white px-5 py-2 text-[13px] font-medium text-foreground transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground"
        >
          Try again
        </button>
      ) : null}
    </div>
  );
}
