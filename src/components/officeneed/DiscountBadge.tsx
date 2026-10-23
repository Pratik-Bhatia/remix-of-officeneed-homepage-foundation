import { getDiscount } from "@/lib/discount";
import { cn } from "@/lib/utils";

/** Renders "X% OFF" from Shopify's price/compareAtPrice, or nothing at all
 * when there's no valid discount. */
export function DiscountBadge({
  price,
  compareAtPrice,
  className,
}: {
  price: unknown;
  compareAtPrice: unknown;
  className?: string;
}) {
  const discount = getDiscount(price, compareAtPrice);
  if (!discount) return null;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center whitespace-nowrap rounded-full bg-primary px-2 py-0.5 text-[0.62rem] font-semibold uppercase tracking-[0.1em] text-primary-foreground",
        className,
      )}
    >
      {discount.percent}% OFF
    </span>
  );
}
