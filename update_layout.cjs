const fs = require("fs");
let content = fs.readFileSync("src/routes/products.$slug.tsx", "utf8");

const infoStart = content.indexOf("{/* Information */}");
if (infoStart === -1) throw new Error("Could not find {/* Information */} marker");

const infoEnd = content.indexOf("</main>", infoStart);
if (infoEnd === -1) throw new Error("Could not find </main> marker");

const newInfoPanel = `{/* Information */}
            <div className="w-full min-w-0 max-w-full overflow-wrap-break-word flex flex-col pt-4 lg:pt-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                {product.vendor || product.category}
              </p>
              
              <h1 className="mt-4 text-3xl sm:text-4xl lg:text-[42px] font-light tracking-[0.1em] uppercase text-foreground leading-[1.15] text-balance">
                {product.name}
              </h1>
              
              {product.tags && product.tags.length > 0 && (
                <div className="mt-5 flex flex-wrap items-center gap-3">
                  <span className="text-[11px] font-medium tracking-[0.15em] text-muted-foreground uppercase">
                    {product.tags.slice(0, 5).join("   ")}
                  </span>
                </div>
              )}

              <hr className="my-8 border-border/60" />

              <div className="flex flex-wrap items-baseline gap-4">
                <p className="text-xl sm:text-2xl font-light tracking-widest text-destructive">
                  {displayPrice
                    ? \`\${!selectedVariant && product.startingPrice ? "From " : ""}\${displayPrice}\`
                    : "Price on enquiry"}
                </p>
                {showCompareAt ? (
                  <p className="text-sm font-light tracking-widest text-muted-foreground line-through">
                    {formatMoney(compareAmount * qtyMultiplier, currency)}
                  </p>
                ) : null}
              </div>
              
              <p className="mt-3 text-[13px] tracking-wide text-foreground/80 font-medium">
                Inclusive of all taxes
              </p>

              <hr className="my-8 border-border/60" />

              {/* Dynamic Variants */}
              {hasVariantChoice && node?.options && (
                <div className="mb-8 flex flex-wrap gap-x-8 gap-y-6">
                  {node.options.filter(o => o.name.toLowerCase() !== "title").map(option => (
                    <div key={option.name} className="flex flex-col gap-2 min-w-[120px]">
                      <p className="text-[13px] text-foreground/90 font-medium">{option.name}</p>
                      <div className="flex flex-wrap gap-2 mt-1">
                        {option.values.map(val => {
                          const isSelected = selectedVariant?.selectedOptions.find(o => o.name === option.name)?.value === val;
                          return (
                            <button
                              key={val}
                              type="button"
                              onClick={() => {
                                const currentSelections = selectedVariant ? Object.fromEntries(selectedVariant.selectedOptions.map(o => [o.name, o.value])) : {};
                                const newSelections = { ...currentSelections, [option.name]: val };
                                const newVariant = variants.find(v => 
                                  v.selectedOptions.every(o => newSelections[o.name] === o.value)
                                );
                                if (newVariant) selectVariant(newVariant);
                              }}
                              className={\`border px-4 py-2 text-[13px] transition-colors outline-none focus-visible:ring-1 \${isSelected ? 'border-foreground text-foreground bg-secondary/30' : 'border-border text-foreground/70 hover:border-foreground/40 bg-transparent'}\`}
                            >
                              {val}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Quantity */}
              {product.supportsQuantity ? (
                <div className="mb-8">
                  <div className="inline-flex h-11 items-center border border-border/80 bg-secondary/10">
                    <button
                      type="button"
                      aria-label="Decrease quantity"
                      onClick={() => setQuantity((q) => Math.max(min, q - step))}
                      className="px-5 text-foreground/60 hover:text-foreground transition-colors h-full"
                    >
                      <Minus className="size-3" strokeWidth={2} />
                    </button>
                    <input
                      type="number"
                      aria-label="Quantity"
                      value={quantity}
                      min={min}
                      onChange={(e) => setQuantity(Math.max(min, Number(e.target.value) || min))}
                      className="w-10 bg-transparent text-center text-sm font-medium tabular-nums outline-none"
                    />
                    <button
                      type="button"
                      aria-label="Increase quantity"
                      onClick={() => setQuantity((q) => q + step)}
                      className="px-5 text-foreground/60 hover:text-foreground transition-colors h-full"
                    >
                      <Plus className="size-3" strokeWidth={2} />
                    </button>
                  </div>
                </div>
              ) : null}

              {/* Actions */}
              <div ref={purchaseSectionRef} className="flex flex-col gap-3 max-w-md">
                <Button 
                  variant="outline"
                  size="lg" 
                  onClick={handleAdd}
                  disabled={isCartLoading || (!!selectedVariant && !selectedVariant.availableForSale)}
                  className="w-full h-[52px] text-[13px] font-medium tracking-[0.1em] uppercase border-border/80 hover:bg-secondary/40 rounded-none shadow-none"
                >
                  {isCartLoading ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                  Add to Cart
                </Button>
                
                <Button 
                  size="lg" 
                  onClick={handleBuyNow}
                  disabled={isCartLoading || (!!selectedVariant && !selectedVariant.availableForSale)}
                  className="w-full h-[52px] text-[13px] font-medium tracking-[0.1em] uppercase bg-black text-white hover:bg-black/90 rounded-none flex items-center justify-center gap-3 relative overflow-hidden"
                >
                  {isCartLoading ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                  {selectedVariant && !selectedVariant.availableForSale ? "Sold out" : "Buy Now"}
                  {selectedVariant?.availableForSale && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-90">
                      <ChevronRight className="size-5" />
                    </div>
                  )}
                </Button>
              </div>

              {/* Accordions */}
              <div className="mt-12 border-t border-border/60">
                <details className="group border-b border-border/60 py-5">
                  <summary className="flex cursor-pointer items-center justify-between text-[11px] font-medium tracking-[0.15em] uppercase text-foreground list-none outline-none focus-visible:ring-1">
                    Notes
                    <span className="text-muted-foreground group-open:hidden"><Plus className="size-4"/></span>
                    <span className="text-muted-foreground hidden group-open:inline"><Minus className="size-4"/></span>
                  </summary>
                  <div className="mt-5 text-[13px] leading-relaxed text-muted-foreground prose prose-sm max-w-none">
                    {product.descriptionHtml ? (
                      <div dangerouslySetInnerHTML={{ __html: product.descriptionHtml }} />
                    ) : (
                      <p>{product.summary}</p>
                    )}
                  </div>
                </details>
                
                <details className="group border-b border-border/60 py-5">
                  <summary className="flex cursor-pointer items-center justify-between text-[11px] font-medium tracking-[0.15em] uppercase text-foreground list-none outline-none focus-visible:ring-1">
                    Legal Information
                    <span className="text-muted-foreground group-open:hidden"><Plus className="size-4"/></span>
                    <span className="text-muted-foreground hidden group-open:inline"><Minus className="size-4"/></span>
                  </summary>
                  <div className="mt-5 text-[13px] leading-relaxed text-muted-foreground">
                    <p>Prices are inclusive of all taxes. For details on shipping and returns, please review our store policies.</p>
                  </div>
                </details>
              </div>
            </div>
          </div>
        </div>
      `;

content = content.substring(0, infoStart) + newInfoPanel + "\n" + content.substring(infoEnd);

fs.writeFileSync("src/routes/products.$slug.tsx", content);
console.log("Updated product panel layout.");
