const fs = require("fs");
const path = "src/components/officeneed/ChatWidget.tsx";
let text = fs.readFileSync(path, "utf8");

// 1. Add imports: products static list + useShopifyCatalogue + useQuery
text = text.replace(
  `import type { Product } from "@/lib/products";`,
  `import { products as staticProducts } from "@/lib/products";
import type { Product } from "@/lib/products";
import { useShopifyCatalogue } from "@/lib/shopify-overlay";`
);

// 2. Add catalogue hook right after the phase state line
text = text.replace(
  `  const [phase, setPhase] = useState<"qualification" | "refinement" | "enquiry" | "done" | "fragrance">("qualification");`,
  `  const [phase, setPhase] = useState<"qualification" | "refinement" | "enquiry" | "done" | "fragrance">("qualification");
  const catalogue = useShopifyCatalogue(staticProducts);`
);

// 3. Fix recommendProducts calls to pass catalogue
text = text.replace(
  `        const picks = recommendProducts(next);`,
  `        const picks = recommendProducts(catalogue, next);`
);
text = text.replace(
  `         const picks = recommendProducts(next, clean);`,
  `         const picks = recommendProducts(catalogue, next, clean);`
);

// 4. Fix FragranceQuiz to pass catalogue
text = text.replace(
  `products={[]}`,
  `products={catalogue}`
);

fs.writeFileSync(path, text);
console.log("Done. Checking results...");

// Verify
const t = fs.readFileSync(path, "utf8");
console.log("useShopifyCatalogue imported:", t.includes("useShopifyCatalogue"));
console.log("catalogue hook:", t.includes("const catalogue = useShopifyCatalogue"));
console.log("recommendProducts uses catalogue (1):", t.includes("recommendProducts(catalogue, next)"));
console.log("recommendProducts uses catalogue (2):", t.includes("recommendProducts(catalogue, next, clean)"));
console.log("FragranceQuiz gets catalogue:", t.includes("products={catalogue}"));
