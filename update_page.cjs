const fs = require("fs");
let content = fs.readFileSync("src/routes/products.$slug.tsx", "utf8");

// Import the new component
if (!content.includes("ProductInformation")) {
  content = content.replace(
    'import { ProductCard } from "@/components/officeneed/ProductCard";',
    `import { ProductCard } from "@/components/officeneed/ProductCard";\nimport { ProductInformation } from "@/components/officeneed/ProductInformation";`
  );
}

// Replace the old accordions with the new component
const oldAccordions = `              {/* Accordions */}
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
              </div>`;

if (content.includes(oldAccordions)) {
  content = content.replace(oldAccordions, `<ProductInformation product={product} />`);
  fs.writeFileSync("src/routes/products.$slug.tsx", content);
  console.log("Updated products.$slug.tsx to use ProductInformation component.");
} else {
  console.error("Could not find old accordions to replace.");
}
