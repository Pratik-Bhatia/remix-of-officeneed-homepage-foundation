import { Plus, Minus } from "lucide-react";
import type { Product } from "@/lib/products";

export function ProductInformation({ product }: { product: Product }) {
  const sections: { title: string; content: React.ReactNode }[] = [];

  // 1. DESCRIPTION
  if (product.descriptionHtml || product.description) {
    sections.push({
      title: "DESCRIPTION",
      content: (
        <div 
          className="prose prose-sm max-w-none text-muted-foreground" 
          dangerouslySetInnerHTML={{ __html: product.descriptionHtml || `<p>${product.description}</p>` }} 
        />
      ),
    });
  }

  // 2. PRODUCT DETAILS & SPECIFICATIONS
  if (product.specifications && product.specifications.length > 0) {
    sections.push({
      title: "PRODUCT DETAILS",
      content: (
        <div className="grid grid-cols-1 gap-y-3 text-[13px]">
          {product.specifications.map(spec => (
            <div key={spec.label} className="flex justify-between border-b border-border/40 pb-2">
              <span className="text-foreground/80">{spec.label}</span>
              <span className="font-medium text-foreground text-right">{spec.value}</span>
            </div>
          ))}
        </div>
      ),
    });
  }

  // 3. FRAGRANCE NOTES
  if (product.fragranceNotes) {
    sections.push({
      title: "FRAGRANCE NOTES",
      content: (
        <div className="grid grid-cols-1 gap-y-3 text-[13px]">
          {product.fragranceNotes.top && (
            <div className="flex justify-between border-b border-border/40 pb-2">
              <span className="text-foreground/80">Top Notes</span>
              <span className="font-medium text-foreground text-right">{product.fragranceNotes.top}</span>
            </div>
          )}
          {product.fragranceNotes.heart && (
            <div className="flex justify-between border-b border-border/40 pb-2">
              <span className="text-foreground/80">Heart Notes</span>
              <span className="font-medium text-foreground text-right">{product.fragranceNotes.heart}</span>
            </div>
          )}
          {product.fragranceNotes.base && (
            <div className="flex justify-between border-b border-border/40 pb-2">
              <span className="text-foreground/80">Base Notes</span>
              <span className="font-medium text-foreground text-right">{product.fragranceNotes.base}</span>
            </div>
          )}
        </div>
      ),
    });
  }

  // 4. KEY FEATURES
  if (product.features && product.features.length > 0) {
    sections.push({
      title: "KEY FEATURES",
      content: (
        <ul className="list-disc pl-5 space-y-2 text-[13px] text-muted-foreground leading-relaxed">
          {product.features.map(feature => (
            <li key={feature} dangerouslySetInnerHTML={{ __html: feature }} />
          ))}
        </ul>
      ),
    });
  }

  // 5. MATERIALS & DIMENSIONS
  if (product.materials || product.dimensions) {
    sections.push({
      title: "MATERIALS & DIMENSIONS",
      content: (
        <div className="grid grid-cols-1 gap-y-3 text-[13px]">
          {product.materials && (
            <div className="flex justify-between border-b border-border/40 pb-2">
              <span className="text-foreground/80">Materials</span>
              <span className="font-medium text-foreground text-right">{product.materials.join(", ")}</span>
            </div>
          )}
          {product.dimensions && (
            <div className="flex justify-between border-b border-border/40 pb-2">
              <span className="text-foreground/80">Dimensions</span>
              <span className="font-medium text-foreground text-right">{product.dimensions}</span>
            </div>
          )}
        </div>
      ),
    });
  }

  // 6. WHAT'S INCLUDED
  if (product.whatsIncluded && product.whatsIncluded.length > 0) {
    sections.push({
      title: "WHAT'S INCLUDED",
      content: (
        <ul className="list-disc pl-5 space-y-2 text-[13px] text-muted-foreground leading-relaxed">
          {product.whatsIncluded.map(item => (
            <li key={item} dangerouslySetInnerHTML={{ __html: item }} />
          ))}
        </ul>
      ),
    });
  }

  // 7. CUSTOM SECTIONS (from Metafields)
  if (product.customSections) {
    product.customSections.forEach(section => {
      sections.push({
        title: section.title.toUpperCase(),
        content: (
          <div 
            className="prose prose-sm max-w-none text-muted-foreground text-[13px] leading-relaxed" 
            dangerouslySetInnerHTML={{ __html: section.contentHtml }} 
          />
        ),
      });
    });
  }

  // 8. DELIVERY & RETURNS
  sections.push({
    title: "DELIVERY & RETURNS",
    content: (
      <div className="text-[13px] leading-relaxed text-muted-foreground space-y-3">
        <p className="font-semibold text-foreground">No Returns or Refunds</p>
        <p>All sales are final. Products cannot be returned or exchanged, and refunds are not provided after purchase. Every item undergoes rigorous quality checks before dispatch to ensure B2B premium standards.</p>
      </div>
    ),
  });

  return (
    <div className="mt-12 border-t border-border/60">
      {sections.map((section, idx) => (
        <details key={idx} className="group border-b border-border/60 py-5" open={idx === 0}>
          <summary className="flex cursor-pointer items-center justify-between text-[11px] font-medium tracking-[0.15em] uppercase text-foreground list-none outline-none focus-visible:ring-1">
            {section.title}
            <span className="text-muted-foreground group-open:hidden">
              <Plus className="size-4" />
            </span>
            <span className="text-muted-foreground hidden group-open:inline">
              <Minus className="size-4" />
            </span>
          </summary>
          <div className="mt-5">
            {section.content}
          </div>
        </details>
      ))}
    </div>
  );
}
