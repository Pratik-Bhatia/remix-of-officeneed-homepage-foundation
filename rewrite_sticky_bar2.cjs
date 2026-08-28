const fs = require("fs");
let content = fs.readFileSync("src/routes/products.$slug.tsx", "utf8");

const stickyBar = `
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
                {selectedVariant && !selectedVariant.availableForSale ? "Sold out" : "Add to Cart"}
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
                {selectedVariant && !selectedVariant.availableForSale ? "Sold out" : "Add"}
              </Button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
`;

const replaceRegex = /<\/div>\s*<\/main>\s*<Footer \/>\s*<\/div>\s*\);\s*}\s*$/;

if (replaceRegex.test(content)) {
  content = content.replace(replaceRegex, `      </div>\n      </main>\n      <Footer />\n${stickyBar}`);
  fs.writeFileSync("src/routes/products.$slug.tsx", content);
  console.log("Sticky bar added successfully");
} else {
  console.log("Could not find the end of the file");
  process.exit(1);
}
