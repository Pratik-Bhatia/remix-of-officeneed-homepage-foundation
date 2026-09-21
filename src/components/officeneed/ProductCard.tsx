import { Link } from "@tanstack/react-router";
import { Heart } from "lucide-react";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import type { Product } from "@/lib/products";
import { getCustomerToken } from "@/lib/customer";
import { useSaves } from "@/lib/saves";
import { cn } from "@/lib/utils";
import { productBelongsToCategory } from "@/lib/taxonomy";
import { useNormalizedImageScale } from "@/lib/image-content-scale";

export function ProductCard({ product }: { product: Product }) {
  const { savedHandles, toggleSave } = useSaves();
  const [busy, setBusy] = useState(false);
  const isSignedIn = typeof window !== "undefined" && Boolean(getCustomerToken());
  const isSaved = savedHandles.includes(product.slug);

  // Officeneed Exclusive's source photos have inconsistent product-to-frame
  // fill ratios (see image-content-scale.ts) -- normalize perceived size
  // there only. Every other category renders exactly as before.
  const isOfficeneedExclusive = productBelongsToCategory(product.collectionHandles, "Officeneed Exclusive");
  const contentScale = useNormalizedImageScale(product.images[0], isOfficeneedExclusive);

  // Hover-swap to the product's own second image, exactly as Shopify
  // ordered it -- never a different product, never generated/guessed, and
  // never available at all if there's no real second image (or it's a
  // duplicate of the first, which some Shopify listings have).
  const hoverImage =
    product.images.length > 1 && product.images[1] !== product.images[0] ? product.images[1] : undefined;
  const hoverContentScale = useNormalizedImageScale(hoverImage, isOfficeneedExclusive);

  // A SINGLE <img> swaps its own src between the two -- never two images
  // stacked at once. Many of this catalogue's product photos are
  // transparent-background cutouts, so a second (opaque) layer on top of an
  // always-visible first layer let the first bleed through the second's
  // letterboxed padding -- exactly the ghosting this replaces.
  const [isHovering, setIsHovering] = useState(false);
  // If the hover image 404s/fails, stop trying it for this card instead of
  // flashing a broken image every time the pointer re-enters.
  const [hoverImageFailed, setHoverImageFailed] = useState(false);
  const showingHoverImage = isHovering && !!hoverImage && !hoverImageFailed;
  const displayedSrc = showingHoverImage ? hoverImage! : product.images[0];
  const displayedScale = showingHoverImage ? hoverContentScale : contentScale;

  // Warm the browser cache for the hover image as soon as we know the card
  // has one, so the swap on pointer-enter is instant rather than flashing a
  // blank/loading frame. Never fetches image[2], image[3], etc.
  useEffect(() => {
    if (!hoverImage) return;
    const preload = new Image();
    preload.src = hoverImage;
  }, [hoverImage]);

  // Pointer Events tell us definitively whether this came from a mouse
  // (pointerType === "mouse") rather than touch/pen -- unlike CSS :hover,
  // which can be triggered/"stuck" by a tap on some touch browsers. Tapping
  // a card on mobile/tablet must never change its image.
  const handlePointerEnter = (event: React.PointerEvent) => {
    if (event.pointerType === "mouse" && hoverImage) setIsHovering(true);
  };
  const handlePointerLeave = (event: React.PointerEvent) => {
    if (event.pointerType === "mouse") setIsHovering(false);
  };

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
        className="group flex h-full flex-col rounded-2xl bg-white p-3 sm:p-4 shadow-[0_2px_12px_rgba(0,0,0,0.05)] transition-shadow duration-300 hover:shadow-[0_4px_20px_rgba(0,0,0,0.08)] outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <div
          className="relative aspect-square w-full overflow-hidden rounded-xl bg-white"
          onPointerEnter={handlePointerEnter}
          onPointerLeave={handlePointerLeave}
        >
          <img
            src={displayedSrc}
            alt={product.name}
            loading="lazy"
            decoding="async"
            onError={() => {
              if (showingHoverImage) setHoverImageFailed(true);
            }}
            style={isOfficeneedExclusive ? ({ "--content-scale": displayedScale } as React.CSSProperties) : undefined}
            className={cn(
              // "transition" (not just transition-transform) so the
              // existing zoom-on-hover keeps animating smoothly, while also
              // covering opacity on this same element in case any future
              // hover-state opacity change is added here.
              // Less inner padding on mobile only (sm: unchanged) -- the
              // square image area is much smaller in a 2-up mobile grid, so
              // the same padding used at desktop sizes left a lot of empty
              // space around the product; object-contain/centering and the
              // aspect-square container are untouched, so nothing crops,
              // stretches or shifts, the product just fills more of the
              // same frame.
              "h-full w-full object-contain object-center p-4 sm:p-8 transition duration-200 ease-out",
              isOfficeneedExclusive
                ? "scale-[var(--content-scale)] group-hover:scale-[calc(var(--content-scale)*1.05)]"
                : "group-hover:scale-105",
            )}
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

        <div className="mt-4 flex flex-1 flex-col gap-2 px-1 pb-1">
          {/* min-h reserves 2 lines' worth of space on mobile even for a
              short 1-line title, so the price sits at the same height
              across every card in a row instead of drifting up/down with
              title length; reset at sm: so desktop is unaffected. */}
          <h3 className="line-clamp-2 min-h-[2.5rem] sm:min-h-0 text-sm font-medium leading-snug text-foreground sm:text-base">
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
