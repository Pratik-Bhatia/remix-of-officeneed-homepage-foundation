const fs = require("fs");
let content = fs.readFileSync("src/components/officeneed/ProductCard.tsx", "utf8");

content = content.replace(
  'className="relative aspect-4/5 w-full overflow-hidden rounded-2xl bg-secondary"',
  'className="relative aspect-square w-full overflow-hidden rounded-2xl bg-secondary"'
);

content = content.replace(
  'className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]"',
  'className="h-full w-full object-contain object-center p-6 sm:p-8 transition-transform duration-700 ease-out group-hover:scale-[1.04]"'
);

fs.writeFileSync("src/components/officeneed/ProductCard.tsx", content);
console.log("Updated ProductCard.tsx image container sizing and fitting.");
