const fs = require("fs");
let content = fs.readFileSync("src/lib/shopify-overlay.ts", "utf8");

content = content.replace(
  '...node.descriptionHtml ? { descriptionHtml: node.descriptionHtml } : {},',
  '...extracted,'
);
// In case it didn't have the comma
content = content.replace(
  '...node.descriptionHtml ? { descriptionHtml: node.descriptionHtml } : {}',
  '...extracted'
);
// In case it had extra spaces
content = content.replace(
  /...\(node\.descriptionHtml \? \{ descriptionHtml: node\.descriptionHtml \} : \{\}\),/g,
  '...extracted,'
);

fs.writeFileSync("src/lib/shopify-overlay.ts", content);
console.log("Updated object spread.");
