import { useEffect, useRef, useState } from "react";
import { TAXONOMY } from "@/lib/taxonomy";

// `url` is the full-size original; `small` is an 800px-wide variant of the same
// image so phones don't download a 1350-1536px asset for a ~390px-wide slot.
const heroPerfumes = { url: "/hero/hero-perfumes.webp", small: "/hero/hero-perfumes-800.webp", width: 1350 };
const heroExclusive = { url: "/hero/officeneed-exclusive-set-v2.webp", small: "/hero/officeneed-exclusive-set-v2-800.webp", width: 1536 };
const heroGifting = { url: "/hero/corporate-gifting.webp", small: "/hero/corporate-gifting-800.webp", width: 1536 };
const heroAI = { url: "/hero/ai-assistant.webp", small: "/hero/ai-assistant-800.webp", width: 1400 };


// Collection hrefs below are derived from TAXONOMY (the same single source
// of truth src/lib/navigation.ts's footerShopTargets/navCategoryTarget
// already use) instead of hardcoded handle strings -- two of those strings
// ("fragrance-gifting", "exclusive-products") had drifted out of sync with
// the real Shopify collection handles ("perfumes", "officeneed-exclusive"),
// which made products.index.tsx correctly-but-misleadingly treat those
// pages as genuinely empty categories and show the Coming Soon banner.
export const slides = [
  {
    id: "scents",
    heading: "Signature Scents",
    text: "Elevate your professional presence with our premium fragrance collection.",
    primary: { label: "Discover Collection", href: `/products/?collection=${TAXONOMY["Fragrance Gifting"].handle}` },
    secondary: { label: "Shop Perfumes", href: `/products/?collection=${TAXONOMY["Fragrance Gifting"].subcategories["European Perfume"]!.handle}` },
    image: heroPerfumes.url,
    imageSrcSet: `${heroPerfumes.small} 800w, ${heroPerfumes.url} ${heroPerfumes.width}w`,
    alt: "Luxury designer perfume bottles and gift boxes arranged with flowers and botanicals.",
  },
  {
    id: "exclusive",
    heading: "Officeneed Exclusive",
    text: "Precision-crafted essentials designed for the modern workspace.",
    primary: { label: "Explore Exclusives", href: `/products/?collection=${TAXONOMY["Officeneed Exclusive"].handle}` },
    secondary: { label: "Shop Now", href: "/products/" },
    image: heroExclusive.url,
    imageSrcSet: `${heroExclusive.small} 800w, ${heroExclusive.url} ${heroExclusive.width}w`,
    alt: "Officeneed exclusive desk essentials, gift boxes and premium stationery set.",
  },
  {
    id: "gifting",
    heading: "Corporate Gifting",
    text: "Build lasting business relationships with curated, premium gift sets.",
    primary: { label: "View Gift Catalogue", href: `/products/?collection=${TAXONOMY["Corporate Gifting"].handle}` },
    secondary: { label: "Shop Gift Sets", href: `/products/?collection=${TAXONOMY["Corporate Gifting"].subcategories["Gift Sets"]!.handle}` },
    image: heroGifting.url,
    imageSrcSet: `${heroGifting.small} 800w, ${heroGifting.url} ${heroGifting.width}w`,
    alt: "Curated Officeneed corporate gift hamper with laptop bag, notebook, flask, mug, pen, candle, plant and thank you card.",
  },
  {
    id: "assistant",
    heading: "AI Shopping Assistant",
    text: "Find the exact workspace essentials you need with personalized, AI-driven recommendations.",
    primary: { label: "Try the Assistant", href: "#open-chat" },
    secondary: { label: "Browse All Products", href: "/products/" },
    image: heroAI.url,
    imageSrcSet: `${heroAI.small} 800w, ${heroAI.url} ${heroAI.width}w`,
    alt: "Sleek smartphone on a textured black pedestal surrounded by desk essentials, white flowers, and orange peel on a dark luxury background.",
  },
];

export function Hero() {
  const [active, setActive] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [dx, setDx] = useState(0);
  const startX = useRef(0);
  const startY = useRef(0);
  const locked = useRef<"h" | "v" | null>(null);

  useEffect(() => {
    if (dragging) return;
    const id = setInterval(() => setActive((i) => (i + 1) % slides.length), 6000);
    return () => clearInterval(id);
  }, [dragging]);

  const go = (dir: number) =>
    setActive((i) => (i + dir + slides.length) % slides.length);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    startX.current = e.clientX;
    startY.current = e.clientY;
    locked.current = null;
    setDragging(true);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging) return;
    const deltaX = e.clientX - startX.current;
    const deltaY = e.clientY - startY.current;
    if (!locked.current) {
      if (Math.abs(deltaX) < 8 && Math.abs(deltaY) < 8) return;
      locked.current = Math.abs(deltaX) > Math.abs(deltaY) ? "h" : "v";
    }
    if (locked.current !== "h") return;
    setDx(deltaX);
  };

  const endDrag = () => {
    if (!dragging) return;
    if (locked.current === "h" && Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
    setDx(0);
    locked.current = null;
    setDragging(false);
  };

  return (
    <section
      aria-labelledby="hero-heading"
      className="relative w-full overflow-x-clip bg-background"
    >
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerLeave={endDrag}
        style={{ touchAction: "pan-y" }}
        className="relative mx-auto flex min-h-[min(78svh,520px)] w-full max-w-[1400px] flex-col items-center justify-center px-5 pb-8 pt-8 text-center select-none sm:min-h-[600px] sm:px-8 lg:h-[80vh] lg:min-h-[620px] lg:px-12 lg:pt-10"
      >
        {slides.map((s, i) => {
          const isActive = i === active;
          return (
            <div
              key={s.id}
              aria-hidden={!isActive}
              className="absolute inset-0 flex flex-col items-center justify-center px-5 pb-8 pt-8 text-center transition-opacity duration-700 ease-out sm:px-8 lg:px-12 lg:pt-10"
              style={{
                opacity: isActive ? 1 : 0,
                pointerEvents: isActive ? "auto" : "none",
                transform: isActive && dx ? `translateX(${dx * 0.25}px)` : undefined,
                transition: dragging ? "opacity 700ms ease-out" : "opacity 700ms ease-out, transform 300ms ease-out",
              }}
            >
              <h1 id={isActive ? "hero-heading" : undefined} className="text-display">
                {s.heading}
              </h1>

              <p className="text-lede mt-4 max-w-[46ch] sm:mt-5">{s.text}</p>

              <div className="mt-6 flex w-full max-w-[360px] flex-col items-center gap-3 sm:mt-8 sm:max-w-none sm:flex-row sm:justify-center sm:gap-4">
                {s.primary.href === "#open-chat" ? (
                  <button
                    type="button"
                    onClick={() => window.dispatchEvent(new CustomEvent("officeneed:open-chat"))}
                    className="btn-primary w-full rounded-full sm:w-auto"
                  >
                    {s.primary.label}
                  </button>
                ) : (
                  <a href={s.primary.href} className="btn-primary w-full rounded-full sm:w-auto">
                    {s.primary.label}
                  </a>
                )}
                <a href={s.secondary.href} className="btn-secondary w-full rounded-full sm:w-auto">
                  {s.secondary.label}
                </a>
              </div>

              <img
                src={s.image}
                srcSet={s.imageSrcSet}
                alt={s.alt}
                width={1366}
                height={768}
                // Only the first slide is visible on load: it alone is eager + high priority (it is the LCP
                // element). The others sit at opacity 0, so they load lazily at low priority instead of
                // competing with the CSS/JS and the visible image for bandwidth.
                loading={i === 0 ? "eager" : "lazy"}
                fetchPriority={i === 0 ? "high" : "low"}
                draggable={false}
                decoding="async"
                sizes="(min-width: 1024px) 90vw, 100vw"
                className="mt-6 min-h-0 w-full max-w-[1100px] flex-1 basis-auto object-contain sm:mt-8 lg:mt-10"
              />
            </div>
          );
        })}

        <div className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center justify-center gap-2">
          {slides.map((s, i) => (
            <button
              key={s.id}
              type="button"
              aria-label={`Show ${s.heading}`}
              aria-current={i === active}
              onClick={() => setActive(i)}
              className={`h-2 rounded-full transition-all ${
                i === active ? "w-6 bg-foreground" : "w-2 bg-foreground/25"
              }`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
