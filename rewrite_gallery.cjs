const fs = require("fs");
let content = fs.readFileSync("src/routes/products.$slug.tsx", "utf8");

// We need to replace the entire Gallery Wrapper and Information Wrapper.
// Let's use a simpler substring replace for the gallery markup.

const galleryOld = `<div className="flex flex-col lg:flex-row gap-4">
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
                        aria-label={media.alt || \`Show image \${i + 1} of \${gallery.length}\`}
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
                <div className="order-1 lg:order-2 flex-1 relative overflow-hidden rounded-2xl bg-secondary group aspect-square flex items-center justify-center p-4 sm:p-8">
                  <img
                    src={activeMedia?.url ?? product.images[0]}
                    alt={activeMedia?.alt || \`\${product.name} - image \${activeImage + 1}\`}
                    className="w-full h-full object-contain"
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
              </div>`;

const galleryNew = `<div className="flex flex-col lg:flex-row gap-4">
                {/* Thumbnails */}
                {gallery.length > 1 && (
                  <div
                    role="group"
                    aria-label="Product thumbnails"
                    className="order-2 lg:order-1 flex lg:flex-col gap-3 overflow-x-auto lg:overflow-y-auto pb-2 lg:pb-0 lg:pr-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:max-h-[75vh]"
                  >
                    {gallery.map((media, i) => (
                      <button
                        key={media.url}
                        type="button"
                        onClick={() => setActiveImage(i)}
                        aria-label={media.alt || \`Show image \${i + 1} of \${gallery.length}\`}
                        aria-current={activeImage === i}
                        className={cn(
                          "size-20 sm:size-24 lg:w-20 lg:h-[106px] xl:w-24 xl:h-[128px] shrink-0 overflow-hidden rounded-xl border bg-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground",
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
                <div className="order-1 lg:order-2 flex-1 relative overflow-hidden rounded-2xl bg-secondary/30 border border-border/50 group aspect-square lg:aspect-[4/5] xl:aspect-square flex items-center justify-center p-4 sm:p-8">
                  <img
                    src={activeMedia?.url ?? product.images[0]}
                    alt={activeMedia?.alt || \`\${product.name} - image \${activeImage + 1}\`}
                    className="w-full h-full object-contain mix-blend-multiply"
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
              </div>`;

content = content.replace(galleryOld, galleryNew);

fs.writeFileSync("src/routes/products.$slug.tsx", content);
