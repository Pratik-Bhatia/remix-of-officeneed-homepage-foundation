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
    <section
      aria-labelledby="hero-heading"
      className="relative w-full overflow-x-clip bg-background"
    >
      <div className="mx-auto grid w-full max-w-[1600px] grid-cols-1 items-center gap-8 px-5 pb-12 pt-10 sm:px-8 lg:min-h-[calc(100svh-80px)] lg:grid-cols-[minmax(0,0.86fr)_minmax(0,1.14fr)] lg:gap-12 lg:px-12 lg:py-10 xl:gap-16">
        {/* Copy */}
        <div className="mx-auto w-full max-w-[700px] text-center lg:mx-0 lg:max-w-[640px] lg:pr-4 lg:text-left">
          <p className="text-eyebrow text-muted-foreground">CORPORATE PROCUREMENT, SIMPLIFIED</p>

          <h1
            id="hero-heading"
            className="text-display mx-auto mt-5 w-full max-w-full lg:mx-0"
          >
            One Partner.
            <br />
            Every Business Need.
          </h1>

          <p className="text-lede mx-auto mt-6 w-full max-w-[520px] md:max-w-[640px] lg:mx-0 lg:max-w-[540px]">
            From corporate gifting and office essentials to IT, printing and luxury solutions —
            everything your business needs, sourced and delivered through one trusted partner.
          </p>

          <div className="mx-auto mt-9 flex w-full max-w-[360px] flex-col items-center gap-3 sm:max-w-none sm:flex-row sm:justify-center sm:gap-4 lg:mx-0 lg:justify-start">
            <a href="#solutions" className="btn-primary w-full sm:w-auto">
              Explore Solutions
            </a>
            <a href="#bestsellers" className="btn-secondary w-full sm:w-auto">
              Shop Products
            </a>
          </div>
        </div>

        {/* Visual */}
        <div className="relative mx-auto w-full max-w-[420px] md:max-w-[85%] lg:max-w-none">
          <div
            ref={trackRef}
            className="flex snap-x snap-mandatory overflow-x-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {SLIDES.map((i) => (
              <div key={i} className="w-full shrink-0 snap-center">
                <img
                  src={heroImage}
                  alt="OfficeNeed corporate gifting composition: ivory gift boxes and branded shopping bags."
                  width={1600}
                  height={1100}
                  fetchPriority={i === 0 ? "high" : "low"}
                  loading={i === 0 ? "eager" : "lazy"}
                  decoding="async"
                  sizes="(min-width: 1024px) 58vw, 100vw"
                  className="mx-auto h-auto max-h-[46vh] w-full object-contain sm:max-h-[54vh] lg:h-[min(74vh,720px)] lg:max-h-none"
                />
              </div>
            ))}
          </div>

          <div className="mt-5 flex items-center justify-center gap-2 lg:justify-start lg:pl-2">
            {SLIDES.map((i) => (
              <button
                key={i}
                type="button"
                onClick={() => goTo(i)}
                aria-label={`Go to slide ${i + 1}`}
                aria-current={active === i}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  active === i ? "w-6 bg-foreground" : "w-1.5 bg-foreground/25"
                }`}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
