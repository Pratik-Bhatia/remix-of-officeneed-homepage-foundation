const fs = require("fs");
let content = fs.readFileSync("src/routes/products.index.tsx", "utf8");

content = content.replace(
  'const inCollection = isAllProducts || (p.collectionHandles && p.collectionHandles.includes(collection));',
  `const inCollection = isAllProducts || 
        (p.collectionHandles && p.collectionHandles.includes(collection)) ||
        (taxonomyMatch?.node.title && p.category === taxonomyMatch.node.title) ||
        (taxonomyMatch?.parentTitle && p.category === taxonomyMatch.parentTitle);`
);

fs.writeFileSync("src/routes/products.index.tsx", content);
console.log("Updated product filtering in products.index.tsx.");
