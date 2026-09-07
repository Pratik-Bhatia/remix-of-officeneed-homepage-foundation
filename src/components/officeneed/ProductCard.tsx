import { Link } from "@tanstack/react-router";
import { Heart } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import type { Product } from "@/lib/products";
import { getCustomerToken } from "@/lib/customer";
import { useSaves } from "@/lib/saves";
import { cn } from "@/lib/utils";

export function ProductCard({ product }: { product: Product }) {
  const { savedHandles, toggleSave } = useSaves();
  const [busy, setBusy] = useState(false);
  const isSignedIn = typeof window !== "undefined" && Boolean(getCustomerToken());
  const isSaved = savedHandles.includes(product.slug);

  const handleToggle = async (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setBusy(true);
    try {
      const result = await toggleSave(product.slug);
      toast.success(result.saved ? "Saved to your account." : "Removed from your saves.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update your saves.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative h-full">
      <Link
        to="/products/$slug"
        params={{ slug: product.slug }}
        aria-label={`View ${product.name}`}
        className="group flex h-full flex-col rounded-2xl transition-shadow duration-300 hover:shadow-lg outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-secondary">
          <img
            src={product.images[0]}
            alt={product.name}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-contain object-center p-6 sm:p-8 transition-transform duration-300 ease-out group-hover:scale-105"
          />
          {product.badge ? (
            <span className="absolute left-3 top-3 rounded-full bg-primary px-2.5 py-1 text-[0.62rem] font-semibold uppercase tracking-[0.12em] text-primary-foreground z-10">
              {product.badge}
            </span>
          ) : null}
          {!product.price && (
            <span className="absolute right-3 top-3 rounded-full bg-foreground/90 px-2.5 py-1 text-[0.62rem] font-medium tracking-[0.1em] text-background backdrop-blur z-10">
              Enquiry Only
            </span>
          )}
        </div>

        <div className="mt-4 flex flex-1 flex-col gap-2">
          <h3 className="line-clamp-2 text-sm font-medium leading-snug text-foreground sm:text-base">
            {product.name}
          </h3>
          <p className="text-xs tabular-nums text-foreground/80">
            {product.price
              ? `${product.startingPrice ? "From " : ""}${product.price}`
              : "Price on enquiry"}
          </p>
        </div>
      </Link>

      {isSignedIn ? (
        <button
          type="button"
          onClick={handleToggle}
          disabled={busy}
          aria-label={isSaved ? `Remove ${product.name} from your saves` : `Save ${product.name}`}
          aria-pressed={isSaved}
          className="absolute right-3 top-3 z-20 grid size-9 place-items-center rounded-full border border-border bg-background/85 backdrop-blur transition-colors hover:border-foreground/40 disabled:opacity-60"
          style={product.price ? undefined : { top: "3rem" }}
        >
          <Heart className={cn("size-4", isSaved ? "fill-foreground text-foreground" : "text-muted-foreground")} />
        </button>
      ) : null}
    </div>
  );
}
