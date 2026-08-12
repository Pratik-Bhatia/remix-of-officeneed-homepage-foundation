import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import {
  giftHampers,
  type GiftHamper,
  type GiftShowcaseProduct,
} from "@/lib/gift-showcase";
import { cn } from "@/lib/utils";

function SectionHeader() {
  return (
    <div className="max-w-2xl">
      <p className="text-eyebrow text-muted-foreground">Corporate Gifting</p>
      <h2 className="text-section mt-4 text-balance">
        Designed to Gift.
        <br />
        Built to Impress.
      </h2>
      <p className="mt-4 text-pretty text-sm leading-relaxed text-muted-foreground sm:text-base">
        Explore thoughtfully curated corporate gifts — from complete hampers to the
        individual products inside them.
      </p>
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

function ProductDetailCard({
  product,
  variant,
  className,
  style,
  onClose,
}: {
  product: GiftShowcaseProduct;
  variant: "floating" | "sheet";
  className?: string;
  style?: React.CSSProperties;
  onClose?: () => void;
}) {
  return (
    <div
      style={style}
      className={cn(
        "animate-rise pointer-events-auto border border-border bg-background p-4 shadow-[0_18px_40px_-30px_rgb(0_0_0_/_0.45)]",
        variant === "floating" ? "w-64 rounded-xl" : "w-full rounded-2xl",
        className,
      )}
    >
      {variant === "sheet" && onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Close product details"
          className="absolute right-6 top-6 grid size-8 place-items-center rounded-full border border-border bg-background"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      )}
      <div className="flex gap-3">
        <img
          src={product.image}
          alt=""
          width={64}
          height={64}
          loading="lazy"
          decoding="async"
          className="size-16 shrink-0 rounded-lg border border-border object-cover"
        />
        <div className="min-w-0 pr-6">
          {product.category && (
            <p className="text-[0.65rem] uppercase tracking-[0.14em] text-muted-foreground">
              {product.category}
            </p>
          )}
          <p className="mt-0.5 font-display text-sm font-semibold leading-snug">
            {product.productName}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {product.description}
          </p>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 border-t border-border pt-3">
        <div className="min-w-0">
          <p className="whitespace-nowrap text-sm font-medium">{product.price}</p>
          <p className="text-xs text-muted-foreground">{product.availability}</p>
        </div>
        <a
          href={product.href}
          className="inline-flex min-h-9 shrink-0 items-center whitespace-nowrap rounded-full bg-primary px-4 text-xs font-medium text-primary-foreground transition-opacity duration-200 hover:opacity-90"
        >
          View Product →
        </a>
      </div>
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

  return (
    <article
      className={cn(
        "group relative shrink-0 snap-center transition-opacity duration-500",
        "w-[86vw] sm:w-[70vw] lg:w-[54rem]",
        !active && "lg:opacity-70 lg:hover:opacity-100",
      )}
    >
      <div className="relative overflow-hidden rounded-[1.75rem] bg-secondary">
        <img
          src={hamper.image}
          alt={hamper.imageAlt}
          width={1600}
          height={1200}
          loading="lazy"
          decoding="async"
          sizes="(min-width: 1024px) 54rem, 86vw"
          className="aspect-4/3 h-auto w-full object-cover transition-transform duration-700 ease-out"
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

        {/* Desktop: card floats beside the active hotspot */}
        {current && (
          <div className="pointer-events-none absolute inset-0 z-30 hidden md:block" aria-live="polite">
            <ProductDetailCard
              product={current}
              variant="floating"
              className="absolute"
              style={{
                left: `${Math.min(Math.max(current.position.x, 14), 86)}%`,
                top: `${current.position.y}%`,
                transform: `translate(${current.position.x > 50 ? "-100%" : "0"}, ${
                  current.position.y > 55 ? "-100%" : "0"
                }) translate(${current.position.x > 50 ? "-18px" : "18px"}, ${
                  current.position.y > 55 ? "-18px" : "18px"
                })`,
              }}
            />
          </div>
        )}
      </div>

      <div className="mt-5 flex items-start justify-between gap-6">
        <div className="min-w-0">
          <h3 className="font-display text-base font-semibold tracking-tight">
            {hamper.title}
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground sm:text-sm">
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

  const pinnedProduct =
    (pinned &&
      giftHampers
        .find((h) => h.id === pinned.hamperId)
        ?.products.find((p) => p.productId === pinned.productId)) ||
    null;

  return (
    <div ref={sectionRef} className="mt-12 sm:mt-16">
      <div className="mb-6 hidden items-center justify-end gap-3 lg:flex">
        <button
          type="button"
          onClick={() => scrollBy(-1)}
          aria-label="Previous hamper"
          className="grid size-11 place-items-center rounded-full border border-border transition-colors duration-200 hover:bg-secondary"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => scrollBy(1)}
          aria-label="Next hamper"
          className="grid size-11 place-items-center rounded-full border border-border transition-colors duration-200 hover:bg-secondary"
        >
          <ChevronRight className="size-4" aria-hidden="true" />
        </button>
      </div>

      <div
        ref={scrollerRef}
        onScroll={onScroll}
        className="-mx-5 flex snap-x snap-mandatory gap-6 overflow-x-auto px-5 pb-4 sm:-mx-8 sm:gap-8 sm:px-8 lg:-mx-12 lg:px-12 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {giftHampers.map((hamper, i) => (
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

      <div className="mt-6 flex items-center justify-center gap-2">
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

      <p className="mt-5 text-center text-xs text-muted-foreground">
        Hover or tap a marker to explore the products.
      </p>

      {/* Mobile: bottom sheet for the pinned product */}
      {pinnedProduct && (
        <div className="fixed inset-x-0 bottom-0 z-40 px-4 pb-4 md:hidden" aria-live="polite">
          <div className="relative">
            <ProductDetailCard
              product={pinnedProduct}
              variant="sheet"
              onClose={() => setPinned(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function SectionCTA() {
  return (
    <div className="mx-auto mt-14 max-w-xl border-t border-border pt-10 text-center sm:mt-16">
      <h3 className="font-display text-lg font-semibold tracking-tight">
        Explore Corporate Gifting
      </h3>
      <p className="mt-3 text-xs leading-relaxed text-muted-foreground sm:text-sm">
        Discover curated gifts and custom gifting solutions for your team, clients and
        business partners.
      </p>
      <a
        href="#corporate-gifting"
        className="mt-6 inline-flex min-h-11 items-center justify-center rounded-full border border-foreground/20 px-6 text-xs font-medium transition-colors duration-200 hover:border-foreground/40 hover:bg-secondary sm:text-sm"
      >
        Explore Corporate Gifting →
      </a>
    </div>
  );
}

export function InteractiveGiftShowcase() {
  return (
    <section
      id="corporate-gifting"
      aria-labelledby="corporate-gifting-heading"
      className="w-full overflow-hidden bg-background py-14 sm:py-16 lg:py-20"
    >
      <div className="mx-auto w-full max-w-[1600px] px-5 sm:px-8 lg:px-12">
        <div id="corporate-gifting-heading">
          <SectionHeader />
        </div>
        <HamperCarousel />
        <SectionCTA />
      </div>
    </section>
  );
}
