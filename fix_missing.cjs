const fs = require("fs");
const path = "src/routes/products.index.tsx";
let content = fs.readFileSync(path, "utf8");

content = content.replace(
  'if (missingMapping) return [];',
  ''
);

content = content.replace(
  'const inCollection = isAllProducts ||',
  'const inCollection = isAllProducts || (missingMapping && p.subcategories?.includes(missingMapping)) ||'
);

content = content.replace(
  '{missingMapping ? (\n                  <div className="py-12 text-center border rounded-lg bg-secondary/20">\n                    <h3 className="text-lg font-medium text-foreground mb-2">Configuration Missing</h3>\n                    <p className="text-sm text-muted-foreground max-w-md mx-auto">\n                      The Shopify collection mapping for <strong>"{missingMapping}"</strong> is not yet configured. \nPlease create a collection in Shopify and map its handle in the taxonomy.\n                    </p>\n                  </div>\n                ) : visible.length === 0 ? (',
  '{visible.length === 0 ? ('
);

fs.writeFileSync(path, content);
console.log("Fixed missingMapping block.");
