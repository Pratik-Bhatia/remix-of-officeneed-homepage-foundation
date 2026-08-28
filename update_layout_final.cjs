const fs = require("fs");
let c = fs.readFileSync("src/components/officeneed/InteractiveGiftShowcase.tsx", "utf8");

// 1. Section Header sizing
c = c.replace(
  '<h2 className="text-section mt-3 text-balance sm:mt-4">',
  '<h2 className="mt-2 text-balance font-display text-4xl font-semibold leading-[1.05] tracking-tight sm:mt-3 sm:text-5xl lg:text-[52px]">'
);

// 2. HamperCard widths and image heights
c = c.replace(
  '"w-[86vw] sm:w-[70vw] lg:w-[54rem]"',
  '"w-[86vw] sm:w-[70vw] lg:w-[58vw] xl:w-[54rem]"'
);
c = c.replace(
  'sizes="(min-width: 1024px) 54rem, 86vw"',
  'sizes="(min-width: 1024px) 58vw, 86vw"'
);
c = c.replace(
  'className="aspect-4/3 h-auto w-full object-cover transition-transform duration-700 ease-out"',
  'className="h-[60vh] sm:h-[55vh] lg:h-[48vh] w-full object-cover transition-transform duration-700 ease-out"'
);

// 3. HamperCard info spacing
c = c.replace(
  'className="mt-5 flex items-start justify-between gap-6"',
  'className="mt-3 sm:mt-4 flex items-start justify-between gap-6"'
);
c = c.replace(
  '<p className="mt-1 text-xs leading-relaxed text-muted-foreground sm:text-sm">',
  '<p className="mt-1.5 text-xs leading-[1.4] text-muted-foreground sm:text-sm">'
);

// 4. Carousel arrows positioning & removal from header
c = c.replace(
  /(\s*)<div className="hidden shrink-0 items-center gap-3 sm:flex">\s*<button[\s\S]*?<\/button>\s*<\/div>/,
  ''
);

c = c.replace(
  'className="-mx-5 mt-8 flex snap-x snap-mandatory',
  'className="-mx-5 mt-6 flex snap-x snap-mandatory'
);
c = c.replace(
  'sm:mt-10 sm:gap-8',
  'sm:mt-8 sm:gap-8'
);

c = c.replace(
  /<div ref=\{sectionRef\}>/,
  `<div ref={sectionRef} className="relative">`
);

// Add arrows outside the scroller, and bundle the indicators with the text
c = c.replace(
  /(\s*)<div className="mt-6 flex items-center justify-center gap-2">\s*\{giftHampers\.map\(\(h, i\) => \(\s*<span\s*key=\{h\.id\}\s*aria-hidden="true"\s*className=\{cn\(\s*"h-1 rounded-full bg-foreground transition-all duration-300",\s*i === activeIndex \? "w-8 opacity-100" : "w-3 opacity-25",\s*\)\}\s*\/>\s*\)\)\}\s*<\/div>\s*<p className="mt-4 text-center text-xs text-muted-foreground">\s*Hover or tap a marker to explore the products\.\s*<\/p>/,
  `$1<div className="pointer-events-none absolute inset-y-0 left-0 right-0 hidden items-center justify-between px-4 lg:flex xl:px-8">
        <button
          type="button"
          onClick={() => scrollBy(-1)}
          aria-label="Previous hamper"
          className="pointer-events-auto grid size-11 place-items-center rounded-full border border-border bg-background shadow-[0_4px_14px_-6px_rgb(0_0_0_/_0.2)] transition-colors duration-200 hover:bg-secondary"
        >
          <ChevronLeft className="size-5" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => scrollBy(1)}
          aria-label="Next hamper"
          className="pointer-events-auto grid size-11 place-items-center rounded-full border border-border bg-background shadow-[0_4px_14px_-6px_rgb(0_0_0_/_0.2)] transition-colors duration-200 hover:bg-secondary"
        >
          <ChevronRight className="size-5" aria-hidden="true" />
        </button>
      </div>

      <div className="mt-4 flex flex-col items-center justify-center gap-2 sm:mt-5 sm:flex-row sm:gap-4">
        <div className="flex items-center gap-1.5">
          {giftHampers.map((h, i) => (
            <span
              key={h.id}
              aria-hidden="true"
              className={cn(
                "h-1 rounded-full bg-foreground transition-all duration-300",
                i === activeIndex ? "w-8 opacity-100" : "w-3 opacity-25",
              )}
            />
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground sm:text-xs">
          Hover or tap a marker to explore the products.
        </p>
      </div>`
);

// 6. Section CTA
c = c.replace(
  'className="mx-auto mt-12 max-w-xl border-t border-border pt-8 text-center sm:mt-14 sm:pt-10"',
  'className="mx-auto mt-8 max-w-xl text-center sm:mt-10"'
);
// Add the small line instead of full border top
c = c.replace(
  '<h3 className="font-display text-lg font-semibold tracking-tight">',
  '<div className="mx-auto mb-6 h-px w-12 bg-border sm:mb-8" />\n      <h3 className="font-display text-xl font-semibold tracking-tight sm:text-2xl">'
);
c = c.replace(
  '<p className="mt-3 text-xs leading-relaxed text-muted-foreground sm:text-sm">',
  '<p className="mt-2 text-sm leading-relaxed text-muted-foreground sm:text-base">'
);
c = c.replace(
  'className="mt-6 inline-flex min-h-11 items-center justify-center rounded-full border border-foreground/20 px-6 text-xs font-medium transition-colors duration-200 hover:border-foreground/40 hover:bg-secondary sm:text-sm"',
  'className="mt-5 inline-flex h-11 items-center justify-center rounded-full border border-foreground/20 bg-transparent px-6 text-sm font-medium transition-colors duration-200 hover:border-foreground/40 hover:bg-secondary sm:h-12 sm:px-8"'
);

// 7. Overall Section wrapper
c = c.replace(
  'className="w-full overflow-hidden bg-background py-14 sm:py-16 lg:py-20"',
  'className="w-full overflow-hidden bg-background py-8 sm:py-10 lg:py-12"'
);

fs.writeFileSync("src/components/officeneed/InteractiveGiftShowcase.tsx", c);
