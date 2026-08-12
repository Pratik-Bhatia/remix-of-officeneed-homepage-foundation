import { useEffect, useRef, useState } from "react";
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
    <section aria-labelledby="hero-heading" className="relative h-[80vh] w-full overflow-hidden bg-background">
      <div className="h-full overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="mx-auto flex h-full min-h-0 w-full max-w-[1440px] flex-col px-5 sm:px-8 lg:px-12">
          {/* Text */}
          <div className="shrink-0 pt-10 text-center sm:pt-14">
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
            className="mt-6 flex min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {SLIDES.map((i) => (
              <div key={i} className="flex h-full w-full shrink-0 snap-center items-center justify-center">
                <img
                  src={heroImage}
                  alt="OfficeNeed branded gift boxes and shopping bags in ivory white with black rope handles."
                  width={1200}
                  height={800}
                  fetchPriority={i === 0 ? "high" : "low"}
                  loading={i === 0 ? "eager" : "lazy"}
                  decoding="async"
                  sizes="(min-width: 1024px) 70vw, 92vw"
                  className="h-full w-auto max-w-full object-contain"
                />
              </div>
            ))}
          </div>

          <div className="mt-4 shrink-0 flex items-center justify-center gap-2.5">
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
      </div>
    </section>
  );
}
