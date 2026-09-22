import { Link } from "@tanstack/react-router";
import { TAXONOMY } from "@/lib/taxonomy";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  giftHampers,
  type GiftHamper,
  type GiftShowcaseProduct,
} from "@/lib/gift-showcase";
import { cn } from "@/lib/utils";
import { products } from "@/lib/products";
import { useShopifyCatalogue } from "@/lib/shopify-overlay";

/**
 * Resolves a hotspot's live Shopify data by matching shopifyProductHandle
 * against the already-loaded site catalogue (same cached query every other
 * product card on the site uses -- no extra fetch here). Placeholder
 * hotspots (whose handle has no real match yet) fall through untouched;
 * only real, existing products -- like the H935 gift set -- get overlaid
 * with their real name/price/image/availability and the real PDP link.
 */
function resolveHamperProduct(
  product: GiftShowcaseProduct,
  catalogue: ReturnType<typeof useShopifyCatalogue>,
): GiftShowcaseProduct {
  const live = catalogue.find((p) => p.slug === product.shopifyProductHandle);
  if (!live) return product;
  return {
    ...product,
    productName: live.name,
    price: live.price ?? product.price,
    availability: live.availability ?? product.availability,
    image: live.images[0] ?? product.image,
    href: `/products/${live.slug}`,
  };
}

// Floating popup's own footprint (matches its fixed w-36 layout in
// ProductDetailCard, plus a conservative estimate of its content height --
// image + name + button + padding). Used only for collision math below, not
// for layout, so a few px of slack either way is harmless.
const FLOATING_CARD_WIDTH = 144;
const FLOATING_CARD_HEIGHT = 236;
const FLOATING_CARD_GAP = 12;
const FLOATING_CARD_MARGIN = 6;

/**
 * Picks a left/top (in px, relative to the image container) for the
 * floating popup that keeps it fully inside that container: right of the
 * hotspot when there's room, else left; below when there's room, else
 * above; whichever side has more room when neither fully fits; then a hard
 * clamp so no combination of hotspot position + container size can push any
 * part of the popup past the container's edges (the image's own
 * overflow-hidden would otherwise clip it).
 */
function getFloatingCardPosition(
  position: { x: number; y: number },
  containerWidth: number,
  containerHeight: number,
) {
  if (!containerWidth || !containerHeight) {
    // Not measured yet (first paint) -- fall back to the hotspot's own
    // percentage position; the very next layout pass replaces this.
    return { left: `${position.x}%`, top: `${position.y}%` };
  }

  const hotspotX = (position.x / 100) * containerWidth;
  const hotspotY = (position.y / 100) * containerHeight;

  const spaceRight = containerWidth - hotspotX;
  const spaceLeft = hotspotX;
  let left: number;
  if (spaceRight >= FLOATING_CARD_WIDTH + FLOATING_CARD_GAP) {
    left = hotspotX + FLOATING_CARD_GAP;
  } else if (spaceLeft >= FLOATING_CARD_WIDTH + FLOATING_CARD_GAP) {
    left = hotspotX - FLOATING_CARD_GAP - FLOATING_CARD_WIDTH;
  } else {
    left =
      spaceRight > spaceLeft
        ? hotspotX + FLOATING_CARD_GAP
        : hotspotX - FLOATING_CARD_GAP - FLOATING_CARD_WIDTH;
  }

  const spaceBelow = containerHeight - hotspotY;
  const spaceAbove = hotspotY;
  let top: number;
  if (spaceBelow >= FLOATING_CARD_HEIGHT + FLOATING_CARD_GAP) {
    top = hotspotY + FLOATING_CARD_GAP;
  } else if (spaceAbove >= FLOATING_CARD_HEIGHT + FLOATING_CARD_GAP) {
    top = hotspotY - FLOATING_CARD_GAP - FLOATING_CARD_HEIGHT;
  } else {
    top =
      spaceBelow > spaceAbove
        ? hotspotY + FLOATING_CARD_GAP
        : hotspotY - FLOATING_CARD_GAP - FLOATING_CARD_HEIGHT;
  }

  left = Math.min(
    Math.max(left, FLOATING_CARD_MARGIN),
    Math.max(FLOATING_CARD_MARGIN, containerWidth - FLOATING_CARD_WIDTH - FLOATING_CARD_MARGIN),
  );
  top = Math.min(
    Math.max(top, FLOATING_CARD_MARGIN),
    Math.max(FLOATING_CARD_MARGIN, containerHeight - FLOATING_CARD_HEIGHT - FLOATING_CARD_MARGIN),
  );

  return { left: `${left}px`, top: `${top}px` };
}

function SectionHeader() {
  return (
    <div className="w-full max-w-2xl text-left">
      <p className="text-eyebrow text-muted-foreground">Corporate Gifting</p>
      <h2 className="mt-2 text-balance font-display text-4xl font-semibold leading-[1.05] tracking-tight sm:mt-3 sm:text-5xl lg:text-[52px]">
        Designed to Gift.
        <br />
        Built to Impress.
      </h2>
    </div>
  );
}

function ProductHotspot({
  product,
  active,
  dimmed,
  onActivate,
  onDeactivate,
  onToggle,
}: {
  product: GiftShowcaseProduct;
  active: boolean;
  dimmed: boolean;
  onActivate: () => void;
  onDeactivate: () => void;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={`${product.productName} — view details`}
      aria-expanded={active}
      onMouseEnter={onActivate}
      onMouseLeave={onDeactivate}
      onFocus={onActivate}
      onBlur={onDeactivate}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      style={{ left: `${product.position.x}%`, top: `${product.position.y}%` }}
      className="absolute z-20 grid size-10 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full"
    >
      <span
        className={cn(
          "hotspot-dot relative grid size-4 place-items-center rounded-full border border-foreground/70 bg-background shadow-[0_2px_10px_-2px_rgb(0_0_0_/_0.35)] transition-all duration-300",
          active && "scale-125 border-foreground bg-foreground",
          dimmed && "opacity-45",
        )}
      >
        <span
          className={cn(
            "size-1.5 rounded-full bg-foreground transition-colors duration-300",
            active && "bg-background",
          )}
        />
      </span>
    </button>
  );
}

// Quick-preview only: image, name, CTA. No category/description/price/
// availability -- this popup's one job is "what is it, go look at it", not a
// second product summary (that's what the PDP it links to is for). One
// design for both desktop and mobile now -- both anchor to the hotspot
// inside the same image coordinate system (see getFloatingCardPosition),
// so there's no separate mobile "sheet" variant to keep in sync anymore.
function ProductDetailCard({
  product,
  className,
  style,
}: {
  product: GiftShowcaseProduct;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={style}
      className={cn(
        "animate-rise pointer-events-auto w-36 rounded-2xl border border-border/60 bg-white p-2.5 shadow-[0_12px_28px_-14px_rgb(0_0_0_/_0.3)]",
        className,
      )}
    >
      <img
        src={product.image}
        alt=""
        width={128}
        height={128}
        loading="lazy"
        decoding="async"
        className="aspect-square w-full rounded-lg object-cover"
      />
      <p className="mt-2 line-clamp-2 text-xs font-medium leading-snug text-foreground">
        {product.productName}
      </p>
      <a
        href={product.href}
        className="mt-2 flex min-h-7 items-center justify-center whitespace-nowrap rounded-full bg-foreground px-3 text-[0.7rem] font-medium text-background transition-opacity duration-200 hover:opacity-90"
      >
        View Product →
      </a>
    </div>
  );
}

function HamperCard({
  hamper,
  active,
  onSelectProduct,
  activeProductId,
}: {
  hamper: GiftHamper;
  active: boolean;
  activeProductId: string | null;
  onSelectProduct: (id: string | null, pinned: boolean) => void;
}) {
  const [hoverId, setHoverId] = useState<string | null>(null);
  const currentId = activeProductId ?? hoverId;
  const current = hamper.products.find((p) => p.productId === currentId) ?? null;

  // Live pixel size of the image container -- purely for the popup's
  // collision math below (WHERE on the image to anchor it, and how much
  // room is actually available around that point). This never touches
  // layout/geometry: nothing here sets the container's or article's size.
  const imageContainerRef = useRef<HTMLDivElement | null>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = imageContainerRef.current;
    if (!el) return;
    const update = () => setContainerSize({ width: el.clientWidth, height: el.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <article
      className={cn(
        "group relative shrink-0 snap-center transition-opacity duration-500",
        "max-w-[86vw] sm:max-w-[70vw] lg:max-w-[58vw] xl:max-w-[54rem]",
        !active && "lg:opacity-70 lg:hover:opacity-100",
      )}
    >
      {/* Sizing lives on the <img> itself, using the SAME viewport-unit caps
          as before (42vh/86vw etc, not percentages) -- a plain replaced
          element with intrinsic width/height + max-width/max-height +
          width:height:auto always shrinks on whichever axis binds while
          exactly preserving its own ratio; there's no parent-relative
          percentage involved anywhere, so there's no "definite ancestor
          size" precondition to get wrong. The wrapper below then has
          nothing of its own to size -- w-fit makes it shrink-wrap to
          whatever the img renders at, so wrapper === image, exactly, with
          zero internal empty space on any breakpoint. */}
      <div
        ref={imageContainerRef}
        className="relative mx-auto w-fit overflow-hidden rounded-[1.75rem] bg-secondary"
      >
        <img
          src={hamper.image}
          alt={hamper.imageAlt}
          width={hamper.imageWidth}
          height={hamper.imageHeight}
          loading="lazy"
          decoding="async"
          sizes="(min-width: 1024px) 58vw, 86vw"
          className="block h-auto w-auto max-h-[42vh] max-w-[86vw] object-contain transition-transform duration-700 ease-out sm:max-h-[40vh] sm:max-w-[70vw] lg:max-h-[38vh] lg:max-w-[58vw] xl:max-w-[54rem]"
        />

        {hamper.products.map((product) => (
          <ProductHotspot
            key={product.productId}
            product={product}
            active={currentId === product.productId}
            dimmed={currentId !== null && currentId !== product.productId}
            onActivate={() => setHoverId(product.productId)}
            onDeactivate={() => setHoverId(null)}
            onToggle={() =>
              onSelectProduct(
                activeProductId === product.productId ? null : product.productId,
                true,
              )
            }
          />
        ))}

        {/* Popup floats beside the active hotspot -- same on desktop and
            mobile, always positioned against this same image box, never
            position:fixed and never outside it (see getFloatingCardPosition). */}
        {current && (
          <div className="pointer-events-none absolute inset-0 z-30" aria-live="polite">
            <ProductDetailCard
              product={current}
              className="absolute"
              style={getFloatingCardPosition(
                current.position,
                containerSize.width,
                containerSize.height,
              )}
            />
          </div>
        )}
      </div>

      <div className="mt-3 sm:mt-4 flex items-start justify-between gap-6">
        <div className="min-w-0">
          <h3 className="font-display text-base font-semibold tracking-tight">
            {hamper.title}
          </h3>
          <p className="mt-1.5 text-xs leading-[1.4] text-muted-foreground sm:text-sm">
            {hamper.description}
          </p>
        </div>
        <a
          href={hamper.href}
          className="mt-1 shrink-0 whitespace-nowrap border-b border-foreground/25 pb-0.5 text-xs transition-colors duration-200 hover:border-foreground sm:text-sm"
        >
          View hamper →
        </a>
      </div>
    </article>
  );
}

function HamperCarousel() {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const sectionRef = useRef<HTMLDivElement | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [pinned, setPinned] = useState<{ hamperId: string; productId: string } | null>(
    null,
  );

  // Same cached catalogue query every ProductCard on the site already uses
  // -- reused here, not refetched, to resolve any hotspot whose
  // shopifyProductHandle matches a real product.
  const catalogue = useShopifyCatalogue(products);
  const resolvedHampers = useMemo(
    () =>
      giftHampers.map((hamper) => ({
        ...hamper,
        products: hamper.products.map((p) => resolveHamperProduct(p, catalogue)),
      })),
    [catalogue],
  );

  const scrollBy = useCallback((dir: 1 | -1) => {
    const el = scrollerRef.current;
    if (!el) return;
    const card = el.querySelector("article");
    const step = card ? card.getBoundingClientRect().width + 32 : el.clientWidth * 0.8;
    el.scrollBy({ left: dir * step, behavior: "smooth" });
  }, []);

  const onScroll = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const cards = Array.from(el.querySelectorAll("article"));
    const center = el.scrollLeft + el.clientWidth / 2;
    let best = 0;
    let bestDist = Infinity;
    cards.forEach((c, i) => {
      const cardCenter = c.offsetLeft + c.offsetWidth / 2;
      const d = Math.abs(cardCenter - center);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    setActiveIndex(best);
  }, []);

  useEffect(() => {
    if (!pinned) return;
    const onDown = (e: PointerEvent) => {
      if (!sectionRef.current?.contains(e.target as Node)) setPinned(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPinned(null);
    };
    document.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [pinned]);

  return (
    <div ref={sectionRef} className="relative">
      <div className="flex items-end justify-between gap-6">
        <div id="corporate-gifting-heading">
          <SectionHeader />
        </div>
      </div>

      <div
        ref={scrollerRef}
        onScroll={onScroll}
        className="-mx-5 mt-6 flex snap-x snap-mandatory gap-6 overflow-x-auto px-5 pb-4 sm:-mx-8 sm:mt-8 sm:gap-8 sm:px-8 lg:-mx-12 lg:px-12 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {resolvedHampers.map((hamper, i) => (
          <HamperCard
            key={hamper.id}
            hamper={hamper}
            active={i === activeIndex}
            activeProductId={
              pinned && pinned.hamperId === hamper.id ? pinned.productId : null
            }
            onSelectProduct={(productId) =>
              setPinned(productId ? { hamperId: hamper.id, productId } : null)
            }
          />
        ))}
      </div>

      <div className="pointer-events-none absolute inset-y-0 left-0 right-0 hidden items-center justify-between px-4 lg:flex xl:px-8">
        <button
          type="button"
          onClick={() => scrollBy(-1)}
          aria-label="Previous hamper"
          className="pointer-events-auto grid size-11 place-items-center rounded-full border border-border bg-background shadow-[0_4px_14px_-6px_rgb(0_0_0_/_0.2)] transition-colors duration-200 hover:bg-secondary"
        >
          <ChevronLeft className="size-5" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => scrollBy(1)}
          aria-label="Next hamper"
          className="pointer-events-auto grid size-11 place-items-center rounded-full border border-border bg-background shadow-[0_4px_14px_-6px_rgb(0_0_0_/_0.2)] transition-colors duration-200 hover:bg-secondary"
        >
          <ChevronRight className="size-5" aria-hidden="true" />
        </button>
      </div>

      <div className="mt-4 flex flex-col items-center justify-center gap-2 sm:mt-5 sm:flex-row sm:gap-4">
        <div className="flex items-center gap-1.5">
          {giftHampers.map((h, i) => (
            <span
              key={h.id}
              aria-hidden="true"
              className={cn(
                "h-1 rounded-full bg-foreground transition-all duration-300",
                i === activeIndex ? "w-8 opacity-100" : "w-3 opacity-25",
              )}
            />
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground sm:text-xs">
          Hover or tap a marker to explore the products.
        </p>
      </div>
    </div>
  );
}

function SectionCTA() {
  return (
    <div className="mx-auto mt-8 max-w-xl text-center sm:mt-10">
      <div className="mx-auto mb-6 h-px w-12 bg-border sm:mb-8" />
      <h3 className="font-display text-xl font-semibold tracking-tight sm:text-2xl">
        Explore Corporate Gifting
      </h3>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground sm:text-base">
        Discover curated gifts and custom gifting solutions for your team, clients and
        business partners.
      </p>
      <Link
        to="/products"
        search={{ collection: TAXONOMY["Corporate Gifting"].handle! }}
        className="mt-5 inline-flex h-11 items-center justify-center rounded-full border border-foreground/20 bg-transparent px-6 text-sm font-medium transition-colors duration-200 hover:border-foreground/40 hover:bg-secondary sm:h-12 sm:px-8"
      >
        Explore Corporate Gifting →
      </Link>
    </div>
  );
}

export function InteractiveGiftShowcase() {
  return (
    <section
      id="corporate-gifting"
      aria-labelledby="corporate-gifting-heading"
      className="w-full overflow-hidden bg-background py-8 sm:py-10 lg:py-12"
    >
      <div className="mx-auto w-full max-w-[1600px] px-5 sm:px-8 lg:px-12">
        <HamperCarousel />
        <SectionCTA />
      </div>
    </section>
  );
}


