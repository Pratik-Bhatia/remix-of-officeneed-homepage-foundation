import { useEffect, useRef, useState } from "react";
import { TAXONOMY } from "@/lib/taxonomy";
// Imported (not served from /public) so the build gives them hashed /assets/
// URLs, which the host serves with long-lived immutable caching.
import heroPerfumesUrl from "@/assets/hero/hero-perfumes.webp";
import heroPerfumesSmall from "@/assets/hero/hero-perfumes-800.webp";
import heroExclusiveUrl from "@/assets/hero/officeneed-exclusive-set-v2.webp";
import heroExclusiveSmall from "@/assets/hero/officeneed-exclusive-set-v2-800.webp";
import heroGiftingUrl from "@/assets/hero/corporate-gifting.webp";
import heroGiftingSmall from "@/assets/hero/corporate-gifting-800.webp";
import heroAIUrl from "@/assets/hero/ai-assistant.webp";
import heroAISmall from "@/assets/hero/ai-assistant-800.webp";

// `url` is the full-size original; `small` is an 800px-wide variant of the same
// image so phones don't download a 1350-1536px asset for a ~390px-wide slot.
const heroPerfumes = { url: heroPerfumesUrl, small: heroPerfumesSmall, width: 1350 };
const heroExclusive = { url: heroExclusiveUrl, small: heroExclusiveSmall, width: 1536 };
const heroGifting = { url: heroGiftingUrl, small: heroGiftingSmall, width: 1536 };
const heroAI = { url: heroAIUrl, small: heroAISmall, width: 1400 };


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

const ROTATE_MS = 6000;
const PRELOAD_LEAD_MS = 3000;
const MANUAL_WAIT_MS = 2500;

export function Hero() {
  const [active, setActive] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [dx, setDx] = useState(0);
  const startX = useRef(0);
  const startY = useRef(0);
  const locked = useRef<"h" | "v" | null>(null);
  // The hidden slides (2-4) are stacked over slide 1 at opacity 0, so the
  // browser treats them as in-viewport and `loading="lazy"` doesn't defer
  // them. Each gets its image source only shortly before it is needed: the
  // next slide ~PRELOAD_LEAD_MS before its rotation (never before the page has
  // loaded), or all of them as soon as the shopper starts interacting with the
  // hero. A slide is only switched to once its image has loaded, so it never
  // appears without one; the 6s rotation timer itself is unchanged.
  const [requested, setRequested] = useState<boolean[]>(() => slides.map((_, i) => i === 0));
  const loadedRef = useRef<boolean[]>(slides.map((_, i) => i === 0));
  const activeRef = useRef(0);
  activeRef.current = active;
  const pendingRef = useRef<number | null>(null);
  const pendingTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const rotationStart = useRef(0);
  const [pageLoaded, setPageLoaded] = useState(false);

  useEffect(() => {
    if (document.readyState === "complete") {
      setPageLoaded(true);
      return;
    }
    const onLoad = () => setPageLoaded(true);
    window.addEventListener("load", onLoad, { once: true });
    return () => window.removeEventListener("load", onLoad);
  }, []);

  const requestSlide = (i: number) =>
    setRequested((r) => (r[i] ? r : r.map((v, k) => v || k === i)));
  const requestAllSlides = () => setRequested((r) => (r.every(Boolean) ? r : r.map(() => true)));

  // Shows slide `i` now if its image is ready; otherwise starts loading it and
  // switches once it has loaded. A shopper's own click/swipe falls back to
  // switching after MANUAL_WAIT_MS so it never feels unresponsive.
  const showSlide = (i: number, manual: boolean) => {
    clearTimeout(pendingTimer.current);
    if (loadedRef.current[i]) {
      pendingRef.current = null;
      setActive(i);
      return;
    }
    pendingRef.current = i;
    requestSlide(i);
    if (manual) {
      pendingTimer.current = setTimeout(() => {
        if (pendingRef.current === i) {
          pendingRef.current = null;
          setActive(i);
        }
      }, MANUAL_WAIT_MS);
    }
  };

  const onSlideImageReady = (i: number) => {
    loadedRef.current[i] = true;
    if (pendingRef.current === i) {
      pendingRef.current = null;
      clearTimeout(pendingTimer.current);
      setActive(i);
    }
  };
  useEffect(() => () => clearTimeout(pendingTimer.current), []);

  useEffect(() => {
    if (dragging) return;
    rotationStart.current = Date.now();
    const id = setInterval(() => showSlide((activeRef.current + 1) % slides.length, false), ROTATE_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging]);

  // Request the next slide's image PRELOAD_LEAD_MS before its rotation is due.
  useEffect(() => {
    if (!pageLoaded) return;
    const next = (active + 1) % slides.length;
    if (requested[next]) return;
    const elapsed = (Date.now() - rotationStart.current) % ROTATE_MS;
    const timer = setTimeout(() => requestSlide(next), Math.max(0, ROTATE_MS - elapsed - PRELOAD_LEAD_MS));
    return () => clearTimeout(timer);
  }, [pageLoaded, active, requested]);

  const go = (dir: number) => showSlide((activeRef.current + dir + slides.length) % slides.length, true);

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
      // A mouse/pen over the hero or keyboard focus inside it suggests the
      // shopper may switch slides: load the remaining slide images now. (Not
      // touch -- a phone scroll often starts on the hero; a swipe still loads
      // its target slide and switches as soon as it is ready.)
      onPointerEnter={(e) => e.pointerType !== "touch" && requestAllSlides()}
      onPointerDown={(e) => e.pointerType !== "touch" && requestAllSlides()}
      onFocusCapture={requestAllSlides}
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
                // Slide 1 (the LCP image) always has its source; the others only
                // once requested (see above).
                {...(i === 0 || isActive || requested[i] ? { src: s.image, srcSet: s.imageSrcSet } : {})}
                // An image already loaded (e.g. from cache) before hydration
                // never fires onLoad -- read its state when the element mounts.
                ref={(img) => {
                  if (img?.complete && img.currentSrc) onSlideImageReady(i);
                }}
                onLoad={() => onSlideImageReady(i)}
                // A failed image must not hold the carousel on its current slide.
                onError={() => onSlideImageReady(i)}
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
              onClick={() => showSlide(i, true)}
              // Only the colour animates: a width transition runs on the main
              // thread (non-composited) on every auto-rotation.
              className={`h-2 rounded-full transition-colors ${
                i === active ? "w-6 bg-foreground" : "w-2 bg-foreground/25"
              }`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
