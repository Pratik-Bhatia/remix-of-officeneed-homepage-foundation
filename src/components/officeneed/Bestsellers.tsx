import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { bestsellerFilters, bestsellerProducts, type BestsellerCategory } from "@/lib/bestsellers";
import { useShopifyBestsellers } from "@/lib/shopify-overlay";
import { ProductCard } from "@/components/officeneed/ProductCard";
import type { Product } from "@/lib/products";

// Product.category has 2 values ("Printing & Branding", "Officeneed
// Exclusive") the bestsellers filter row has no dedicated pill for -- bucket
// those under "Corporate Gifting", same as before this migrated onto the
// canonical Product type. This is presentation-only (which filter pill a
// product answers to), so it lives here rather than in the data layer.
function toFilterCategory(category: Product["category"]): BestsellerCategory {
  if (category === "Office Stationery" || category === "Computer Peripherals" || category === "Fragrance Gifting") {
    return category;
  }
  return "Corporate Gifting";
}

export function Bestsellers() {
  const [active, setActive] = useState<(typeof bestsellerFilters)[number]>("All");
  const trackRef = useRef<HTMLDivElement>(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(true);

  const catalogue = useShopifyBestsellers(bestsellerProducts);

  const products = useMemo(
    () => (active === "All" ? catalogue : catalogue.filter((p) => toFilterCategory(p.category) === active)).slice(0, 12),
    [active, catalogue],
  );

  const sync = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    setCanPrev(el.scrollLeft > 8);
    setCanNext(el.scrollLeft + el.clientWidth < el.scrollWidth - 8);
  }, []);

  useEffect(() => {
    trackRef.current?.scrollTo({ left: 0, behavior: "smooth" });
    const id = window.setTimeout(sync, 400);
    return () => window.clearTimeout(id);
  }, [active, sync]);

  useEffect(() => {
    sync();
    window.addEventListener("resize", sync);
    return () => window.removeEventListener("resize", sync);
  }, [sync]);

  const scrollBy = (dir: -1 | 1) => {
    const el = trackRef.current;
    if (!el) return;
    const card = el.querySelector("a");
    const step = card ? card.clientWidth + 24 : el.clientWidth * 0.8;
    el.scrollBy({ left: dir * step * (el.clientWidth > 1024 ? 2 : 1), behavior: "smooth" });
  };

  return (
    <section
      id="bestsellers"
      aria-labelledby="bestsellers-heading"
      // #F5F5F7, not the secondary/muted token: verified it resolves to
      // #F2F2F2 (a few units darker, no hue), not the requested value --
      // using the literal hex also keeps this in sync with the identical
      // #F5F5F7 catalogue background already used on the /products page.
      className="w-full bg-[#F5F5F7] py-14 sm:py-16 lg:py-20"
    >
      <div className="mx-auto w-full max-w-[1600px]">
        <div className="pl-[30px] pr-5 sm:pl-[42px] sm:pr-8 lg:pl-[58px] lg:pr-12">
          <div className="flex items-end justify-between">
            <h2 id="bestsellers-heading" className="text-section">
              Bestsellers
            </h2>
            <a href="/products/?sort=Featured" className="text-sm font-medium hover:underline text-foreground pr-2">
              View All &rarr;
            </a>
          </div>


          <div className="mt-6 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 sm:mt-8">
            <div className="-mx-1 flex min-w-0 gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {bestsellerFilters.map((f) => (
                <button
                  key={f}
                  type="button"
                  aria-pressed={active === f}
                  onClick={() => setActive(f)}
                  className={cn(
                    "shrink-0 rounded-full px-4 py-2 text-sm transition-colors duration-300",
                    active === f
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-secondary-foreground hover:bg-muted",
                  )}
                >
                  {f}
                </button>
              ))}
            </div>

            <div className="hidden shrink-0 gap-2 sm:flex">
              <button
                type="button"
                aria-label="Previous products"
                onClick={() => scrollBy(-1)}
                disabled={!canPrev}
                className="grid h-10 w-10 place-items-center rounded-full border border-border bg-background transition-all duration-300 hover:scale-105 hover:bg-secondary disabled:opacity-35 disabled:hover:scale-100"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label="Next products"
                onClick={() => scrollBy(1)}
                disabled={!canNext}
                className="grid h-10 w-10 place-items-center rounded-full border border-foreground/40 bg-background transition-all duration-300 hover:scale-105 hover:bg-secondary disabled:opacity-35 disabled:hover:scale-100"
              >
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        <div className="pl-[30px] pr-5 sm:pl-[42px] sm:pr-8 lg:pl-[58px] lg:pr-12">
          <div
            ref={trackRef}
            onScroll={sync}
            className="mt-8 flex snap-x snap-mandatory gap-6 overflow-x-auto scroll-smooth pb-2 [scrollbar-width:none] sm:mt-10 [&::-webkit-scrollbar]:hidden"
          >
            {products.map((p) => (
              <ProductCard
                key={p.slug}
                product={p}
                showEyebrow
                className="w-[74vw] shrink-0 snap-start sm:w-[46vw] md:w-[34vw] lg:w-[calc((100%-4.5rem)/4)]"
              />
            ))}
            <div aria-hidden className="w-1 shrink-0 sm:w-2" />
          </div>
        </div>
      </div>
    </section>
  );
}
