import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { bestsellerProducts, inBestsellerCategory } from "@/lib/bestsellers";
import { useShopifyBestsellers } from "@/lib/shopify-overlay";
import { ProductCard } from "@/components/officeneed/ProductCard";
import { LoadingRegion, ProductCardSkeleton } from "@/components/officeneed/skeletons";
import type { Product } from "@/lib/products";

const GIFT_CARD_WIDTH = "w-[74vw] shrink-0 snap-start sm:w-[46vw] md:w-[34vw] lg:w-[calc((100%-4.5rem)/4)]";

/**
 * The exact Shopify gift sets chosen for this row (one 3-, 4-, 5- and 6-in-1),
 * in display order. Matched by handle; each must still be in Corporate
 * Gifting. Missing/unpublished products are simply skipped -- no fillers.
 */
export const CORPORATE_GIFT_SET_HANDLES = [
  "premium-3-in-1-diary-bottle-pen-gift-set",
  "premium-4-in-1-executive-diary-pen-keychain-card-holder-set-1",
  "premium-5-in-1-executive-gift-set",
  "premium-6-in-1-executive-gift-set-with-16gb-pendrive",
] as const;

/** Matches a multi-item gift set by name (mirrors shopify-overlay.ts's
 * Gift Sets rule) -- used together with the resolved "Gift Sets"
 * subcategory so a set whose collection mapping is missing still shows. */
const GIFT_SET_NAME = /gift\s*sets?|hamper|bundle/i;

/** Same cap as the Bestsellers row -- enough to fill the carousel on wide
 * screens without dumping the whole category into the homepage. */
const CORPORATE_GIFT_LIMIT = 12;

/**
 * The curated sets above first (in display order, missing/unpublished ones
 * skipped), then every other real Corporate Gifting gift set from the live
 * catalogue, so the row fills naturally instead of showing only the
 * handful of curated handles. No product appears twice; nothing is
 * invented when the store has fewer sets than the limit.
 */
export function selectCorporateGifts(products: Product[]): Product[] {
  const isGiftSet = (p: Product) =>
    p.subcategories.includes("Gift Sets") || GIFT_SET_NAME.test(p.name);

  const seen = new Set<string>();
  const out: Product[] = [];
  const push = (p: Product | undefined) => {
    if (!p || seen.has(p.slug) || out.length >= CORPORATE_GIFT_LIMIT) return;
    if (!inBestsellerCategory(p, "Corporate Gifting") || !isGiftSet(p)) return;
    seen.add(p.slug);
    out.push(p);
  };

  for (const handle of CORPORATE_GIFT_SET_HANDLES) {
    push(products.find((x) => x.slug === handle));
  }
  for (const p of products) push(p);
  return out;
}

export function CorporateGiftingCarousel() {
  const trackRef = useRef<HTMLDivElement>(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(true);
  const { products: catalogue, pricesReady, status } = useShopifyBestsellers(bestsellerProducts);
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

  // Loading renders the section with skeleton cards (no pop-in shift).
  // Truly empty -> no section. Failed -> no section either: this reads the
  // same bestsellers request as <Bestsellers>, which already shows the error
  // and retry, so a second identical error here would just be noise.
  const loading = status === "loading" || status === "idle";
  if (!loading && products.length === 0) return null;

  return (
    <section aria-labelledby="corporate-gifts-heading" className="w-full bg-[#F5F5F5] py-14 sm:py-16 lg:py-20">
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
          {loading ? (
            <LoadingRegion label="Loading corporate gift sets" className="contents">
              {Array.from({ length: 4 }).map((_, i) => (
                <ProductCardSkeleton key={i} className={GIFT_CARD_WIDTH} />
              ))}
            </LoadingRegion>
          ) : (
            products.map((p) => (
              <ProductCard key={p.slug} product={p} pricePending={!pricesReady} className={GIFT_CARD_WIDTH} />
            ))
          )}
          <div aria-hidden className="w-1 shrink-0 sm:w-2" />
        </div>
      </div>
    </section>
  );
}
