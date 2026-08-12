import { useEffect, useRef, useState } from "react";
import { ScanLine, LayoutGrid } from "lucide-react";
import heroImage from "@/assets/hero-officeneed.jpg";

const SLIDES = [0, 1, 2];

export function Hero() {
  const [active, setActive] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const onScroll = () => {
      const i = Math.round(el.scrollLeft / el.clientWidth);
      setActive(Math.max(0, Math.min(SLIDES.length - 1, i)));
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  const goTo = (i: number) => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
    setActive(i);
  };

  return (
    <section aria-labelledby="hero-heading" className="w-full overflow-hidden bg-background">
      <div className="mx-auto w-full max-w-[1440px] px-5 pt-10 sm:px-8 sm:pt-14 lg:px-12">
        <div className="animate-rise mx-auto max-w-3xl text-center">
          <p className="text-sm text-muted-foreground sm:text-base">Corporate Procurement Partner</p>

          <h1 id="hero-heading" className="text-display mt-4 text-balance">
            One Vendor.
            <br />
            Multiple Solutions.
          </h1>

          <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
            <a
              href="#solutions"
              className="inline-flex min-h-12 w-full items-center justify-center rounded-full bg-primary px-8 text-base font-medium text-primary-foreground transition-[transform,opacity] duration-200 hover:opacity-90 active:scale-[0.99] sm:w-auto"
            >
              Explore Solutions
            </a>
            <a
              href="#products"
              className="inline-flex min-h-12 w-full items-center justify-center rounded-full border border-foreground/25 px-8 text-base font-medium text-foreground transition-colors duration-200 hover:border-foreground/50 hover:bg-secondary sm:w-auto"
            >
              Shop Products
            </a>
          </div>
        </div>

        {/* Visual carousel */}
        <div
          ref={trackRef}
          className="mt-8 flex snap-x snap-mandatory overflow-x-auto scroll-smooth sm:mt-10 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {SLIDES.map((i) => (
            <div key={i} className="w-full shrink-0 snap-center">
              <img
                src={heroImage}
                alt="OfficeNeed branded gift boxes and shopping bags in ivory white with black rope handles."
                width={1200}
                height={800}
                fetchPriority={i === 0 ? "high" : "low"}
                loading={i === 0 ? "eager" : "lazy"}
                decoding="async"
                sizes="(min-width: 1024px) 70vw, 92vw"
                className="mx-auto h-auto w-full max-w-3xl object-contain"
              />
            </div>
          ))}
        </div>

        <div className="mt-4 flex items-center justify-center gap-2.5">
          {SLIDES.map((i) => (
            <button
              key={i}
              type="button"
              onClick={() => goTo(i)}
              aria-label={`Go to slide ${i + 1}`}
              aria-current={active === i}
              className={`h-2.5 w-2.5 rounded-full transition-colors duration-200 ${
                active === i ? "bg-foreground" : "bg-border"
              }`}
            />
          ))}
        </div>
      </div>

      {/* Action bar */}
      <div className="mt-8 w-full bg-secondary/60">
        <div className="mx-auto grid w-full max-w-[1440px] gap-3 px-5 py-4 sm:grid-cols-2 sm:px-8 lg:px-12">
          <a
            href="#custom-requirement"
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md border border-foreground/25 bg-background px-6 text-sm font-medium text-foreground transition-colors duration-200 hover:bg-secondary sm:text-base"
          >
            <ScanLine className="h-5 w-5 shrink-0" aria-hidden="true" />
            Send custom Requirement
          </a>
          <a
            href="#ai-recommendation"
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-opacity duration-200 hover:opacity-90 sm:text-base"
          >
            <LayoutGrid className="h-5 w-5 shrink-0" aria-hidden="true" />
            AI Recommendation
          </a>
        </div>
      </div>
    </section>
  );
}
