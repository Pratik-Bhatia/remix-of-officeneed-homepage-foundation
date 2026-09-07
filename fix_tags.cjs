const fs = require("fs");
const path = "src/lib/shopify-overlay.ts";
let content = fs.readFileSync(path, "utf8");

const oldClassify = `function classify(node: ShopifyProductNode): { category: Product["category"]; sub: string } {
  const haystack = normalize(
    [node.title, node.productType, node.vendor, node.description?.slice(0, 120)]
      .filter(Boolean)
      .join(" "),
  );
  for (const rule of RULES) {
    if (rule.match.test(haystack)) return { category: rule.category, sub: rule.sub };
  }
  return {
    category: "Office Supplies", sub: "Office Supplies" };
}`;

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
  return {
    category: "Office Supplies", sub: "Office Supplies" };
}`;

content = content.replace(oldClassify, newClassify);
fs.writeFileSync(path, content);
console.log("Updated classify to respect Shopify tags.");
