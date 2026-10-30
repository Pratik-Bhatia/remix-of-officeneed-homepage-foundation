import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ProductCard } from "@/components/officeneed/ProductCard";
import { Button } from "@/components/ui/button";
import { fetchProductByHandle } from "@/lib/shopify";
import { shopifyNodeToCardProduct } from "@/lib/shopify-overlay";
import { useSaves } from "@/lib/saves";
import type { Product } from "@/lib/products";

// Card image width in this grid: the account layout (max-w-6xl, px-4 / sm:px-6 /
// lg:px-8, and on lg a 224px menu + 48px gap), 2 / lg:3 columns with gap-x-5,
// minus the image's p-1.5 / sm:p-8 padding.
const SAVES_IMAGE_SIZES = [
  "(min-width: 1152px) 195px",
  "(min-width: 1024px) calc((100vw - 376px) / 3 - 64px)",
  "(min-width: 640px) calc((100vw - 68px) / 2 - 64px)",
  "calc((100vw - 52px) / 2 - 12px)",
].join(", ");

export const Route = createFileRoute("/account/saves")({
  staticData: { sitemap: false },
  component: SavesPage,
});

function SavesPage() {
  const { savedHandles, loaded, toggleSave, refresh } = useSaves();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    if (!loaded) return;
    if (savedHandles.length === 0) {
      setProducts([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    (async () => {
      const nodes = await Promise.all(
        savedHandles.map(async (handle) => {
          try {
            return await fetchProductByHandle(handle);
          } catch {
            return null;
          }
        }),
      );
      if (!active) return;
      // Saved products are only shown as ProductCards, which don't use the
      // description details -- so the card conversion (no parsers) is enough.
      setProducts(nodes.filter(Boolean).map((node) => shopifyNodeToCardProduct(node!)));
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [savedHandles, loaded]);

  const handleRemove = async (slug: string) => {
    try {
      await toggleSave(slug);
      toast.success("Removed from your saves.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update your saves.");
    }
  };

  return (
    <section>
      <h2 className="text-xl font-medium tracking-tight text-foreground">Your Saves</h2>
      <p className="mt-1 text-sm text-muted-foreground">Products you've bookmarked for later.</p>

      {loading || !loaded ? (
        <div className="mt-6 rounded-2xl border border-border bg-background p-10 text-center text-sm text-muted-foreground">
          Loading your saved products…
        </div>
      ) : products.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-border bg-background p-12 text-center">
          <h3 className="text-base font-medium text-foreground">No saved items found. Start exploring.</h3>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
            Tap the save icon on any product to keep it here for later.
          </p>
          <Button asChild className="mt-6 rounded-full px-6">
            <Link to="/">Explore the store</Link>
          </Button>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-x-5 gap-y-8 lg:grid-cols-3">
          {products.map((product) => (
            <div key={product.slug} className="flex flex-col">
              <ProductCard product={product} imageSizes={SAVES_IMAGE_SIZES} />
              <button
                type="button"
                onClick={() => handleRemove(product.slug)}
                className="mt-3 self-start text-xs text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      {loaded && products.length > 0 ? (
        <button
          type="button"
          onClick={() => void refresh()}
          className="mt-8 text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >
          Refresh list
        </button>
      ) : null}
    </section>
  );
}
