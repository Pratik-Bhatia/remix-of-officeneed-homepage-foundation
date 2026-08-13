import { useEffect, useRef, useState } from "react";

const heroPerfumes = { url: "/hero/hero-perfumes.webp" };
const heroExclusive = { url: "/hero/officeneed-exclusive-set-v2.webp" };
const heroGifting = { url: "/hero/corporate-gifting.webp" };
const heroAI = { url: "/hero/ai-assistant.webp" };


const slides = [
  {
    id: "scents",
    heading: "Signature Scents",
    text: "Elevate your professional presence with our premium fragrance collection.",
    primary: { label: "Discover Collection", href: "#solutions" },
    secondary: { label: "Shop Perfumes", href: "#bestsellers" },
    image: heroPerfumes.url,
    alt: "Luxury designer perfume bottles and gift boxes arranged with flowers and botanicals.",
  },
  {
    id: "exclusive",
    heading: "Officeneed Exclusive",
    text: "Precision-crafted essentials designed for the modern workspace.",
    primary: { label: "Explore Features", href: "#solutions" },
    secondary: { label: "Shop Exclusives", href: "#bestsellers" },
    image: heroExclusive.url,
    alt: "Officeneed exclusive desk essentials, gift boxes and premium stationery set.",
  },
  {
    id: "gifting",
    heading: "Corporate Gifting",
    text: "Build lasting business relationships with curated, premium gift sets.",
    primary: { label: "View Catalogue", href: "#solutions" },
    secondary: { label: "Plan Your Gifts", href: "#bestsellers" },
    image: heroGifting.url,
    alt: "Curated Officeneed corporate gift hamper with laptop bag, notebook, flask, mug, pen, candle, plant and thank you card.",
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
                <a href={s.primary.href} className="btn-primary w-full rounded-full sm:w-auto">
                  {s.primary.label}
                </a>
                <a href={s.secondary.href} className="btn-secondary w-full rounded-full sm:w-auto">
                  {s.secondary.label}
                </a>
              </div>

              <img
                src={s.image}
                alt={s.alt}
                width={1366}
                height={768}
                fetchPriority="high"
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
