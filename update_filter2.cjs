const fs = require("fs");
let content = fs.readFileSync("src/routes/products.index.tsx", "utf8");

content = content.replace(
  'const inCollection = isAllProducts || \n        (p.collectionHandles && p.collectionHandles.includes(collection)) ||\n        (taxonomyMatch?.node.title && p.category === taxonomyMatch.node.title) ||\n        (taxonomyMatch?.parentTitle && p.category === taxonomyMatch.parentTitle);',
  `const inCollection = isAllProducts || 
        (p.collectionHandles && p.collectionHandles.includes(collection)) ||
        (taxonomyMatch?.node.title && p.category === taxonomyMatch.node.title) ||
        (taxonomyMatch?.parentTitle && p.category === taxonomyMatch.parentTitle) ||
        (taxonomyMatch?.node.title && p.subcategories?.includes(taxonomyMatch.node.title));`
);

fs.writeFileSync("src/routes/products.index.tsx", content);
console.log("Updated product filtering again in products.index.tsx.");
