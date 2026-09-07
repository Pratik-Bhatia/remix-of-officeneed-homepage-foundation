const fs = require("fs");
const path = "src/components/officeneed/FragranceQuiz.tsx";
let text = fs.readFileSync(path, "utf8");

text = text.replace(
  'import type { Product } from "@/lib/products";',
  'import type { Product } from "@/lib/products";\nimport citrusIcon from "@/assets/fragrance/citrus.png";\nimport woodyIcon from "@/assets/fragrance/woody.png";\nimport { Flower2 } from "lucide-react";'
);

fs.writeFileSync(path, text);
console.log("Fixed imports!");
