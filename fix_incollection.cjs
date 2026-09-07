const fs = require("fs");
const path = "src/routes/products.index.tsx";
let content = fs.readFileSync(path, "utf8");

const oldLogic = `      const inCollection = isAllProducts || (missingMapping && p.subcategories?.includes(missingMapping)) || \n        (p.collectionHandles && p.collectionHandles.includes(collection)) ||\n        (taxonomyMatch?.node.title && p.category === taxonomyMatch.node.title) ||\n        (taxonomyMatch?.parentTitle && p.category === taxonomyMatch.parentTitle) ||\n        (taxonomyMatch?.node.title && p.subcategories?.includes(taxonomyMatch.node.title));`;

const newLogic = `      let inCollection = false;
      if (isAllProducts) {
        inCollection = true;
      } else if (missingMapping) {
        inCollection = !!p.subcategories?.includes(missingMapping);
      } else if (collection) {
        const hasShopifyCollection = !!(p.collectionHandles && p.collectionHandles.includes(collection));
        let hasLocalTaxonomy = false;
        if (taxonomyMatch) {
          if (taxonomyMatch.parentTitle) {
            // It's a subcategory
            hasLocalTaxonomy = !!p.subcategories?.includes(taxonomyMatch.node.title);
          } else {
            // It's a main category
            hasLocalTaxonomy = p.category === taxonomyMatch.node.title;
          }
        }
        inCollection = hasShopifyCollection || hasLocalTaxonomy;
      }`;

content = content.replace(oldLogic, newLogic);
fs.writeFileSync(path, content);
console.log("Fixed inCollection logic bug.");
