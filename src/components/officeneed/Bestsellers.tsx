import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  bestsellerFilters,
  bestsellerProducts,
  type BestsellerProduct,
} from "@/lib/bestsellers";

function ProductCard({ product }: { product: BestsellerProduct }) {
  return (
    <a
      href={product.productUrl}
      data-shopify-handle={product.shopifyHandle}
      className="group block w-[74vw] shrink-0 snap-start sm:w-[46vw] md:w-[34vw] lg:w-[calc((100%-4.5rem)/4)]"
    >
      <div className="relative aspect-4/5 w-full overflow-hidden rounded-2xl bg-secondary">
        <img
          src={product.image}
          alt={product.name}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-contain p-6 transition-transform duration-700 ease-out group-hover:scale-[1.04] sm:p-8"
        />
        {product.bestseller ? (
          <span className="absolute left-3 top-3 rounded-full bg-primary px-2.5 py-1 text-[0.62rem] font-semibold uppercase tracking-[0.12em] text-primary-foreground">
            Bestseller
          </span>
        ) : null}
      </div>

      <div className="mt-4 space-y-1.5">
        <p className="text-eyebrow text-muted-foreground">{product.collection}</p>
        <h3 className="text-base font-medium leading-snug text-foreground transition-opacity duration-300 group-hover:opacity-70 sm:text-lg">
          {product.name}
        </h3>
        <p className="text-sm text-foreground/80 tabular-nums">{product.price}</p>
      </div>
    </a>
  );
}

export function Bestsellers() {
  const [active, setActive] = useState<(typeof bestsellerFilters)[number]>("All");
  const trackRef = useRef<HTMLDivElement>(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(true);

  const products = useMemo(
    () =>
      active === "All"
        ? bestsellerProducts
        : bestsellerProducts.filter((p) => p.category === active),
    [active],
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
      className="w-full bg-background py-14 sm:py-16 lg:py-20"
    >
      <div className="mx-auto w-full max-w-[1600px]">
        <div className="pl-[30px] pr-5 sm:pl-[42px] sm:pr-8 lg:pl-[58px] lg:pr-12">
          <h2 id="bestsellers-heading" className="text-section">
            Bestsellers
          </h2>


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
              <ProductCard key={p.id} product={p} />
            ))}
            <div aria-hidden className="w-1 shrink-0 sm:w-2" />
          </div>
        </div>
      </div>
    </section>
  );
}
