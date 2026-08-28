const fs = require("fs");
let content = fs.readFileSync("src/components/officeneed/InteractiveGiftShowcase.tsx", "utf8");

// Image Aspect and Height
content = content.replace(
  /className="aspect-4\/3 h-auto w-full object-cover transition-transform duration-700 ease-out"/g,
  `className="h-[60vh] sm:h-[55vh] lg:h-[48vh] w-full object-cover transition-transform duration-700 ease-out"`
);

// Arrows
content = content.replace(
  /<div className="hidden shrink-0 items-center gap-3 sm:flex">[\s\S]*?<\/div>\n\s*<\/div>/g,
  `</div>`
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
        <p className="text-[11px] text-muted-foreground sm:text-xs">
          Hover or tap a marker to explore the products.
        </p>
      </div>`
);

fs.writeFileSync("src/components/officeneed/InteractiveGiftShowcase.tsx", content);
