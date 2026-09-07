import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ProductCard } from "@/components/officeneed/ProductCard";
import { Button } from "@/components/ui/button";
import { fetchProductByHandle } from "@/lib/shopify";
import { shopifyNodeToProduct } from "@/lib/shopify-overlay";
import { useSaves } from "@/lib/saves";
import type { Product } from "@/lib/products";

export const Route = createFileRoute("/account/saves")({
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
      setProducts(nodes.filter(Boolean).map((node) => shopifyNodeToProduct(node!)));
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
        <div className="mt-6 rounded-2xl border border-border p-10 text-center text-sm text-muted-foreground">
          Loading your saved products…
        </div>
      ) : products.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-border p-12 text-center">
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
              <ProductCard product={product} />
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
