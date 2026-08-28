const fs = require("fs");
let content = fs.readFileSync("src/lib/shopify-overlay.ts", "utf8");

content = content.replace(/collectionHandles: node\.collections\?\.edges\.map\(e => e\.node\.handle\) \?\? \[\],?\s*/g, '');

content = content.replace(/export function shopifyNodeToProduct\(node: ShopifyProductNode\): Product \{[\s\S]*?return \{/, `export function shopifyNodeToProduct(node: ShopifyProductNode): Product {
  const { category, sub } = classify(node);
  const images = nodeImages(node);
  const description = (node.description ?? "").trim();
  const summary = description
    ? truncateWords(description.replace(/\\s+/g, " "), 150)
    : \`\${node.title} — available through OfficeNeed.\`;
  const amount = parseFloat(node.priceRange?.minVariantPrice?.amount ?? "0");
  const variants = node.variants?.edges?.map((e) => e.node) ?? [];

  return {
    collectionHandles: node.collections?.edges.map(e => e.node.handle) ?? [],`);

fs.writeFileSync("src/lib/shopify-overlay.ts", content);
