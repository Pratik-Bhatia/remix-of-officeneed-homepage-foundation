import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { bestsellerProducts, inBestsellerCategory } from "@/lib/bestsellers";
import { useShopifyBestsellers } from "@/lib/shopify-overlay";
import { ProductCard } from "@/components/officeneed/ProductCard";
import type { Product } from "@/lib/products";

/**
 * The exact Shopify gift sets chosen for this row (one 4-, 5- and 6-in-1),
 * in display order. Matched by handle; each must still be in Corporate
 * Gifting. Missing/unpublished products are simply skipped -- no fillers.
 */
export const CORPORATE_GIFT_SET_HANDLES = [
  "premium-4-in-1-executive-diary-pen-keychain-card-holder-set-1",
  "premium-5-in-1-executive-gift-set",
  "premium-6-in-1-executive-gift-set-with-16gb-pendrive",
] as const;

export function selectCorporateGifts(products: Product[]): Product[] {
  return CORPORATE_GIFT_SET_HANDLES.flatMap((handle) => {
    const p = products.find((x) => x.slug === handle);
    return p && inBestsellerCategory(p, "Corporate Gifting") ? [p] : [];
  });
}

export function CorporateGiftingCarousel() {
  const trackRef = useRef<HTMLDivElement>(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(true);
  const { products: catalogue, pricesReady } = useShopifyBestsellers(bestsellerProducts);
  const products = useMemo(
    () => selectCorporateGifts(catalogue).map(({ badge: _badge, ...p }) => p),
    [catalogue],
  );

  const sync = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    setCanPrev(el.scrollLeft > 8);
    setCanNext(el.scrollLeft + el.clientWidth < el.scrollWidth - 8);
  }, []);

  useEffect(() => {
    sync();
    window.addEventListener("resize", sync);
    return () => window.removeEventListener("resize", sync);
  }, [sync, products.length]);

  const scrollBy = (dir: -1 | 1) => {
    const el = trackRef.current;
    if (!el) return;
    const card = el.querySelector("a");
    const step = card ? card.clientWidth + 24 : el.clientWidth * 0.8;
    el.scrollBy({ left: dir * step * (el.clientWidth > 1024 ? 2 : 1), behavior: "smooth" });
  };

  if (products.length === 0) return null;

  return (
    <section aria-labelledby="corporate-gifts-heading" className="w-full bg-background py-14 sm:py-16 lg:py-20">
      <div className="mx-auto w-full max-w-[1600px] pl-[30px] pr-5 sm:pl-[42px] sm:pr-8 lg:pl-[58px] lg:pr-12">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 id="corporate-gifts-heading" className="text-section">
              Explore Corporate Gift Sets
            </h2>
            <p className="mt-2 text-sm text-muted-foreground sm:text-base">
              Thoughtful sets for teams, clients and business partners.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-4">
            <a
              href="/products/?collection=corporate-gifting"
              className="pr-2 text-sm font-medium text-foreground hover:underline"
            >
              View All &rarr;
            </a>
            <div className="hidden gap-2 sm:flex">
              <button
                type="button"
                aria-label="Previous gift sets"
                onClick={() => scrollBy(-1)}
                disabled={!canPrev}
                className="grid h-10 w-10 place-items-center rounded-full border border-border bg-background transition-all duration-300 hover:scale-105 hover:bg-secondary disabled:opacity-35 disabled:hover:scale-100"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label="Next gift sets"
                onClick={() => scrollBy(1)}
                disabled={!canNext}
                className="grid h-10 w-10 place-items-center rounded-full border border-foreground/40 bg-background transition-all duration-300 hover:scale-105 hover:bg-secondary disabled:opacity-35 disabled:hover:scale-100"
              >
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        <div
          ref={trackRef}
          onScroll={sync}
          className="mt-8 flex snap-x snap-mandatory gap-6 overflow-x-auto scroll-smooth pb-2 [scrollbar-width:none] sm:mt-10 [&::-webkit-scrollbar]:hidden"
        >
          {products.map((p) => (
            <ProductCard
              key={p.slug}
              product={p}
              pricePending={!pricesReady}
              className="w-[74vw] shrink-0 snap-start sm:w-[46vw] md:w-[34vw] lg:w-[calc((100%-4.5rem)/4)]"
            />
          ))}
          <div aria-hidden className="w-1 shrink-0 sm:w-2" />
        </div>
      </div>
    </section>
  );
}
