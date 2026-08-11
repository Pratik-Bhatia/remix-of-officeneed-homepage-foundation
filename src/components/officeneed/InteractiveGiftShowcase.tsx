import { useEffect, useRef, useState } from "react";
import hamperImage from "@/assets/gift-hamper-showcase.jpg";
import { giftShowcaseProducts, type GiftShowcaseProduct } from "@/lib/gift-showcase";
import { cn } from "@/lib/utils";

function SectionHeader() {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <p className="text-eyebrow text-muted-foreground">Corporate Gifting</p>
      <h2 className="mt-4 font-display text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
        Designed to Gift.
        <br />
        Built to Impress.
      </h2>
      <p className="mt-4 text-pretty text-base leading-relaxed text-muted-foreground">
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
      className="absolute z-20 grid size-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full"
    >
      <span
        className={cn(
          "hotspot-dot relative grid size-4 place-items-center rounded-full border border-foreground/25 bg-background/90 transition-all duration-300",
          active && "size-5 border-foreground bg-foreground",
          dimmed && "opacity-40",
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
}: {
  product: GiftShowcaseProduct;
  variant: "floating" | "sheet";
  className?: string;
  style?: React.CSSProperties;
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
        <div className="min-w-0">
          <p className="font-display text-sm font-semibold leading-snug">
            {product.productName}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {product.description}
          </p>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
        <div>
          <p className="text-sm font-medium">{product.price}</p>
          <p className="text-xs text-muted-foreground">{product.availability}</p>
        </div>
        <a
          href={product.href}
          className="inline-flex min-h-9 items-center rounded-full bg-primary px-4 text-xs font-medium text-primary-foreground transition-opacity duration-200 hover:opacity-90"
        >
          View Product →
        </a>
      </div>
    </div>
  );
}

function GiftComposition() {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const currentId = pinnedId ?? activeId;
  const current = giftShowcaseProducts.find((p) => p.productId === currentId) ?? null;

  useEffect(() => {
    if (!pinnedId) return;
    const onDown = (e: PointerEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setPinnedId(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPinnedId(null);
    };
    document.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [pinnedId]);

  return (
    <div ref={containerRef} className="relative mt-12 sm:mt-16">
      <div className="relative mx-auto w-full max-w-4xl">
        <img
          src={hamperImage}
          alt="Premium OfficeNeed corporate gift hamper: an opened ivory gift box with black ribbon, surrounded by an executive notebook, metal pen, leather card holder, insulated bottle, fragrance bottle and a wireless mouse."
          width={1600}
          height={1104}
          loading="lazy"
          decoding="async"
          sizes="(min-width: 1024px) 900px, 100vw"
          className="h-auto w-full rounded-2xl object-contain"
        />

        {giftShowcaseProducts.map((product) => (
          <ProductHotspot
            key={product.productId}
            product={product}
            active={currentId === product.productId}
            dimmed={currentId !== null && currentId !== product.productId}
            onActivate={() => setActiveId(product.productId)}
            onDeactivate={() => setActiveId(null)}
            onToggle={() =>
              setPinnedId((id) => (id === product.productId ? null : product.productId))
            }
          />
        ))}

        {/* Desktop / tablet: card floats beside the active hotspot */}
        {current && (
          <div
            className="pointer-events-none absolute inset-0 z-30 hidden md:block"
            aria-live="polite"
          >
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

      {/* Mobile: compact bottom sheet */}
      {current && (
        <div
          className="fixed inset-x-0 bottom-0 z-40 px-4 pb-4 md:hidden"
          aria-live="polite"
        >
          <ProductDetailCard product={current} variant="sheet" />
        </div>
      )}

      <p className="mt-6 text-center text-xs text-muted-foreground md:mt-8">
        Tap or hover a marker to explore the products inside the hamper.
      </p>
    </div>
  );
}

function SectionCTA() {
  return (
    <div className="mx-auto mt-14 max-w-xl border-t border-border pt-10 text-center sm:mt-16">
      <h3 className="font-display text-xl font-semibold tracking-tight">
        Explore Corporate Gifting
      </h3>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        Discover curated gifts and custom gifting solutions for your team, clients and
        business partners.
      </p>
      <a
        href="#corporate-gifting"
        className="mt-6 inline-flex min-h-12 items-center justify-center rounded-full border border-foreground/20 px-7 text-sm font-medium transition-colors duration-200 hover:border-foreground/40 hover:bg-secondary"
      >
        Explore Gifting →
      </a>
    </div>
  );
}

export function InteractiveGiftShowcase() {
  return (
    <section
      id="corporate-gifting"
      aria-labelledby="corporate-gifting-heading"
      className="w-full overflow-hidden bg-background py-16 sm:py-20 lg:py-28"
    >
      <div className="mx-auto w-full max-w-[1440px] px-5 sm:px-8 lg:px-12">
        <div id="corporate-gifting-heading">
          <SectionHeader />
        </div>
        <GiftComposition />
        <SectionCTA />
      </div>
    </section>
  );
}
