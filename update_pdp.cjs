const fs = require("fs");
const path = "src/routes/products.$slug.tsx";
let text = fs.readFileSync(path, "utf8");

// Fix h1 sizing
const oldH1 = 'className="mt-4 text-3xl sm:text-4xl lg:text-[42px] font-light tracking-[0.1em] uppercase text-foreground leading-[1.15] text-balance"';
const newH1 = 'className="mt-2 text-xl md:text-2xl lg:text-3xl font-semibold tracking-tight text-foreground leading-[1.15] text-balance"';
text = text.replace(oldH1, newH1);

// Fix gap above h1 (from mt-5 to mt-3) - Wait, tags are BELOW h1
const oldTagsDiv = 'className="mt-5 flex flex-wrap items-center gap-3"';
const newTagsDiv = 'className="mt-3 flex flex-wrap items-center gap-3"';
text = text.replace(oldTagsDiv, newTagsDiv);

// Reduce my-8 horizontal rules to my-5 to close up vertical spacing
text = text.replace(/className="my-8 border-border\/60"/g, 'className="my-5 border-border/60"');
text = text.replace(/className="my-10 border-border\/60"/g, 'className="my-6 border-border/60"');

// Ensure the Buy Box has tighter margin above if needed.
// Wait, the action buttons are:
// <div ref={purchaseSectionRef} className="flex flex-col gap-3 max-w-md mt-6"> ?
// It actually says: <div ref={purchaseSectionRef} className="flex flex-col gap-3 max-w-md">

fs.writeFileSync(path, text);
console.log("Updated products.$slug.tsx spacing and typography");
