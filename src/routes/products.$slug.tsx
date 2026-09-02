import { useMemo, useState, useRef, useEffect } from "react";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { Minus, Plus, ChevronLeft, ChevronRight, Loader2, ZoomIn, X, ShieldCheck, Lock, Award, Truck } from "lucide-react";
import { Navbar } from "@/components/officeneed/Navbar";
import { Footer } from "@/components/officeneed/Footer";
import { ProductCard } from "@/components/officeneed/ProductCard";
import { ProductInformation } from "@/components/officeneed/ProductInformation";
import { EnquiryDialog } from "@/components/officeneed/EnquiryDialog";
import { ProductCustomizer } from "@/components/officeneed/ProductCustomizer";
import { RichText } from "@/components/officeneed/RichText";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getProductBySlug, getRelatedProducts } from "@/lib/products";
import { fetchProductByHandle, fetchRelatedProducts, formatMoney, type ShopifyVariantNode } from "@/lib/shopify";
import { mergeProduct, shopifyNodeToProduct } from "@/lib/shopify-overlay";
import { useCartStore } from "@/stores/cartStore";
import { toast } from "sonner";

const BASE = "https://officeneed-premier-launch.lovable.app";

export const Route = createFileRoute("/products/$slug")({
  loader: async ({ params }) => {
    const staticProduct = getProductBySlug(params.slug);

    let node = null;
    try {
      node = await fetchProductByHandle(params.slug);
    } catch {
      node = null;
    }

    const product = staticProduct
      ? mergeProduct(staticProduct, node ?? undefined)
      : node
        ? shopifyNodeToProduct(node)
        : null;

    if (!product) throw notFound();

    let related: any[] = [];
    if (node) {
      try {
        const collectionHandles = node.collections?.edges.map((e: any) => e.node.handle) ?? [];
        const relatedNodes = await fetchRelatedProducts(node.handle, node.productType, collectionHandles, 4);
        related = relatedNodes.map(shopifyNodeToProduct);
      } catch (e) {
        console.error("Failed to fetch related", e);
      }
    }

    return { product, node, related };
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
  const { product, node, related } = Route.useLoaderData();
  const [quantity, setQuantity] = useState<number>(product.minimumOrderQuantity || 1);
  const [customizerOpen, setCustomizerOpen] = useState(false);
  const [zoomOpen, setZoomOpen] = useState(false);
  const purchaseSectionRef = useRef<HTMLDivElement>(null);
  const [showStickyBar, setShowStickyBar] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      if (!purchaseSectionRef.current) return;
      // When the bottom of the purchase section scrolls above the viewport, show the sticky bar.
      const rect = purchaseSectionRef.current.getBoundingClientRect();
      if (rect.bottom < 0) {
        setShowStickyBar(true);
      } else {
        setShowStickyBar(false);
      }
    };
    
    window.addEventListener("scroll", handleScroll, { passive: true });
    // Trigger once on mount in case the user loads the page already scrolled down
    handleScroll();
    
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);


  const addItem = useCartStore((s) => s.addItem);
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const items = useCartStore((s) => s.items);
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

  const cartItem = items.find(i => i.variantId === selectedVariant?.id);
  const cartQuantity = cartItem?.quantity;
  const isItemInCart = !!cartItem;

  // Sync PDP quantity with cart
  useEffect(() => {
    if (cartQuantity !== undefined) {
      setQuantity(cartQuantity);
    } else {
      setQuantity(product.minimumOrderQuantity || 1);
    }
  }, [cartQuantity, selectedVariant?.id, product.minimumOrderQuantity]);

  const handleQuantityChange = (newQty: number) => {
    if (!selectedVariant) return;
    
    if (!isItemInCart) {
      setQuantity(Math.max(1, newQty));
      return;
    }

    if (newQty <= 0) {
      // Remove from cart
      useCartStore.getState().removeItem(selectedVariant.id);
      setQuantity(1); // Reset default for PDP
    } else {
      // Auto sync
      setQuantity(newQty); // Optimistic UI
      useCartStore.getState().updateQuantity(selectedVariant.id, newQty);
    }
  };

  const handleBuyNow = async () => {
    if (!node) {
      toast.error("This product is currently available for enquiry only.");
      return;
    }

    const variantToUse = selectedVariant;
    if (!variantToUse) return;
    
    if (isItemInCart) {
      // If already in cart, button just opens drawer since quantity auto-syncs
      window.dispatchEvent(new CustomEvent("open-overlays", { detail: "cart" }));
      return;
    }

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
        quantity,
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
  const qtyMultiplier = quantity;
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




  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="w-full overflow-clip">
        <div className="mx-auto w-full max-w-[1600px] px-5 py-8 sm:px-8 sm:py-10 lg:px-12 lg:py-14">

          <div className="product-detail flex flex-col lg:grid lg:grid-cols-[minmax(0,1.15fr)_minmax(min(420px,100%),0.85fr)] gap-8 lg:gap-12 items-start w-full">
            {/* Gallery Wrapper (Sticky on desktop) */}
            <div className="w-full min-w-0 max-w-full lg:sticky lg:top-[120px]">
              <div className="product-gallery grid grid-cols-1 lg:grid-cols-[80px_minmax(0,1fr)] gap-4 lg:gap-5 w-full items-start">
                
                {/* Thumbnails */}
                
                  <div
                    role="group"
                    aria-label="Product thumbnails"
                    className="product-thumbnails order-2 lg:order-1 flex lg:flex-col gap-3 w-full lg:w-[80px] overflow-x-auto lg:overflow-y-auto pb-2 lg:pb-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                  >
                    {gallery.map((media, i) => (
                      <button
                        key={media.url}
                        type="button"
                        onClick={() => setActiveImage(i)}
                        aria-label={media.alt || `Show image ${i + 1} of ${gallery.length}`}
                        aria-current={activeImage === i}
                        className={cn(
                          "product-thumbnail w-20 h-20 sm:w-24 sm:h-24 lg:w-[80px] lg:h-[80px] shrink-0 overflow-hidden rounded-xl border bg-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground",
                          activeImage === i
                            ? "border-foreground ring-1 ring-foreground opacity-100"
                            : "border-border opacity-60 hover:opacity-100",
                          variantImageUrls.has(media.url) && selectedVariant?.image?.url === media.url
                            ? "ring-1 ring-foreground"
                            : "",
                        )}
                      >
                        <img
                          src={media.url}
                          alt=""
                          loading="lazy"
                          className="h-full w-full object-contain p-1"
                        />
                      </button>
                    ))}
                  </div>
                
                
                {/* Main Image */}
                <div className="product-main-image order-1 lg:order-2 w-full max-w-[1080px] aspect-square lg:aspect-auto lg:h-[calc(100vh-200px)] lg:max-h-[1080px] relative overflow-hidden rounded-2xl bg-secondary/30 border border-border/50 group flex items-center justify-center p-4 sm:p-8">
                  <img
                    src={activeMedia?.url ?? product.images[0]}
                    alt={activeMedia?.alt || `${product.name} - image ${activeImage + 1}`}
                    className="w-full h-full object-contain mix-blend-multiply block" style={{ maxHeight: "1080px" }}
                  />
                  
                  {/* Arrows */}
                  {gallery.length > 1 && (
                    <>
                      <button
                        onClick={prevImage}
                        aria-label="Previous product image"
                        className="absolute left-3 lg:left-4 top-1/2 -translate-y-1/2 flex items-center justify-center size-10 lg:size-11 rounded-full bg-background/90 backdrop-blur border border-border text-foreground opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity hover:bg-background focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground shadow-sm"
                      >
                        <ChevronLeft className="size-5 lg:size-6" />
                      </button>
                      <button
                        onClick={nextImage}
                        aria-label="Next product image"
                        className="absolute right-3 lg:right-4 top-1/2 -translate-y-1/2 flex items-center justify-center size-10 lg:size-11 rounded-full bg-background/90 backdrop-blur border border-border text-foreground opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity hover:bg-background focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground shadow-sm"
                      >
                        <ChevronRight className="size-5 lg:size-6" />
                      </button>
                    </>
                  )}
                  {/* Zoom Button */}
                  <button
                    onClick={() => setZoomOpen(true)}
                    aria-label="Zoom image"
                    className="absolute bottom-4 right-4 lg:bottom-6 lg:right-6 flex items-center justify-center size-10 lg:size-11 rounded-full bg-background/90 backdrop-blur border border-border text-foreground opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity hover:bg-background focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground shadow-sm"
                  >
                    <ZoomIn className="size-5" />
                  </button>
                </div>
              </div>
            </div>

            {/* Information */}
            <div className="w-full min-w-0 max-w-full overflow-wrap-break-word">
              <p className="text-eyebrow text-muted-foreground">{product.category}</p>
              <h1 className="mt-2 text-3xl md:text-4xl lg:text-[40px] font-semibold tracking-tight text-foreground leading-[1.1] text-balance">{product.name}</h1>
              
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

                </dl>
              </div>

              {/* B2B Quantity Selector */}
              <div className="mt-6 mb-2">
                <div className="inline-flex h-[52px] items-center border border-[#e5e5e5] bg-transparent">
                  <button
                    type="button"
                    aria-label="Decrease quantity"
                    onClick={() => setQuantity((q) => Math.max(min, q - step))}
                    className="px-5 text-foreground/60 hover:text-foreground hover:bg-[#f5f5f5] transition-colors h-full flex items-center justify-center"
                  >
                    <Minus className="size-3" strokeWidth={2} />
                  </button>
                  <input
                    type="number"
                    name="quantity"
                    aria-label="Quantity"
                    value={quantity}
                    min={min}
                    onChange={(e) => setQuantity(Math.max(min, Number(e.target.value) || min))}
                    className="w-14 h-full bg-transparent text-center text-sm font-medium tabular-nums outline-none appearance-none"
                  />
                  <button
                    type="button"
                    aria-label="Increase quantity"
                    onClick={() => setQuantity((q) => q + step)}
                    className="px-5 text-foreground/60 hover:text-foreground hover:bg-[#f5f5f5] transition-colors h-full flex items-center justify-center"
                  >
                    <Plus className="size-3" strokeWidth={2} />
                  </button>
                </div>
              </div>

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
                              className="size-8 shrink-0 rounded-full bg-transparent object-cover"
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

              {/* Stock Status */}
              {selectedVariant?.availableForSale && (
                <div className="mt-4 mb-2 flex items-center gap-2">
                  <div className="size-2 rounded-full bg-green-500 relative">
                    <div className="absolute inset-0 rounded-full bg-green-500 animate-ping opacity-75" />
                  </div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-green-700 dark:text-green-500">
                    In Stock &bull; Ready to dispatch
                  </span>
                </div>
              )}
              {selectedVariant && !selectedVariant.availableForSale && (
                <div className="mt-4 mb-2 flex items-center gap-2">
                  <div className="size-2 rounded-full bg-red-500" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-red-600">
                    Out of Stock
                  </span>
                </div>
              )}

              <div ref={purchaseSectionRef} className="mt-4 flex flex-col sm:flex-row gap-3 max-w-md">
                <Button
                  variant="secondary"
                  size="lg"
                  onClick={handleBuyNow}
                  disabled={isCartLoading || (!!selectedVariant && !selectedVariant.availableForSale)}
                  className="w-full sm:w-1/2 h-[52px] text-[13px] font-medium tracking-[0.1em] uppercase bg-secondary text-secondary-foreground hover:bg-secondary/80 border border-border/80 rounded-none shadow-none"
                >
                  {isCartLoading ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                  Add to Cart
                </Button>
                <Button
                  size="lg"
                  onClick={handleBuyNow}
                  disabled={isCartLoading || (!!selectedVariant && !selectedVariant.availableForSale)}
                  className="w-full sm:w-1/2 h-[52px] text-[13px] font-medium tracking-[0.1em] uppercase bg-foreground text-background hover:bg-foreground/90 rounded-none shadow-none"
                >
                  {isCartLoading ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                  {selectedVariant && !selectedVariant.availableForSale ? "Sold out" : "Buy Now"}
                </Button>
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

              
              {/* Zoom Lightbox */}
              {zoomOpen && (
                <div 
                  className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 backdrop-blur-sm"
                  role="dialog"
                  aria-modal="true"
                >
                  <button
                    onClick={() => setZoomOpen(false)}
                    className="absolute top-4 right-4 lg:top-8 lg:right-8 z-50 flex items-center justify-center size-12 rounded-full bg-secondary text-foreground hover:bg-secondary/80 transition-colors"
                    aria-label="Close zoom"
                  >
                    <X className="size-6" />
                  </button>
                  
                  <div className="relative w-full h-full max-w-[90vw] max-h-[90vh] flex items-center justify-center">
                    <img
                      src={activeMedia?.url ?? product.images[0]}
                      alt={activeMedia?.alt || `${product.name} - zoomed`}
                      className="w-full h-full object-contain"
                    />

                    {gallery.length > 1 && (
                      <>
                        <button
                          onClick={(e) => { e.stopPropagation(); prevImage(); }}
                          aria-label="Previous product image"
                          className="absolute left-0 lg:left-8 top-1/2 -translate-y-1/2 flex items-center justify-center size-12 lg:size-14 rounded-full bg-background border border-border text-foreground hover:bg-secondary transition-colors shadow-lg"
                        >
                          <ChevronLeft className="size-6 lg:size-8" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); nextImage(); }}
                          aria-label="Next product image"
                          className="absolute right-0 lg:right-8 top-1/2 -translate-y-1/2 flex items-center justify-center size-12 lg:size-14 rounded-full bg-background border border-border text-foreground hover:bg-secondary transition-colors shadow-lg"
                        >
                          <ChevronRight className="size-6 lg:size-8" />
                        </button>
                      </>
                    )}
                  </div>
                  
                  {/* Lightbox Thumbnails (Desktop only) */}
                  {gallery.length > 1 && (
                    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 hidden lg:flex gap-3 px-4 py-3 rounded-2xl bg-background border border-border shadow-xl">
                      {gallery.map((media, i) => (
                        <button
                          key={media.url + "-zoom"}
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setActiveImage(i); }}
                          className={cn(
                            "size-16 shrink-0 overflow-hidden rounded-lg border transition-all",
                            activeImage === i
                              ? "border-foreground ring-1 ring-foreground opacity-100"
                              : "border-border opacity-50 hover:opacity-100",
                          )}
                        >
                          <img src={media.url} alt="" className="h-full w-full object-contain p-1" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Trust Badges */}
              <div className="mt-8 grid grid-cols-3 border-t border-border/60 pt-6 pb-2 w-full">
                <div className="flex flex-col items-center justify-start text-center">
                  <ShieldCheck className="size-5 mb-1 text-foreground/70" />
                  <span className="text-[10px] leading-tight font-medium uppercase tracking-wider text-muted-foreground">Quality<br/>Assured</span>
                </div>
                <div className="flex flex-col items-center justify-start text-center">
                  <Lock className="size-5 mb-1 text-foreground/70" />
                  <span className="text-[10px] leading-tight font-medium uppercase tracking-wider text-muted-foreground">Secure<br/>Checkout</span>
                </div>
                {(product.name.toLowerCase().includes('dell') || product.name.toLowerCase().includes('logitech') || product.vendor?.toLowerCase() === 'dell' || product.vendor?.toLowerCase() === 'logitech' || product.tags?.some((t) => t.toLowerCase().includes('warranty'))) ? (
                  <div className="flex flex-col items-center justify-start text-center">
                    <Award className="size-5 mb-1 text-foreground/70" />
                    <span className="text-[10px] leading-tight font-medium uppercase tracking-wider text-muted-foreground">Official<br/>Warranty</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-start text-center">
                    <Truck className="size-5 mb-1 text-foreground/70" />
                    <span className="text-[10px] leading-tight font-medium uppercase tracking-wider text-muted-foreground">Fast<br/>Dispatch</span>
                  </div>
                )}
              </div>

              {/* Product Information Accordions */}
              <ProductInformation product={product} />
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
                quantity={quantity}
                trigger={<Button size="lg">Send Enquiry</Button>}
              />
            </div>
          </section>

          {/* Related */}
          {related.length > 0 ? (
            <section aria-labelledby="related-heading" className="mt-16 sm:mt-24 border-t border-border pt-16 sm:pt-20">
              <div className="text-center mb-10">
                <h2 id="related-heading" className="text-[14px] sm:text-[15px] font-semibold tracking-[0.1em] text-foreground uppercase">
                  Related Products
                </h2>
                <p className="mt-3 text-sm text-muted-foreground">
                  Explore more products you may like.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-x-5 gap-y-10 sm:gap-x-6 md:grid-cols-3 xl:grid-cols-4">
                {related.map((p) => (
                  <ProductCard key={p.slug} product={p} />
                ))}
              </div>
            </section>
          ) : null}
              </div>
      </main>
      <Footer />

      {/* Sticky Purchase Bar */}
      <div 
        className={cn(
          "fixed bottom-0 left-0 right-0 z-50 bg-background border-t border-border shadow-[0_-8px_30px_rgba(0,0,0,0.12)] transition-transform duration-300 ease-in-out",
          showStickyBar ? "translate-y-0" : "translate-y-full"
        )}
      >
        <div className="mx-auto w-full max-w-[1600px] px-5 sm:px-8 lg:px-12 py-3 lg:py-4">
          
          {/* Desktop layout */}
          <div className="hidden lg:flex w-full items-center justify-between gap-6">
            <div className="flex items-center gap-4 flex-1 min-w-0">
              <img src={activeMedia?.url ?? product.images[0]} className="size-12 shrink-0 rounded-md object-contain bg-secondary/30 border border-border p-0.5" alt="" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate text-foreground">{product.name}</p>
                <p className="text-sm font-medium text-muted-foreground">{displayPrice}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              {/* Sticky Bar Quantity Selector */}
              <div className="flex h-11 items-center rounded-md border border-border bg-background">
                <button
                  type="button"
                  onClick={() => handleQuantityChange(quantity - 1)}
                  className="flex h-full w-10 items-center justify-center text-muted-foreground hover:bg-secondary/50 hover:text-foreground transition-colors"
                >
                  <Minus className="size-3.5" strokeWidth={1.5} />
                </button>
                <div className="flex h-full w-12 items-center justify-center border-x border-border text-sm font-medium tabular-nums text-foreground">
                  {quantity}
                </div>
                <button
                  type="button"
                  onClick={() => handleQuantityChange(quantity + 1)}
                  className="flex h-full w-10 items-center justify-center text-muted-foreground hover:bg-secondary/50 hover:text-foreground transition-colors"
                >
                  <Plus className="size-3.5" strokeWidth={1.5} />
                </button>
              </div>

              {hasVariantChoice && (
                <div className="relative">
                  <select 
                    className="h-11 pl-3 pr-8 rounded-md border border-border bg-background text-sm appearance-none outline-none focus-visible:ring-1 focus-visible:ring-foreground w-[180px] xl:w-[220px]"
                    value={selectedVariantId ?? ""}
                    onChange={(e) => {
                      const v = variants.find(x => x.id === e.target.value);
                      if (v) selectVariant(v);
                    }}
                  >
                    {variants.map(v => (
                      <option key={v.id} value={v.id}>{v.title}</option>
                    ))}
                  </select>
                  <ChevronRight className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none rotate-90" />
                </div>
              )}
              <Button 
                onClick={handleBuyNow}
                disabled={isCartLoading || (!!selectedVariant && !selectedVariant.availableForSale)}
                className="h-11 w-[220px] xl:w-[280px] font-medium"
              >
                {isCartLoading ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                {selectedVariant && !selectedVariant.availableForSale ? "Sold out" : isItemInCart ? "View Cart" : "Add to Cart"}
              </Button>
            </div>
          </div>

          {/* Mobile layout */}
          <div className="flex flex-col lg:hidden w-full gap-2.5 py-0.5">
            <div className="flex items-center gap-3">
              <img src={activeMedia?.url ?? product.images[0]} className="size-10 shrink-0 rounded-md object-contain bg-secondary/30 border border-border p-0.5" alt="" />
              <div className="flex-1 min-w-0 flex items-center justify-between gap-3">
                <p className="text-sm font-medium truncate text-foreground">{product.name}</p>
                <p className="text-sm font-medium text-foreground shrink-0">{displayPrice}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 pl-[52px]">
              {/* Sticky Bar Quantity Selector Mobile */}
              <div className="flex h-10 items-center rounded-md border border-border bg-background shrink-0">
                <button
                  type="button"
                  onClick={() => handleQuantityChange(quantity - 1)}
                  className="flex h-full w-8 items-center justify-center text-muted-foreground hover:bg-secondary/50 hover:text-foreground transition-colors"
                >
                  <Minus className="size-3.5" strokeWidth={1.5} />
                </button>
                <div className="flex h-full w-10 items-center justify-center border-x border-border text-sm font-medium tabular-nums text-foreground">
                  {quantity}
                </div>
                <button
                  type="button"
                  onClick={() => handleQuantityChange(quantity + 1)}
                  className="flex h-full w-8 items-center justify-center text-muted-foreground hover:bg-secondary/50 hover:text-foreground transition-colors"
                >
                  <Plus className="size-3.5" strokeWidth={1.5} />
                </button>
              </div>

              {hasVariantChoice && (
                <div className="relative flex-1">
                  <select 
                    className="h-10 w-full pl-3 pr-8 rounded-md border border-border bg-background text-sm appearance-none outline-none focus-visible:ring-1 focus-visible:ring-foreground"
                    value={selectedVariantId ?? ""}
                    onChange={(e) => {
                      const v = variants.find(x => x.id === e.target.value);
                      if (v) selectVariant(v);
                    }}
                  >
                    {variants.map(v => (
                      <option key={v.id} value={v.id}>{v.title}</option>
                    ))}
                  </select>
                  <ChevronRight className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none rotate-90" />
                </div>
              )}
              <Button 
                onClick={handleBuyNow}
                disabled={isCartLoading || (!!selectedVariant && !selectedVariant.availableForSale)}
                className="h-10 flex-[1.5] font-medium"
              >
                {isCartLoading ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                {selectedVariant && !selectedVariant.availableForSale ? "Sold out" : isItemInCart ? "View Cart" : "Add"}
              </Button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
