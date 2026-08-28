const fs = require("fs");
let content = fs.readFileSync("src/routes/products.$slug.tsx", "utf8");

// 1. Add Zoom imports and state
content = content.replace(
  'import { Minus, Plus, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";',
  'import { Minus, Plus, ChevronLeft, ChevronRight, Loader2, ZoomIn, X } from "lucide-react";'
);
content = content.replace(
  'const [customizerOpen, setCustomizerOpen] = useState(false);',
  'const [customizerOpen, setCustomizerOpen] = useState(false);\n  const [zoomOpen, setZoomOpen] = useState(false);'
);

// 2. Add Zoom Button
const arrowsEnd = `                  )}`;
const zoomButton = `
                  {/* Zoom Button */}
                  <button
                    onClick={() => setZoomOpen(true)}
                    aria-label="Zoom image"
                    className="absolute bottom-4 right-4 lg:bottom-6 lg:right-6 flex items-center justify-center size-10 lg:size-11 rounded-full bg-background/90 backdrop-blur border border-border text-foreground opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity hover:bg-background focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground shadow-sm"
                  >
                    <ZoomIn className="size-5" />
                  </button>`;

content = content.replace(
  /\{\/\* Arrows \*\/\}[\s\S]*?<\/>\n\s*\)}/,
  match => match + zoomButton
);

// 3. Add Lightbox at the end before Details
const lightbox = `
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
`;

content = content.replace(
  "{/* Details */}",
  lightbox + "\n              {/* Details */}"
);

fs.writeFileSync("src/routes/products.$slug.tsx", content);
console.log("Zoom functionality restored");
