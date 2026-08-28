const fs = require("fs");
let content = fs.readFileSync("src/routes/products.$slug.tsx", "utf8");

// 1. Add new icons to import
content = content.replace(
  'import { Minus, Plus, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";',
  'import { Minus, Plus, ChevronLeft, ChevronRight, Loader2, ZoomIn, X } from "lucide-react";'
);

// 2. Add Zoom State
content = content.replace(
  'const [customizerOpen, setCustomizerOpen] = useState(false);',
  'const [customizerOpen, setCustomizerOpen] = useState(false);\n  const [zoomOpen, setZoomOpen] = useState(false);'
);

// 3. Change the overall layout from 50/50 grid to 58/42 flex layout
content = content.replace(
  '<div className="grid gap-10 lg:grid-cols-2 lg:gap-16">',
  '<div className="flex flex-col lg:flex-row gap-10 lg:gap-14 xl:gap-16">\n            {/* Gallery Wrapper (Sticky on desktop) */}'
);

content = content.replace(
  '<div className="lg:sticky lg:top-[120px] self-start">',
  '<div className="w-full lg:w-[56%] xl:w-[58%] lg:sticky lg:top-[120px] self-start">'
);

// 4. Update the Gallery markup (Thumbnails + Main Image)
content = content.replace(
  /<div className="flex flex-col lg:flex-row gap-4">[\s\S]*?<\/div>\n\s*<\/div>\n\s*<\/div>\n\n\s*\{\/\* Information \*\/\}/,
  `<div className="flex flex-col lg:flex-row gap-4">
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
                          "size-20 sm:size-24 lg:w-20 lg:h-[106px] xl:w-24 xl:h-32 shrink-0 overflow-hidden rounded-xl border bg-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground",
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
              </div>
            </div>

            {/* Information */}
            <div className="w-full lg:flex-1 lg:pl-4 xl:pl-6">`
);

// 5. Update Information block (typography and layout)
content = content.replace(
  '<h1 className="mt-2 text-2xl md:text-3xl font-light tracking-tight text-foreground leading-tight">{product.name}</h1>',
  '<h1 className="mt-2 text-3xl md:text-4xl lg:text-[40px] font-semibold tracking-tight text-foreground leading-[1.1] text-balance">{product.name}</h1>'
);

// 6. Fix variant button background (for pattern thumbnails)
content = content.replace(
  'className="size-8 shrink-0 rounded-full bg-secondary object-cover"',
  'className="size-8 shrink-0 rounded-full bg-transparent object-cover"'
);

// 7. Render Zoom Lightbox at the very bottom
content = content.replace(
  '{/* Details */}',
  `{/* Zoom Lightbox */}
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
                      alt={activeMedia?.alt || \`\${product.name} - zoomed\`}
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

              {/* Details */}`
);

fs.writeFileSync("src/routes/products.$slug.tsx", content);
