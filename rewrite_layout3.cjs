const fs = require("fs");
let content = fs.readFileSync("src/routes/products.$slug.tsx", "utf8");

// Remove breadcrumbs
content = content.replace(
  /<nav aria-label="Breadcrumb" className="mb-6">[\s\S]*?<\/nav>/,
  ""
);

// Update outer grid
content = content.replace(
  '<div className="grid gap-10 lg:grid-cols-2 lg:gap-16">',
  '<div className="flex flex-col lg:grid lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] gap-10 lg:gap-12 xl:gap-16 items-start">'
);

// Replace gallery and right column wrapper
const galleryRegex = /<div className="lg:sticky lg:top-\[120px\] self-start">[\s\S]*?\{\/\* Information \*\/\}\n\s*<div>/;

if (!galleryRegex.test(content)) {
  console.log("Gallery regex did not match!");
  process.exit(1);
}

const replacement = `<div className="w-full lg:sticky lg:top-[120px]">
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
                </div>
              </div>
            </div>

            {/* Information */}
            <div className="w-full min-w-0">`;

content = content.replace(galleryRegex, replacement);

// Update title style
content = content.replace(
  '<h1 className="mt-2 text-2xl md:text-3xl font-light tracking-tight text-foreground leading-tight">{product.name}</h1>',
  '<h1 className="mt-2 text-3xl md:text-4xl lg:text-[40px] font-semibold tracking-tight text-foreground leading-[1.1] text-balance">{product.name}</h1>'
);

// Fix transparent variant backgrounds
content = content.replace(
  'className="size-8 shrink-0 rounded-full bg-secondary object-cover"',
  'className="size-8 shrink-0 rounded-full bg-transparent object-cover"'
);

fs.writeFileSync("src/routes/products.$slug.tsx", content);
console.log("Success");
