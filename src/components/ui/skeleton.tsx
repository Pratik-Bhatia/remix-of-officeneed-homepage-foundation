import { cn } from "@/lib/utils";

/**
 * A neutral placeholder block. Decorative only (hidden from screen readers --
 * wrap a loading region in `LoadingRegion` from
 * src/components/officeneed/skeletons.tsx for a single "Loading" announcement)
 * and motionless for users who prefer reduced motion.
 */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden="true" className={cn("animate-pulse rounded-md bg-muted motion-reduce:animate-none", className)} {...props} />;
}

export { Skeleton };
