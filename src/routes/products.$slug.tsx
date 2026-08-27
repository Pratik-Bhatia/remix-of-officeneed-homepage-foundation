import { useMemo, useState } from "react";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { Minus, Plus, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { Navbar } from "@/components/officeneed/Navbar";
import { Footer } from "@/components/officeneed/Footer";
import { ProductCard } from "@/components/officeneed/ProductCard";
import { EnquiryDialog } from "@/components/officeneed/EnquiryDialog";
import { ProductCustomizer } from "@/components/officeneed/ProductCustomizer";
import { RichText } from "@/components/officeneed/RichText";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getProductBySlug, getRelatedProducts } from "@/lib/products";
import { fetchProductByHandle, formatMoney, type ShopifyVariantNode } from "@/lib/shopify";
import { mergeProduct, shopifyNodeToProduct } from "@/lib/shopify-overlay";
import { useCartStore } from "@/stores/cartStore";
import { toast } from "sonner";

const BASE = "https://officeneed-premier-launch.lovable.app";

export const Route = createFileRoute("/products/$slug")({
  loader: async ({ params }) => {
    const staticProduct = getProductBySlug(params.slug);

    // Live Shopify details take priority; static data is the fallback.
    let node = null;
    try {
      node = await fetchProductByHandle(params.slug);
    } catch {
      node = null;
    }

    if (staticProduct) return { product: mergeProduct(staticProduct, node ?? undefined), node };
    if (node) return { product: shopifyNodeToProduct(node), node };
    throw notFound();
  },
  head: ({ params, loaderData }) => {
    if (!loaderData) {
      return {
        meta: [{ title: "Product unavailable — OfficeNeed" }, { name: "robots", content: "noindex" }],
      };
    }
    const p = loaderData.product;
    const title = `${p.name} — OfficeNeed`;
    const url = `${BASE}/products/${params.slug}`;
    return {
      meta: [
        { title },
        { name: "description", content: p.summary },
        { property: "og:title", content: title },
        { property: "og:description", content: p.summary },
        { property: "og:type", content: "product" },
        { property: "og:url", content: url },
        { property: "og:image", content: p.images[0]! },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:image", content: p.images[0]! },
      ],
      links: [{ rel: "canonical", href: url }],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Product",
            name: p.name,
            description: p.description,
            image: p.images,
            category: p.category,
            ...(p.sku ? { sku: p.sku } : {}),
          }),
        },
      ],
    };
  },
  notFoundComponent: ProductNotFound,
  errorComponent: ({ error }) => (
    <div className="mx-auto max-w-md px-5 py-24 text-center" role="alert">
      <p className="text-sm text-muted-foreground">{error.message}</p>
    </div>
  ),
  component: ProductDetail,
});

function ProductNotFound() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="mx-auto max-w-md px-5 py-24 text-center">
        <h1 className="text-section">Product not found</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          This product may have been renamed or removed.
        </p>
        <Link
          to="/products"
          className="mt-6 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Browse all products
        </Link>
      </main>
      <Footer />
    </div>
  );
}

function ProductDetail() {
  const { product, node } = Route.useLoaderData();
  const [quantity, setQuantity] = useState<number>(product.minimumOrderQuantity || 1);
  const [customizerOpen, setCustomizerOpen] = useState(false);

  const addItem = useCartStore((s) => s.addItem);
  const isCartLoading = useCartStore((s) => s.isLoading);

  const min = product.minimumOrderQuantity || 1;
  const step = 1;

  /* ---------------- Shopify-driven variant + gallery model ---------------- */

  const variants = useMemo<ShopifyVariantNode[]>(
    () => node?.variants?.edges?.map((e) => e.node) ?? [],
    [node],
  );

  /** Gallery = product media first, plus any variant media not already present. */
  const gallery = useMemo(() => {
    const seen = new Set<string>();
    const items: Array<{ url: string; alt: string | null }> = [];
    const push = (img?: { url?: string | null; altText?: string | null } | null) => {
      const url = img?.url;
      if (!url || seen.has(url)) return;
      seen.add(url);
      items.push({ url, alt: img?.altText ?? null });
    };
    push(node?.featuredImage);
    node?.images?.edges?.forEach((e) => push(e.node));
    variants.forEach((v) => push(v.image));
    if (items.length === 0) {
      product.images.forEach((url) => push({ url, altText: null }));
    }
    return items;
  }, [node, variants, product.images]);

  const indexForUrl = (url?: string | null) => {
    if (!url) return -1;
    return gallery.findIndex((g) => g.url === url);
  };

  const defaultVariant = useMemo(
    () => variants.find((v) => v.availableForSale) ?? variants[0],
    [variants],
  );

  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(
    defaultVariant?.id ?? null,
  );
  const selectedVariant =
    variants.find((v) => v.id === selectedVariantId) ?? defaultVariant;

  const [activeImage, setActiveImage] = useState(() => {
    const i = indexForUrl(defaultVariant?.image?.url);
    return i >= 0 ? i : 0;
  });

  const selectVariant = (variant: ShopifyVariantNode) => {
    setSelectedVariantId(variant.id);
    const i = indexForUrl(variant.image?.url);
    if (i >= 0) setActiveImage(i);
  };

  /** Images belonging to a specific variant (used to highlight the gallery). */
  const variantImageUrls = useMemo(
    () => new Set(variants.map((v) => v.image?.url).filter(Boolean) as string[]),
    [variants],
  );

  const hasVariantChoice = variants.length > 1;

  const handleBuyNow = async () => {
    if (!node) {
      toast.error("This product is currently available for enquiry only.");
      return;
    }

    const variantToUse = selectedVariant;
    if (!variantToUse) return;
    if (!variantToUse.availableForSale) {
      toast.error("This option is currently sold out.");
      return;
    }

    try {
      await addItem({
        product: { node },
        variantId: variantToUse.id,
        variantTitle: variantToUse.title,
        price: variantToUse.price ?? node.priceRange?.minVariantPrice,
        quantity: product.supportsQuantity ? quantity : 1,
        selectedOptions: variantToUse.selectedOptions ?? [],
      });
      toast.success("Added to cart", { description: product.name });
      window.dispatchEvent(new CustomEvent("open-overlays", { detail: "cart" }));
    } catch {
      toast.error("Failed to add to cart");
    }
  };

  const nextImage = () => {
    setActiveImage((prev) => (prev + 1) % gallery.length);
  };
  const prevImage = () => {
    setActiveImage((prev) => (prev - 1 + gallery.length) % gallery.length);
  };

  /* ---------------- Price / availability / SKU (variant-aware) ------------ */

  const currency = selectedVariant?.price.currencyCode ?? product.currencyCode ?? "INR";
  const unitAmount = selectedVariant
    ? parseFloat(selectedVariant.price.amount)
    : (product.priceAmount ?? NaN);
  const hasNumericPrice = Number.isFinite(unitAmount) && unitAmount > 0;
  const qtyMultiplier = product.supportsQuantity ? quantity : 1;
  const displayPrice = hasNumericPrice
    ? formatMoney(unitAmount * qtyMultiplier, currency)
    : product.price;
  const compareAmount = selectedVariant?.compareAtPrice
    ? parseFloat(selectedVariant.compareAtPrice.amount)
    : NaN;
  const showCompareAt = Number.isFinite(compareAmount) && compareAmount > unitAmount;

  const availabilityLabel = selectedVariant
    ? selectedVariant.availableForSale
      ? typeof selectedVariant.quantityAvailable === "number" &&
        selectedVariant.quantityAvailable > 0 &&
        selectedVariant.quantityAvailable <= 5
        ? `Only ${selectedVariant.quantityAvailable} left`
        : "In stock"
      : "Sold out"
    : product.availability;

  const skuLabel = selectedVariant?.sku || product.sku;

  const activeMedia = gallery[activeImage] ?? gallery[0];

  const related = useMemo(() => getRelatedProducts(product, 4), [product]);



  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="w-full overflow-clip">
        <div className="mx-auto w-full max-w-[1600px] px-5 py-8 sm:px-8 sm:py-10 lg:px-12 lg:py-14">
          <nav aria-label="Breadcrumb" className="mb-6">
            <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
              <li>
                <Link to="/" className="transition-colors hover:text-foreground">
                  Home
                </Link>
              </li>
              <li aria-hidden>/</li>
              <li>
                <Link to="/products" className="transition-colors hover:text-foreground">
                  Products
                </Link>
              </li>
              <li aria-hidden>/</li>
              <li className="max-w-full truncate">{product.category}</li>
              <li aria-hidden>/</li>
              <li aria-current="page" className="max-w-full truncate text-foreground">
                {product.name}
              </li>
            </ol>
          </nav>

          <div className="grid gap-10 lg:grid-cols-2 lg:gap-16">
            {/* Gallery Wrapper (Sticky on desktop) */}
            <div className="lg:sticky lg:top-[120px] self-start">
              <div className="flex flex-col lg:flex-row gap-4">
                {/* Thumbnails */}
                {gallery.length > 1 && (
                  <div
                    role="group"
                    aria-label="Product thumbnails"
                    className="order-2 lg:order-1 flex lg:flex-col gap-3 overflow-x-auto lg:overflow-y-auto pb-2 lg:pb-0 lg:pr-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                  >
                    {gallery.map((media, i) => (
                      <button
                        key={media.url}
                        type="button"
                        onClick={() => setActiveImage(i)}
                        aria-label={media.alt || `Show image ${i + 1} of ${gallery.length}`}
                        aria-current={activeImage === i}
                        className={cn(
                          "size-24 sm:size-32 shrink-0 overflow-hidden rounded-xl border bg-secondary transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground",
                          activeImage === i
                            ? "border-foreground ring-1 ring-foreground opacity-100"
                            : "border-border opacity-70 hover:opacity-100",
                          variantImageUrls.has(media.url) && selectedVariant?.image?.url === media.url
                            ? "ring-1 ring-foreground"
                            : "",
                        )}
                      >
                        <img
                          src={media.url}
                          alt=""
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                      </button>
                    ))}
                  </div>
                )}
                
                {/* Main Image */}
                <div className="order-1 lg:order-2 flex-1 relative overflow-hidden rounded-2xl bg-secondary group">
                  <img
                    src={activeMedia?.url ?? product.images[0]}
                    alt={activeMedia?.alt || `${product.name} — image ${activeImage + 1}`}
                    className="aspect-square lg:aspect-[4/3] w-full object-contain p-6 sm:p-10"
                  />
                  
                  {/* Arrows */}
                  {gallery.length > 1 && (
                    <>
                      <button
                        onClick={prevImage}
                        aria-label="Previous product image"
                        className="absolute left-3 lg:left-4 top-1/2 -translate-y-1/2 flex items-center justify-center size-9 lg:size-10 rounded-full bg-background/80 backdrop-blur border border-border text-foreground opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity hover:bg-background focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground shadow-sm"
                      >
                        <ChevronLeft className="size-4 lg:size-5" />
                      </button>
                      <button
                        onClick={nextImage}
                        aria-label="Next product image"
                        className="absolute right-3 lg:right-4 top-1/2 -translate-y-1/2 flex items-center justify-center size-9 lg:size-10 rounded-full bg-background/80 backdrop-blur border border-border text-foreground opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity hover:bg-background focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground shadow-sm"
                      >
                        <ChevronRight className="size-4 lg:size-5" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Information */}
            <div>
              <p className="text-eyebrow text-muted-foreground">{product.category}</p>
              <h1 className="mt-2 text-2xl md:text-3xl font-light tracking-tight text-foreground leading-tight">{product.name}</h1>
              
              <div className="mt-4 space-y-3">
                <p className="text-sm leading-relaxed text-muted-foreground sm:text-base">
                  {product.summary}
                </p>

                <div className="flex flex-wrap items-baseline gap-3">
                  <p className="text-xl font-medium tabular-nums text-foreground">
                    {displayPrice
                      ? `${!selectedVariant && product.startingPrice ? "From " : ""}${displayPrice}`
                      : "Price on enquiry"}
                  </p>
                  {showCompareAt ? (
                    <p className="text-sm tabular-nums text-muted-foreground line-through">
                      {formatMoney(compareAmount * qtyMultiplier, currency)}
                    </p>
                  ) : null}
                </div>

                <dl className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted-foreground">
                  {availabilityLabel ? (
                    <div className="flex items-center gap-1.5">
                      <dt className="font-medium text-foreground/80">Availability:</dt>
                      <dd
                        className={cn(
                          availabilityLabel === "Sold out" ? "text-destructive" : undefined,
                        )}
                      >
                        {availabilityLabel}
                      </dd>
                    </div>
                  ) : null}
                  {skuLabel ? (
                    <div className="flex items-center gap-1.5">
                      <dt className="font-medium text-foreground/80">Product code:</dt>
                      <dd className="tabular-nums">{skuLabel}</dd>
                    </div>
                  ) : null}
                  {product.vendor ? (
                    <div className="flex items-center gap-1.5">
                      <dt className="font-medium text-foreground/80">Brand:</dt>
                      <dd>{product.vendor}</dd>
                    </div>
                  ) : null}
                </dl>
              </div>

              {product.supportsQuantity ? (
                <div className="mt-6">
                  <p className="text-xs font-medium text-foreground/80" id="qty-label">
                    Quantity{min > 1 ? ` (minimum ${min})` : ""}
                  </p>
                  <div className="mt-2 inline-flex items-center rounded-md border border-border">
                    <button
                      type="button"
                      aria-label="Decrease quantity"
                      onClick={() => setQuantity((q) => Math.max(min, q - step))}
                      className="grid size-10 place-items-center text-foreground/80 transition-colors hover:bg-secondary"
                    >
                      <Minus className="size-4" />
                    </button>
                    <input
                      type="number"
                      aria-labelledby="qty-label"
                      value={quantity}
                      min={min}
                      onChange={(e) =>
                        setQuantity(Math.max(min, Number(e.target.value) || min))
                      }
                      className="w-12 border-x border-border bg-background py-1.5 text-center text-sm tabular-nums outline-none"
                    />
                    <button
                      type="button"
                      aria-label="Increase quantity"
                      onClick={() => setQuantity((q) => q + step)}
                      className="grid size-10 place-items-center text-foreground/80 transition-colors hover:bg-secondary"
                    >
                      <Plus className="size-4" />
                    </button>
                  </div>
                </div>
              ) : null}

              {hasVariantChoice ? (
                <div className="mt-6">
                  <p className="text-xs font-medium text-foreground/80" id="variant-label">
                    {node?.options?.find((o) => o.name.toLowerCase() !== "title")?.name ?? "Options"}
                    {selectedVariant ? (
                      <span className="ml-1 text-muted-foreground">— {selectedVariant.title}</span>
                    ) : null}
                  </p>
                  <div
                    role="group"
                    aria-labelledby="variant-label"
                    className="mt-3 flex flex-wrap gap-3"
                  >
                    {variants.map((v) => {
                      const isSelected = selectedVariant?.id === v.id;
                      const thumb = v.image?.url;
                      return (
                        <button
                          key={v.id}
                          type="button"
                          onClick={() => selectVariant(v)}
                          aria-pressed={isSelected}
                          className={cn(
                            "flex items-center gap-2 rounded-full border py-1.5 pl-1.5 pr-3.5 text-xs transition-all outline-none focus-visible:ring-2 focus-visible:ring-foreground",
                            thumb ? "" : "pl-3.5",
                            isSelected
                              ? "border-foreground bg-foreground text-background"
                              : "border-border bg-background text-foreground hover:border-foreground",
                            !v.availableForSale ? "opacity-50" : "",
                          )}
                        >
                          {thumb ? (
                            <img
                              src={thumb}
                              alt=""
                              loading="lazy"
                              className="size-8 shrink-0 rounded-full bg-secondary object-cover"
                            />
                          ) : null}
                          <span className="whitespace-nowrap">{v.title}</span>
                          {!v.availableForSale ? (
                            <span className="whitespace-nowrap opacity-70">(Sold out)</span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                <Button 
                  size="lg" 
                  onClick={handleBuyNow}
                  disabled={isCartLoading || (!!selectedVariant && !selectedVariant.availableForSale)}
                  className="w-full sm:w-auto font-medium text-background bg-foreground hover:bg-foreground/90"
                >
                  {isCartLoading ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                  {selectedVariant && !selectedVariant.availableForSale ? "Sold out" : "Buy Now"}
                </Button>
                <EnquiryDialog
                  product={product}
                  quantity={product.supportsQuantity ? quantity : undefined}
                  trigger={
                    <Button size="lg" variant="outline" className="w-full sm:w-auto">
                      Enquire Now
                    </Button>
                  }
                />
              </div>

              {/* Corporate Gifting Customizer CTA */}
              {product.category === "Corporate Gifting" && (
                <div className="mt-8 rounded-xl bg-muted/30 border border-border p-6 flex flex-col items-center text-center sm:items-start sm:text-left sm:flex-row sm:justify-between gap-6">
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">Make It Yours</h3>
                    <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                      Add your company's branding and see how your gift could look before requesting a quote.
                    </p>
                  </div>
                  <Button 
                    size="lg" 
                    className="w-full sm:w-auto shrink-0"
                    onClick={() => setCustomizerOpen(true)}
                  >
                    Customize This Product
                  </Button>
                </div>
              )}
              
              <ProductCustomizer 
                product={product} 
                open={customizerOpen} 
                onOpenChange={setCustomizerOpen} 
              />

              {/* Details */}
              <div className="mt-8 space-y-6 border-t border-border pt-8">
                <section>
                  <h2 className="text-sm font-semibold text-foreground">Description</h2>
                  <RichText
                    className="mt-2"
                    html={product.descriptionHtml}
                    text={product.description}
                  />
                </section>

                {product.specifications?.length ? (
                  <section>
                    <h2 className="text-sm font-semibold text-foreground">Specifications</h2>
                    <dl className="mt-3 divide-y divide-border border-y border-border text-sm">
                      {product.specifications.map((s) => (
                        <div key={s.label} className="flex gap-4 py-2.5">
                          <dt className="w-40 shrink-0 text-muted-foreground">{s.label}</dt>
                          <dd className="min-w-0 text-foreground">{s.value}</dd>
                        </div>
                      ))}
                    </dl>
                  </section>
                ) : null}

                {product.features?.length ? (
                  <section>
                    <h2 className="text-sm font-semibold text-foreground">Features</h2>
                    <ul className="mt-3 space-y-1.5 text-sm text-muted-foreground">
                      {product.features.map((f) => (
                        <li key={f} className="flex gap-2">
                          <span aria-hidden className="text-foreground/40">
                            —
                          </span>
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}

                {!hasVariantChoice && product.variants?.length ? (
                  <section>
                    <h2 className="text-sm font-semibold text-foreground">Options</h2>
                    <ul className="mt-3 flex flex-wrap gap-2">
                      {product.variants.map((v) => (
                        <li
                          key={v}
                          className="rounded-full bg-secondary px-3 py-1.5 text-xs text-secondary-foreground"
                        >
                          {v}
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}

                {product.packaging ? (
                  <section>
                    <h2 className="text-sm font-semibold text-foreground">Packaging</h2>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      {product.packaging}
                    </p>
                  </section>
                ) : null}

                {product.customization ? (
                  <section>
                    <h2 className="text-sm font-semibold text-foreground">Customization</h2>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      {product.customization}
                    </p>
                  </section>
                ) : null}
              </div>
            </div>
          </div>

          {/* Enquiry CTA */}
          <section
            aria-labelledby="enquiry-heading"
            className="mt-16 rounded-2xl border border-border px-6 py-10 text-center sm:mt-20 sm:px-10"
          >
            <h2 id="enquiry-heading" className="text-lg font-semibold text-foreground sm:text-xl">
              Interested in this product?
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
              Tell us what you need and our team will help you with pricing, quantities,
              customization and delivery.
            </p>
            <div className="mt-6 flex justify-center">
              <EnquiryDialog
                product={product}
                quantity={product.supportsQuantity ? quantity : undefined}
                trigger={<Button size="lg">Send Enquiry</Button>}
              />
            </div>
          </section>

          {/* Related */}
          {related.length ? (
            <section aria-labelledby="related-heading" className="mt-16 sm:mt-20">
              <h2 id="related-heading" className="text-section">
                You May Also Like
              </h2>
              <div className="mt-8 grid grid-cols-2 gap-x-5 gap-y-10 sm:gap-x-6 md:grid-cols-3 xl:grid-cols-4">
                {related.map((p) => (
                  <ProductCard key={p.slug} product={p} />
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </main>
      <Footer />
    </div>
  );
}
