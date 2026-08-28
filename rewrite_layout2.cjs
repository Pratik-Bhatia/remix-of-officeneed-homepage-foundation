const fs = require("fs");
let content = fs.readFileSync("src/routes/products.$slug.tsx", "utf8");

const startRegex = /return \(\s*<div className="min-h-screen bg-background">/;
const endRegex = /\{\/\* Zoom Lightbox \*\/\}/;

const matchStart = content.match(startRegex);
const matchEnd = content.match(endRegex);

if (!matchStart || !matchEnd) {
  console.log("Tokens not found", !!matchStart, !!matchEnd);
  process.exit(1);
}

const startIndex = matchStart.index;
const endIndex = matchEnd.index;

const replacement = `return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="w-full overflow-clip">
        <div className="mx-auto w-full max-w-[1600px] px-5 py-8 sm:px-8 sm:py-10 lg:px-12 lg:py-14">

          <div className="flex flex-col lg:grid lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] gap-10 lg:gap-12 xl:gap-16 items-start">
            {/* Gallery Wrapper (Sticky on desktop) */}
            <div className="w-full lg:sticky lg:top-[120px]">
              <div className="grid grid-cols-1 lg:grid-cols-[96px_minmax(0,1fr)] gap-4 lg:gap-5 w-full items-start">
                
                {/* Thumbnails */}
                {gallery.length > 1 && (
                  <div
                    role="group"
                    aria-label="Product thumbnails"
                    className="order-2 lg:order-1 flex lg:flex-col gap-3 w-full lg:w-[96px] overflow-x-auto lg:overflow-y-auto pb-2 lg:pb-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                  >
                    {gallery.map((media, i) => (
                      <button
                        key={media.url}
                        type="button"
                        onClick={() => setActiveImage(i)}
                        aria-label={media.alt || \`Show image \${i + 1} of \${gallery.length}\`}
                        aria-current={activeImage === i}
                        className={cn(
                          "w-20 h-20 sm:w-24 sm:h-24 lg:w-[96px] lg:h-[96px] shrink-0 overflow-hidden rounded-xl border bg-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground",
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
                )}
                
                {/* Main Image */}
                <div className="order-1 lg:order-2 w-full max-w-[1080px] aspect-square relative overflow-hidden rounded-2xl bg-secondary/30 border border-border/50 group flex items-center justify-center p-4 sm:p-8">
                  <img
                    src={activeMedia?.url ?? product.images[0]}
                    alt={activeMedia?.alt || \`\${product.name} - image \${activeImage + 1}\`}
                    className="w-full h-full object-contain mix-blend-multiply block"
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
            <div className="w-full min-w-0">
              <p className="text-eyebrow text-muted-foreground">{product.category}</p>
              <h1 className="mt-2 text-3xl md:text-4xl lg:text-[40px] font-semibold tracking-tight text-foreground leading-[1.1] text-balance">{product.name}</h1>
              
              <div className="mt-4 space-y-3">
                <p className="text-sm leading-relaxed text-muted-foreground sm:text-base">
                  {product.summary}
                </p>

                <div className="flex flex-wrap items-baseline gap-3">
                  <p className="text-xl font-medium tabular-nums text-foreground">
                    {displayPrice
                      ? \`\${!selectedVariant && product.startingPrice ? "From " : ""}\${displayPrice}\`
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
                    Quantity{min > 1 ? \` (minimum \${min})\` : ""}
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
                      <span className="ml-1 text-muted-foreground">?" {selectedVariant.title}</span>
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

              `;

const newContent = content.substring(0, startIndex) + replacement + content.substring(endIndex);

fs.writeFileSync("src/routes/products.$slug.tsx", newContent);
