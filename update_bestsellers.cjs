const fs = require("fs");
let content = fs.readFileSync("src/components/officeneed/Bestsellers.tsx", "utf8");

content = content.replace(
  'className="relative aspect-4/5 w-full overflow-hidden rounded-2xl bg-secondary"',
  'className="relative aspect-square w-full overflow-hidden rounded-2xl bg-secondary"'
);

fs.writeFileSync("src/components/officeneed/Bestsellers.tsx", content);
console.log("Updated Bestsellers.tsx image container sizing.");
