const fs = require("fs");
let content = fs.readFileSync("src/routes/products.$slug.tsx", "utf8");

// 1. Fix the main layout grid
content = content.replace(
  'lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] gap-8 lg:gap-12 items-start',
  'lg:grid-cols-[minmax(0,1.15fr)_minmax(min(420px,100%),0.85fr)] gap-8 lg:gap-12 items-start w-full'
);

content = content.replace(
  '<div className="w-full lg:sticky lg:top-[120px]">',
  '<div className="w-full min-w-0 max-w-full lg:sticky lg:top-[120px]">'
);

content = content.replace(
  '<div className="w-full min-w-0">',
  '<div className="w-full min-w-0 max-w-full overflow-wrap-break-word">'
);

// 2. Remove the condition that hides the thumbnail column
content = content.replace(
  '{gallery.length > 1 && (',
  ''
);

// We need to find the closing )} of the thumbnail block.
// It's located right before {/* Main Image */}
const mainImageComment = "{/* Main Image */}";
const thumbEnd = ")}";

const imgIdx = content.indexOf(mainImageComment);
const thumbEndIdx = content.lastIndexOf(thumbEnd, imgIdx);

if (imgIdx !== -1 && thumbEndIdx !== -1) {
  content = content.substring(0, thumbEndIdx) + content.substring(thumbEndIdx + 2);
} else {
  console.log("Could not find thumbnail block end");
  process.exit(1);
}

// 3. Update Main Image container sizing to be fully constrained
// Current: w-full max-w-[1080px] aspect-square relative overflow-hidden rounded-2xl
content = content.replace(
  'aspect-square relative overflow-hidden rounded-2xl',
  'aspect-square lg:aspect-auto lg:h-[calc(100vh-200px)] lg:max-h-[1080px] relative overflow-hidden rounded-2xl'
);

// Update Main Image img tag sizing
// Current: w-full h-full object-contain mix-blend-multiply block
content = content.replace(
  'className="w-full h-full object-contain mix-blend-multiply block"',
  'className="max-w-full max-h-full object-contain mix-blend-multiply block" style={{ maxHeight: "1080px" }}'
);

fs.writeFileSync("src/routes/products.$slug.tsx", content);
console.log("Successfully fixed gallery layout");
