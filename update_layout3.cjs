const fs = require("fs");
let content = fs.readFileSync("src/components/officeneed/InteractiveGiftShowcase.tsx", "utf8");

content = content.replace(
  /<div id="corporate-gifting-heading">\s*<SectionHeader \/>\s*<\/div>\s*<div className="hidden shrink-0 items-center gap-3 sm:flex">[\s\S]*?<ChevronRight className="size-4" aria-hidden="true" \/>\s*<\/button>\s*<\/div>/,
  `<div id="corporate-gifting-heading">
          <SectionHeader />
        </div>`
);

content = content.replace(
  /<div className="mt-6 flex items-center justify-center gap-2">\s*\{giftHampers\.map\(\(h, i\) => \([\s\S]*?<p className="mt-4 text-center text-xs text-muted-foreground">\s*Hover or tap a marker to explore the products\.\s*<\/p>/,
  `</div>

      <div className="pointer-events-none absolute inset-y-0 left-0 right-0 hidden items-center justify-between px-4 lg:flex xl:px-8">
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
        </p>`
);

fs.writeFileSync("src/components/officeneed/InteractiveGiftShowcase.tsx", content);
