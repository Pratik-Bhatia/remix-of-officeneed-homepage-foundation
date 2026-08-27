import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/officeneed/Navbar";
import { Footer } from "@/components/officeneed/Footer";
import { fetchProductByHandle, formatMoney } from "@/lib/shopify";
import { useCartStore } from "@/stores/cartStore";
import { RichText } from "@/components/officeneed/RichText";

export const Route = createFileRoute("/shop/$handle")({
  component: ShopProductPage,
  head: () => ({
    meta: [
      { title: "Product | OfficeNeed Shop" },
      {
        name: "description",
        content:
          "Product details, variants and pricing from the OfficeNeed store, with secure Shopify checkout.",
      },
      { property: "og:title", content: "Product | OfficeNeed Shop" },
      {
        property: "og:description",
        content: "Product details, variants and pricing from the OfficeNeed store.",
      },
      { property: "og:type", content: "product" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

function ShopProductPage() {
  const { handle } = Route.useParams();
  const addItem = useCartStore((s) => s.addItem);
  const isLoading = useCartStore((s) => s.isLoading);
  const [variantId, setVariantId] = useState<string | null>(null);

  const { data: product, isPending, error } = useQuery({
    queryKey: ["shopify-product", handle],
    queryFn: () => fetchProductByHandle(handle),
  });

  if (isPending) {
    return (
      <>
        <Navbar />
        <main className="flex min-h-[60vh] items-center justify-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </main>
      </>
    );
  }

  if (error || !product) {
    return (
      <>
        <Navbar />
        <main className="mx-auto max-w-[1600px] px-6 py-24 text-center">
          <h1 className="text-2xl font-semibold">Product not found</h1>
          <Link to="/shop" className="mt-4 inline-block underline">
            Back to shop
          </Link>
        </main>
      </>
    );
  }

  const variants = product.variants.edges.map((e) => e.node);
  const selected =
    variants.find((v) => v.id === variantId) ??
    variants.find((v) => v.availableForSale) ??
    variants[0];

  // Gallery = product media + any variant-specific media, de-duplicated by URL.
  const images = (() => {
    const seen = new Set<string>();
    const out: Array<{ url: string; altText: string | null }> = [];
    const push = (img?: { url?: string | null; altText?: string | null } | null) => {
      if (!img?.url || seen.has(img.url)) return;
      seen.add(img.url);
      out.push({ url: img.url, altText: img.altText ?? null });
    };
    push(product.featuredImage);
    product.images.edges.forEach((e) => push(e.node));
    variants.forEach((v) => push(v.image));
    return out;
  })();

  // The selected variant's own media leads the gallery when it has one.
  const heroImage = images.find((i) => i.url === selected?.image?.url) ?? images[0];

  const handleAdd = async () => {
    if (!selected) return;
    await addItem({
      product: { node: product },
      variantId: selected.id,
      variantTitle: selected.title,
      price: selected.price,
      quantity: 1,
      selectedOptions: selected.selectedOptions,
    });
    toast.success("Added to cart", { description: product.title });
  };

  return (
    <><Navbar />
    <main className="mx-auto w-full max-w-[1600px] px-4 py-12 sm:px-6 lg:px-12">
      <Link to="/shop" className="text-sm text-muted-foreground hover:text-foreground">
        ← Back to shop
      </Link>

      <div className="mt-8 grid gap-10 lg:grid-cols-2">
        <div className="space-y-4">
          <div className="aspect-square overflow-hidden rounded-lg bg-secondary">
            {heroImage ? (
              <img
                src={heroImage.url}
                alt={heroImage.altText ?? product.title}
                className="h-full w-full object-cover"
              />
            ) : null}
          </div>
          {images.length > 1 ? (
            <div className="grid grid-cols-4 gap-3">
              {images.filter((img) => img.url !== heroImage?.url).slice(0, 4).map((img) => (
                <div key={img.url} className="aspect-square overflow-hidden rounded-md bg-secondary">
                  <img
                    src={img.url}
                    alt={img.altText ?? product.title}
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div>
          {product.vendor ? (
            <p className="text-eyebrow text-muted-foreground">{product.vendor}</p>
          ) : null}
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">{product.title}</h1>
          <p className="mt-4 text-2xl font-semibold tabular-nums">
            {selected ? formatMoney(selected.price.amount, selected.price.currencyCode) : null}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            {selected?.availableForSale ? "In stock" : "Sold out"}
            {selected?.sku ? ` · SKU ${selected.sku}` : ""}
          </p>

          {variants.length > 1 ? (
            <div className="mt-8">
              <p className="text-sm font-medium">Options</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {variants.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    disabled={!v.availableForSale}
                    onClick={() => setVariantId(v.id)}
                    className={`rounded-full border px-4 py-2 text-sm transition-colors disabled:opacity-40 ${
                      selected?.id === v.id
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border hover:border-foreground"
                    }`}
                  >
                    {v.title}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <Button
            size="lg"
            className="mt-8 w-full sm:w-auto"
            disabled={isLoading || !selected?.availableForSale}
            onClick={handleAdd}
          >
            {isLoading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : selected?.availableForSale ? (
              "Add to cart"
            ) : (
              "Sold out"
            )}
          </Button>

          <RichText
            className="mt-10"
            html={product.descriptionHtml}
            text={product.description}
          />
        </div>
      </div>
    </main>
    <Footer /></>
  );
}
