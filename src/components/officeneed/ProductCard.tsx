import { Link } from "@tanstack/react-router";
import { Heart } from "lucide-react";
import { toast } from "sonner";
import { memo, useEffect, useState } from "react";
import type { Product } from "@/lib/products";
import { getCustomerToken } from "@/lib/customer";
import { useSaves } from "@/lib/saves";
import { setPendingSave } from "@/lib/pending-save";
import { cn } from "@/lib/utils";
import { productBelongsToCategory, getCategoryByTitle, resolveLiveTitle } from "@/lib/taxonomy";
import { useNormalizedImageScale } from "@/lib/image-content-scale";
import { useShopifyCollections } from "@/lib/shopify-overlay";
import { shopifyImageUrl } from "@/lib/shopify-image";
import { getDiscount } from "@/lib/discount";
import { formatMoney } from "@/lib/shopify";
import { DiscountBadge } from "@/components/officeneed/DiscountBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { ImageUnavailable } from "@/components/officeneed/skeletons";
import { RatingStar } from "@/components/officeneed/RatingStar";
import { useProductRating } from "@/hooks/useProductRating";
import { formatAverage } from "@/lib/review-ratings";

// Grid cards never render wider than a few hundred px -- 600 comfortably
// covers a ~300px card at 2x pixel density without requesting Shopify's
// full original (often several thousand px) asset.
const PRODUCT_CARD_IMAGE_WIDTH = 600;

/** Resolves a stable classify()-derived category/subcategory string (e.g.
 * "Pen") to its current Shopify collection title (e.g. "Pen and Pencil"),
 * falling back to the raw string unchanged if it isn't a known taxonomy
 * label. */
function eyebrowLabel(collections: Array<{ handle: string; title: string }>, label: string): string {
  const match = getCategoryByTitle(label);
  if (!match) return label;
  return resolveLiveTitle(collections, match.node);
}

function ProductCardImpl({
  product,
  className,
  showEyebrow = false,
  imageWellClassName,
  pricePending = false,
}: {
  product: Product;
  /** Extra classes merged onto the outer card wrapper. Lets a caller like
   * Bestsellers size the card for a horizontal carousel instead of the
   * /products grid's own sizing, without a second card implementation. */
  className?: string;
  /** Shows a small uppercase label (brand/vendor, falling back to
   * subcategory, then category) above the title. Off by default so the
   * /products grid is unchanged; Bestsellers turns it on for its
   * collection/brand label. */
  showEyebrow?: boolean;
  /** Overrides the image well's background (defaults to white, the
   * /products grid treatment). Bestsellers passes its own #F5F5F7 "cutout"
   * treatment to match that section's card design. */
  imageWellClassName?: string;
  /** True while this buyer's correct price for `product` is still being
   * determined (B2B context resolving, or its contextual-pricing overlay
   * still in flight) -- renders a skeleton instead of `product.price` so
   * an anonymous/B2C number is never painted as a frame of the UI for a
   * buyer who may turn out to be B2B. See useShopifyCatalogue /
   * useShopifyBestsellers's `pricesReady`. */
  pricePending?: boolean;
}) {
  const { savedHandles, toggleSave } = useSaves();
  const [busy, setBusy] = useState(false);
  if (import.meta.env.DEV) {
    // Dev-only (tree-shaken in production builds). Slug + boolean only.
    console.debug("[ProductCard] slug:", product.slug, "| pricePending:", pricePending);
  }
  // Same cached collections query every other category surface uses (React
  // Query dedupes by key, so N cards on a grid cost one request, not N) --
  // resolves the eyebrow's subcategory/category label to its CURRENT
  // Shopify collection title instead of the stable classify()-derived
  // string, which only ever serves as a lookup key here.
  const { collections } = useShopifyCollections();
  const isSaved = savedHandles.includes(product.slug);
  const discount = getDiscount(product.priceAmount, product.compareAtAmount);
  // Approved-review summary from the one shared, cached request (never per card).
  const rating = useProductRating(product.slug);

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

  // Image well state: a subtle placeholder until the FIRST image has loaded
  // (sticky -- hover swaps never bring it back), and a quiet fallback if the
  // main image fails, instead of a blank square or a broken-image icon.
  const [imageReady, setImageReady] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  // An image already loaded (e.g. from cache) before hydration never fires
  // onLoad -- read its state directly when the element mounts.
  const imageRef = (img: HTMLImageElement | null) => {
    if (img?.complete && !imageReady) {
      if (img.naturalWidth > 0) setImageReady(true);
      else if (img.currentSrc) setImageFailed(true);
    }
  };

  // Warm the browser cache for the hover image as soon as we know the card
  // has one, so the swap on pointer-enter is instant rather than flashing a
  // blank/loading frame. Never fetches image[2], image[3], etc.
  useEffect(() => {
    if (!hoverImage) return;
    // The hover swap only ever happens for a mouse pointer (see handlePointerEnter), so on touch-only
    // devices this prefetched a second image for EVERY card on the page (99-330 extra requests on a
    // collection page) that could never be shown, competing with the visible images for bandwidth.
    if (typeof window !== "undefined" && typeof window.matchMedia === "function" && !window.matchMedia("(hover: hover)").matches) return;
    const preload = new Image();
    preload.src = shopifyImageUrl(hoverImage, PRODUCT_CARD_IMAGE_WIDTH);
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

    // Guest: the save itself needs a real Shopify customer, but the heart
    // is still fully interactive -- remember which product, then route
    // through the existing auth modal exactly like every other
    // sign-in-required action in the app (CartProfileLinks.tsx,
    // account.tsx). CustomerAuthModal completes this save, at most once,
    // right after a successful sign-in/registration; closing/cancelling
    // the modal clears it instead. No navigation happens either way --
    // the modal is an overlay on this same page, so there's nothing to
    // "return" to.
    if (!getCustomerToken()) {
      setPendingSave(product.slug);
      window.dispatchEvent(new CustomEvent("open-auth-modal"));
      return;
    }

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
    <div className={cn("relative h-full", className)}>
      <Link
        to="/products/$slug"
        params={{ slug: product.slug }}
        aria-label={`View ${product.name}`}
        preload="intent"
        className="group flex h-full flex-col outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        {/* The white rounded/shadowed "card" surface belongs to the image
            only -- vendor/title/price below sit directly on the page
            background, not inside a second white box. */}
        <div
          className={cn(
            "relative aspect-square w-full overflow-hidden rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.05)] transition-shadow duration-300 group-hover:shadow-[0_4px_20px_rgba(0,0,0,0.08)]",
            imageWellClassName ?? "bg-white",
          )}
          onPointerEnter={handlePointerEnter}
          onPointerLeave={handlePointerLeave}
        >
          {!imageReady && !imageFailed ? (
            <Skeleton className="absolute inset-0 rounded-none" />
          ) : null}
          {imageFailed && !showingHoverImage ? <ImageUnavailable /> : null}
          <img
            ref={imageRef}
            src={shopifyImageUrl(displayedSrc, PRODUCT_CARD_IMAGE_WIDTH)}
            alt={product.name}
            loading="lazy"
            decoding="async"
            onLoad={() => setImageReady(true)}
            onError={() => {
              if (showingHoverImage) setHoverImageFailed(true);
              else if (!imageReady) setImageFailed(true);
            }}
            style={isOfficeneedExclusive ? ({ "--content-scale": displayedScale } as React.CSSProperties) : undefined}
            className={cn(
              // "transition" (not just transition-transform) so the
              // existing zoom-on-hover keeps animating smoothly, while also
              // covering opacity on this same element in case any future
              // hover-state opacity change is added here.
              // Minimal inner padding on mobile only (sm: unchanged) -- the
              // square image area is much smaller in a 2-up mobile grid, so
              // even the previous p-4 still left the product looking small
              // against a lot of empty frame; object-contain/centering and
              // the aspect-square container are untouched, so nothing crops,
              // stretches or shifts for any aspect ratio, the product just
              // fills noticeably more of the same frame.
              // relative (no z-index): paints above the loading placeholder as soon as it
              // decodes -- even before hydration -- while the later badges stay on top.
              "relative h-full w-full object-contain object-center p-1.5 sm:p-8 transition duration-200 ease-out",
              isOfficeneedExclusive
                ? "scale-[var(--content-scale)] group-hover:scale-[calc(var(--content-scale)*1.05)]"
                : "group-hover:scale-105",
              // A failed image never shows the browser's broken icon/alt text.
              imageFailed && !showingHoverImage && "invisible",
            )}
          />
          {/* Top-left stack: the existing product badge (if any) with the
              dynamic discount badge beneath it, so they never overlap each
              other. The heart owns top-right. max-w leaves room for it. */}
          {product.badge || (!pricePending && discount) ? (
            <div className="absolute left-2 top-2 z-10 flex max-w-[calc(100%-3.5rem)] flex-col items-start gap-1 sm:left-3 sm:top-3 sm:gap-1.5">
              {product.badge ? (
                <span className="rounded-full bg-primary px-2.5 py-1 text-[0.62rem] font-semibold uppercase tracking-[0.12em] text-primary-foreground">
                  {product.badge}
                </span>
              ) : null}
              {!pricePending ? (
                <DiscountBadge
                  price={product.priceAmount}
                  compareAtPrice={product.compareAtAmount}
                  className="px-1.5 py-0.5 text-[0.58rem] sm:px-2.5 sm:py-1 sm:text-[0.62rem]"
                />
              ) : null}
            </div>
          ) : null}
          {!product.price && (
            <span className="absolute right-3 top-3 rounded-full bg-foreground/90 px-2.5 py-1 text-[0.62rem] font-medium tracking-[0.1em] text-background backdrop-blur z-10">
              Enquiry Only
            </span>
          )}
        </div>

        {/* Compact info block, centered: vendor (optional), then title,
            then price stacked BELOW it (never beside it) -- price given
            more size/weight than the title so it reads as the stronger
            element, while staying in the same font family/color system. */}
        <div className="mt-2.5 flex flex-1 flex-col items-center gap-1 px-1 pb-1 text-center">
          {showEyebrow && (
            <p className="text-eyebrow text-muted-foreground">
              {product.vendor || eyebrowLabel(collections, product.subcategories[0] ?? product.category)}
            </p>
          )}
          <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-foreground sm:text-base">
            {product.name}
          </h3>
          {/* Selling price and (when discounted) the crossed-out original
              share one baseline-aligned row; wraps only if the pair truly
              can't fit the card width. */}
          <p className="flex max-w-full flex-wrap items-baseline justify-center gap-x-1.5 sm:gap-x-2">
            <span className="text-base font-normal tabular-nums text-foreground sm:text-lg">
              {pricePending ? (
                <span className="inline-block h-[1em] w-16 animate-pulse rounded bg-muted align-middle" aria-hidden />
              ) : product.price ? (
                // Still the min/starting variant price Shopify returned
                // (product.startingPrice/product.price are unchanged) -- only
                // the "From " prefix text is dropped from this display.
                product.price
              ) : (
                "Price on enquiry"
              )}
            </span>
            {!pricePending && discount ? (
              <span className="text-xs tabular-nums text-muted-foreground line-through sm:text-sm">
                {formatMoney(discount.compareAtAmount, product.currencyCode ?? "INR")}
              </span>
            ) : null}
            {/* Compact rating, secondary to the price: only for products with
                approved reviews (nothing while loading, on failure, or with
                no reviews). One unbreakable unit -- if a narrow card can't
                fit it, the row's existing wrap moves it whole, never split. */}
            {rating ? (
              <span
                role="img"
                className="ml-0.5 inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-[13px] tabular-nums text-foreground/70 sm:text-sm"
                aria-label={`Rated ${formatAverage(rating.average)} out of 5 from ${rating.count} ${rating.count === 1 ? "review" : "reviews"}`}
              >
                <RatingStar className="size-3 self-center sm:size-3.5" />
                <span aria-hidden="true" className="font-medium text-foreground">{formatAverage(rating.average)}</span>
                <span aria-hidden="true">({rating.count})</span>
              </span>
            ) : null}
          </p>
        </div>
      </Link>

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
    </div>
  );
}

export const ProductCard = memo(ProductCardImpl);
