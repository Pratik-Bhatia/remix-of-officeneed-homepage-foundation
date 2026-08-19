import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Navbar } from "@/components/officeneed/Navbar";
import { Footer } from "@/components/officeneed/Footer";
import { fetchProducts, formatMoney } from "@/lib/shopify";

export const Route = createFileRoute("/shop/")({
  component: ShopPage,
  head: () => ({
    meta: [
      { title: "Shop Office Supplies & Corporate Gifts | OfficeNeed" },
      {
        name: "description",
        content:
          "Browse the full OfficeNeed catalogue — stationery, hardware, fragrances and curated corporate gifting, with secure Shopify checkout.",
      },
      { property: "og:title", content: "Shop Office Supplies & Corporate Gifts | OfficeNeed" },
      {
        property: "og:description",
        content: "Browse the full OfficeNeed catalogue with secure Shopify checkout.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

function ShopPage() {
  const { data: products, isLoading, error } = useQuery({
    queryKey: ["shopify-products"],
    queryFn: () => fetchProducts(60),
  });

  return (
    <><Navbar />
    <main className="mx-auto w-full max-w-[1600px] px-4 py-12 sm:px-6 lg:px-12">
      <p className="text-eyebrow text-muted-foreground">Shopify Store</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Shop OfficeNeed</h1>
      <p className="mt-3 max-w-2xl text-muted-foreground">
        Live products from our store, with secure checkout.
      </p>

      {isLoading ? (
        <div className="flex justify-center py-24">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <p className="py-24 text-center text-destructive">
          Could not load products. Please try again shortly.
        </p>
      ) : (
        <div className="mt-10 grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-3 lg:grid-cols-4">
          {products?.map(({ node }) => {
            const image = node.images.edges[0]?.node;
            return (
              <Link
                key={node.id}
                to="/shop/$handle"
                params={{ handle: node.handle }}
                className="group block"
              >
                <div className="aspect-square overflow-hidden rounded-lg bg-secondary">
                  {image ? (
                    <img
                      src={image.url}
                      alt={image.altText ?? node.title}
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  ) : null}
                </div>
                <h2 className="mt-4 text-sm font-medium leading-snug">{node.title}</h2>
                <p className="mt-1 text-sm text-muted-foreground tabular-nums">
                  {formatMoney(
                    node.priceRange.minVariantPrice.amount,
                    node.priceRange.minVariantPrice.currencyCode,
                  )}
                </p>
              </Link>
            );
          })}
        </div>
      )}
    </main>
    <Footer /></>
  );
}
