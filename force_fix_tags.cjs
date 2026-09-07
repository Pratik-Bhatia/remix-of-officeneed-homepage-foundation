const fs = require("fs");
const path = "src/lib/shopify-overlay.ts";
let content = fs.readFileSync(path, "utf8");

const newClassify = `function classify(node: ShopifyProductNode): { category: Product["category"]; sub: string } {
  // First, respect Shopify tags if they exactly match a known subcategory
  if (node.tags && node.tags.length > 0) {
    for (const rule of RULES) {
      if (node.tags.some(tag => tag.toLowerCase() === rule.sub.toLowerCase())) {
        return { category: rule.category, sub: rule.sub };
      }
    }
  }

  const haystack = normalize(
    [node.title, node.productType, node.vendor, node.description?.slice(0, 120), ...(node.tags || [])]
      .filter(Boolean)
      .join(" "),
  );
  for (const rule of RULES) {
    if (rule.match.test(haystack)) return { category: rule.category, sub: rule.sub };
  }
  return { category: "Office Supplies", sub: "Office Supplies" };
}`;

// I will just use regex to replace everything from "function classify" to the next "/** Trim to a length"
content = content.replace(/function classify\([\s\S]*?return \{\s*category: "Office Supplies", sub: "Office Supplies" \};\s*\}/, newClassify);

fs.writeFileSync(path, content);
console.log("Actually updated classify this time.");
