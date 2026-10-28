import { cn } from "@/lib/utils";

/** The filled gold rating star, shared by the review section and product cards. */
export function RatingStar({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className={cn("size-4 text-amber-400", className)} aria-hidden="true">
      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.518 4.674a1 1 0 00.95.69h4.911c.969 0 1.371 1.24.588 1.81l-3.974 2.888a1 1 0 00-.364 1.118l1.518 4.674c.3.921-.755 1.688-1.538 1.118l-3.974-2.888a1 1 0 00-1.176 0l-3.974 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.364-1.118L2.08 10.1c-.783-.57-.381-1.81.588-1.81h4.911a1 1 0 00.951-.69l1.519-4.673z" />
    </svg>
  );
}
