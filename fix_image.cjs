const fs = require("fs");
let content = fs.readFileSync("src/routes/products.$slug.tsx", "utf8");

// 1. Fix Main Image sizing
content = content.replace(
  'className="max-w-full max-h-full object-contain mix-blend-multiply block" style={{ maxHeight: "1080px" }}',
  'className="w-full h-full object-contain mix-blend-multiply block" style={{ maxHeight: "1080px" }}'
);

// 2. Fix Thumbnail grid column width
content = content.replace(
  'lg:grid-cols-[96px_minmax(0,1fr)]',
  'lg:grid-cols-[80px_minmax(0,1fr)]'
);

// 3. Fix Thumbnail container width
content = content.replace(
  'lg:w-[96px]',
  'lg:w-[80px]'
);

// 4. Fix Thumbnail buttons sizing
content = content.replace(
  'lg:w-[96px] lg:h-[96px]',
  'lg:w-[80px] lg:h-[80px]'
);

fs.writeFileSync("src/routes/products.$slug.tsx", content);
console.log("Successfully updated main image and thumbnail sizes.");
