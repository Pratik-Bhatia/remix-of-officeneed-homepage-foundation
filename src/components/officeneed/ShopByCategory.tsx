import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { primaryNavCategories, navCategoryTarget, getLiveNavLabel } from "@/lib/navigation";
import { useShopifyCollections } from "@/lib/shopify-overlay";
import { hideBrokenImage } from "@/components/officeneed/skeletons";
import exclusiveLogo from "@/assets/officeneed-exclusive-logo.svg.asset.json";

/**
 * Homepage "Shop by Category" grid. Reuses the site's single existing
 * primary-category source (navigation.ts, built on top of taxonomy.ts) and
 * its existing /products?collection=... routing (navCategoryTarget) --
 * exactly what the Navbar and Footer already use for these same categories.
 * No second taxonomy, no new route, no extra Shopify fetch: useShopifyCollections
 * is the same hook already used to render collection imagery on the
 * products listing page.
 */
export function ShopByCategory() {
  const { collections, isLoading } = useShopifyCollections();

  const getImage = (handle: string | undefined): string | null => {
    if (!handle) return null;
    return collections.find((c) => c.handle === handle)?.image?.url ?? null;
  };

  return (
    <section
      aria-labelledby="shop-by-category-heading"
      className="w-full bg-[#F5F5F5] py-14 sm:py-16 lg:py-20"
    >
      <div className="mx-auto w-full max-w-[1600px] px-5 sm:px-8 lg:px-12">
        <h2 id="shop-by-category-heading" className="text-section">
          Shop by Category
        </h2>

        <div className="mt-8 grid grid-cols-2 gap-4 sm:mt-10 sm:gap-5 lg:grid-cols-5 lg:gap-6">
          {primaryNavCategories.map((cat) => {
            const target = navCategoryTarget(cat.id);
            const label = getLiveNavLabel(collections, cat.label);
            // The owner-supplied brand mark now ships with its own internal
            // margin: measured against a 600px canvas, the mark (ring + ®)
            // spans 504px, i.e. 84% of the SVG. The previous edge-to-edge file
            // was rendered at 60.68% of the well, so keep the mark at that same
            // visual size with 60.68% / 0.84 = 72.17% of the well.
            const isExclusive = cat.id === "officeneed-exclusive";
            // The Exclusive card always renders the owner-supplied brand mark
            // (180x180.svg, CDN-hosted) instead of the Shopify-hosted
            // collection image.
            const image = isExclusive ? exclusiveLogo.url : getImage(target.collection);

            return (
              <Link
                key={cat.id}
                to="/products"
                search={target as any}
                className="group block rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-white">
                  {isLoading ? (
                    <div className="h-full w-full animate-pulse bg-muted" aria-hidden />
                  ) : image ? (
                    <img
                      src={image}
                      alt={label}
                      loading="lazy"
                      decoding="async"
                      onError={hideBrokenImage}
                      className={cn(
                        "object-contain object-center transition-transform duration-500 ease-out group-hover:scale-[1.04]",
                        // contain (never cover): the logo's aspect ratio must
                        // hold and nothing may crop inside the rounded well.
                        isExclusive
                          ? "absolute inset-0 m-auto h-[72.17%] w-[72.17%]"
                          : "h-full w-full p-8 sm:p-10",
                      )}
                    />
                  ) : (
                    <div className="h-full w-full bg-white" aria-hidden />
                  )}
                </div>

                <div className="mt-4 flex items-center justify-between gap-2">
                  <h3 className="text-base font-display font-semibold tracking-tight text-foreground sm:text-lg">
                    {label}
                  </h3>
                  <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground transition-colors duration-300 group-hover:text-foreground sm:text-sm">
                    Explore
                    <ArrowRight
                      className="size-3.5 transition-transform duration-300 group-hover:translate-x-0.5"
                      aria-hidden="true"
                    />
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
