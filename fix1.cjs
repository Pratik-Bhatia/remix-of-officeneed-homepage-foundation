const fs = require("fs");
const path = "src/lib/shopify-overlay.ts";
let content = fs.readFileSync(path, "utf8");
content = content.replace(
  'const amount = parseFloat(node.priceRange?.minVariantPrice?.amount ?? "0");\n\n  return {\n    ...product,\n    name: node.title?.trim() || product.name,\n    ...extracted,',
  'const amount = parseFloat(node.priceRange?.minVariantPrice?.amount ?? "0");\n  const extracted = extractStructuredData(node.descriptionHtml || "");\n\n  return {\n    ...product,\n    name: node.title?.trim() || product.name,\n    ...extracted,'
);
fs.writeFileSync(path, content);
console.log("Fixed extracted in mergeProduct");
