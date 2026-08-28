const fs = require("fs");
let content = fs.readFileSync("src/components/officeneed/InteractiveGiftShowcase.tsx", "utf8");

// 1. Update SectionHeader
content = content.replace(
  /<h2 className="text-section mt-3 text-balance sm:mt-4">/g,
  `<h2 className="mt-2 text-balance font-display text-4xl font-semibold leading-[1.05] tracking-tight sm:mt-3 sm:text-5xl lg:text-[52px]">`
);

// 2. HamperCard - Image Aspect and Height
content = content.replace(
  /w-\[86vw\] sm:w-\[70vw\] lg:w-\[54rem\]/g,
  `w-[86vw] sm:w-[70vw] lg:w-[58vw] xl:w-[54rem]`
);

content = content.replace(
  /sizes="\(min-width: 1024px\) 54rem, 86vw"\n\s*className="aspect-4\/3 h-auto w-full object-cover transition-transform duration-700 ease-out"/g,
  `sizes="(min-width: 1024px) 58vw, 86vw"\n          className="h-[60vh] sm:h-[55vh] lg:h-[48vh] w-full object-cover transition-transform duration-700 ease-out"`
);

// 3. HamperCard - Product info spacing
content = content.replace(
  /className="mt-5 flex items-start justify-between gap-6"/g,
  `className="mt-3 sm:mt-4 flex items-start justify-between gap-6"`
);
content = content.replace(
  /<p className="mt-1 text-xs leading-relaxed text-muted-foreground sm:text-sm">/g,
  `<p className="mt-1.5 text-xs leading-[1.4] text-muted-foreground sm:text-sm">`
);

// 4. HamperCarousel - Arrows positioning and layout
content = content.replace(
  /<div className="flex items-end justify-between gap-6">\n\s*<div id="corporate-gifting-heading">\n\s*<SectionHeader \/>\n\s*<\/div>\n\s*<div className="hidden shrink-0 items-center gap-3 sm:flex">\n\s*<button[\s\S]*?<\/button>\n\s*<\/div>\n\s*<\/div>/g,
  `<div id="corporate-gifting-heading">
        <SectionHeader />
      </div>`
);

content = content.replace(
  /className="-mx-5 mt-8 flex snap-x snap-mandatory gap-6 overflow-x-auto px-5 pb-4 sm:-mx-8 sm:mt-10 sm:gap-8 sm:px-8 lg:-mx-12 lg:px-12 \[scrollbar-width:none\] \[\&::-webkit-scrollbar\]:hidden"/g,
  `className="-mx-5 mt-6 flex snap-x snap-mandatory gap-6 overflow-x-auto px-5 pb-4 sm:-mx-8 sm:mt-8 sm:gap-8 sm:px-8 lg:-mx-12 lg:px-12 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"`
);

content = content.replace(
  /<\/div>\n\n\s*<div className="mt-6 flex items-center justify-center gap-2">/g,
  `</div>

      <div className="pointer-events-none absolute inset-y-0 left-0 right-0 hidden items-center justify-between px-4 lg:flex xl:px-8">
        <button
          type="button"
          onClick={() => scrollBy(-1)}
          aria-label="Previous hamper"
          className="pointer-events-auto grid size-11 place-items-center rounded-full border border-border bg-background shadow-md transition-colors duration-200 hover:bg-secondary"
        >
          <ChevronLeft className="size-5" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => scrollBy(1)}
          aria-label="Next hamper"
          className="pointer-events-auto grid size-11 place-items-center rounded-full border border-border bg-background shadow-md transition-colors duration-200 hover:bg-secondary"
        >
          <ChevronRight className="size-5" aria-hidden="true" />
        </button>
      </div>

      <div className="mt-4 flex flex-col items-center justify-center gap-2 sm:mt-5 sm:flex-row sm:gap-4">
        <div className="flex items-center gap-1.5">`
);

content = content.replace(
  /w-8 opacity-100" : "w-3 opacity-25",\n\s*\)\}\n\s*\/>\n\s*\)\)}\n\s*<\/div>\n\n\s*<p className="mt-4 text-center text-xs text-muted-foreground">\n\s*Hover or tap a marker to explore the products\.\n\s*<\/p>/g,
  `w-8 opacity-100" : "w-3 opacity-25",
            )}
          />
        ))}
        </div>
        <p className="text-[11px] sm:text-xs text-muted-foreground">
          Hover or tap a marker to explore the products.
        </p>
      </div>`
);

content = content.replace(
  /<div ref=\{sectionRef\}>/g,
  `<div ref={sectionRef} className="relative">`
);

// 6. SectionCTA
content = content.replace(
  /<div className="mx-auto mt-12 max-w-xl border-t border-border pt-8 text-center sm:mt-14 sm:pt-10">/g,
  `<div className="mx-auto mt-8 max-w-xl text-center sm:mt-10">
      <div className="mx-auto mb-6 h-px w-12 bg-border sm:mb-8" />`
);
content = content.replace(
  /<h3 className="font-display text-lg font-semibold tracking-tight">/g,
  `<h3 className="font-display text-xl font-semibold tracking-tight sm:text-2xl">`
);
content = content.replace(
  /<p className="mt-3 text-xs leading-relaxed text-muted-foreground sm:text-sm">/g,
  `<p className="mt-2 text-sm leading-relaxed text-muted-foreground sm:text-base">`
);
content = content.replace(
  /className="mt-6 inline-flex min-h-11 items-center justify-center rounded-full border border-foreground\/20 px-6 text-xs font-medium transition-colors duration-200 hover:border-foreground\/40 hover:bg-secondary sm:text-sm"/g,
  `className="mt-5 inline-flex h-11 items-center justify-center rounded-full border border-foreground/20 bg-transparent px-6 text-sm font-medium transition-colors duration-200 hover:border-foreground/40 hover:bg-secondary sm:h-12 sm:px-8"`
);

// 7. Overall Section wrapper
content = content.replace(
  /className="w-full overflow-hidden bg-background py-14 sm:py-16 lg:py-20"/g,
  `className="w-full overflow-hidden bg-background py-8 sm:py-10 lg:py-12"`
);

fs.writeFileSync("src/components/officeneed/InteractiveGiftShowcase.tsx", content);
